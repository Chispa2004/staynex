// Test-only HTTP host for unmodified route modules. Auth verification and SQL transport
// are injected; tenant resolution, permissions, DTOs, reads and RPC bodies are real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
exports.runDemoRoutesIntegration=async({pg,env,root,hotelId,otherHotelId,actorId,fixture})=>{
  assert.equal(typeof vm.SourceTextModule,'function','Run with --experimental-vm-modules');
  process.env.SEND_AUTOMATIONS='false';process.env.USE_MOCK_AI='true';process.env.GUEST_MEMORY_ENABLED='false';
  const evidence=path.join(root,'.npm-cache/demo-message-stages/integrated');fs.mkdirSync(evidence,{recursive:true});
  let sequence=0;const calls=[],results=[];
  const quote=v=>v===null?'null':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
  const ident=v=>{assert.match(v,/^[a-z_][a-z_0-9]*$/);return '"'+v+'"';};
  const query=text=>{
    let output='',error=null;
    try{output=execFileSync(pg.docker,[...pg.host,'exec','-i',pg.container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{input:text,env,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000});}
    catch(e){output=String(e.stdout||'')+String(e.stderr||'');error={code:output.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]||'XX000',message:output};}
    fs.writeFileSync(path.join(evidence,`${++sequence}.log`),text+'\n'+output);return {data:error?null:output.trim(),error};
  };
  const must=text=>{const r=query(text);assert.equal(r.error,null,r.error?.message);return r.data;};
  const otherActor='55555555-5555-4555-8555-555555555555';
  must(`grant select on all tables in schema public to service_role;insert into hotel_users(hotel_id,user_id,role,status,platform_role) values('${otherHotelId}','${otherActor}','receptionist','active','none');`);
  const client={auth:{getUser:async token=>({data:{user:token==='synthetic-a'?{id:actorId}:token==='synthetic-b'?{id:otherActor}:null},error:['synthetic-a','synthetic-b'].includes(token)?null:{message:'Invalid synthetic session'}})},
    from(table){
      const filters=[],orders=[];let columns='*',limit=null,options={},one=false;
      const field=k=>'t.'+ident(k);
      const chain={
        select(s,o={}){columns=s;options=o;return chain;},eq(k,v){filters.push(field(k)+'='+quote(v));return chain;},
        in(k,vs){filters.push(vs.length?field(k)+' in ('+vs.map(quote).join(',')+')':'false');return chain;},
        or(expression){filters.push('('+expression.split(',').map(term=>{const [k,op,...v]=term.split('.');assert.equal(op,'eq');return field(k)+'='+quote(v.join('.'));}).join(' or ')+')');return chain;},
        order(k,o={}){orders.push(field(k)+(o.ascending===false?' desc':' asc')+(o.nullsFirst===true?' nulls first':o.nullsFirst===false?' nulls last':''));return chain;},
        limit(n){assert.ok(Number.isSafeInteger(n));limit=n;return chain;},maybeSingle(){one=true;return chain;},single(){one=true;return chain;},
        then(resolve,reject){try{
          calls.push({table,columns,filters});
          const selection=columns==='*, hotel:hotels(*)'?"t.*,(select row_to_json(h) from public.hotels h where h.id=t.hotel_id) as hotel":columns==='*'?'t.*':columns.split(',').map(c=>field(c.trim())).join(',');
          const from=` from public.${ident(table)} t`+(filters.length?' where '+filters.join(' and '):'');
          const q=`select ${selection}${from}`+(orders.length?' order by '+orders.join(','):'')+(limit!==null?' limit '+limit:'');
          const r=query(`set role service_role;with rows as (${q}) select json_build_object('data',coalesce((select json_agg(rows) from rows),'[]'::json),'count',${options.count==='exact'?'(select count(*)'+from+')':'null'});`);
          if(r.error)return resolve({data:null,error:r.error,count:null});
          const result=JSON.parse(r.data);resolve({data:one?result.data[0]||null:result.data,count:result.count,error:null});
        }catch(error){reject(error);}}
      };return chain;
    },
    async rpc(name,args){assert.ok(['staynex_attention_dashboard_v2','staynex_attention_read_v1','staynex_attention_transition_v1'].includes(name));calls.push({rpc:name,args});
      const values=Object.entries(args).map(([k,v])=>ident(k)+'=>'+(k==='p_ids'?'array['+v.map(quote).join(',')+']::uuid[]':quote(v)));
      const r=query(`set role service_role;select public.${ident(name)}(${values.join(',')});`);return {data:r.error?null:JSON.parse(r.data),error:r.error};
    }
  };
  // Modules are read directly from this checkout; no edited route copies or test
  // endpoints are added to dashboard/. SyntheticModule replaces only infrastructure.
  const modules=new Map();
  const synthetic=(id,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{identifier:id});
  const next=await import(require('node:url').pathToFileURL(path.join(root,'dashboard/node_modules/next/server.js')).href);
  const load=id=>{
    if(modules.has(id))return modules.get(id);
    let m;
    if(id==='next/server')m=synthetic(id,{NextResponse:next.NextResponse});
    else if(id===path.join(root,'dashboard/lib/supabase.js'))m=synthetic(id,{getSupabaseAdmin:()=>client});
    else {assert.ok(id.startsWith(root+path.sep));m=new vm.SourceTextModule(fs.readFileSync(id,'utf8'),{identifier:id});}
    modules.set(id,m);return m;
  };
  const linker=(specifier,ref)=>{
    if(specifier==='next/server')return load(specifier);
    let target=specifier.startsWith('@/')?path.join(root,'dashboard',specifier.slice(2)):path.resolve(path.dirname(ref.identifier),specifier);
    if(!path.extname(target))target+='.js';return load(target);
  };
  const routes={};
  for(const [url,file,method] of [['/api/executive-dashboard','executive-dashboard','GET'],['/api/inbox','inbox','GET'],['/api/inbox/attention','inbox/attention','POST']]){
    const m=load(path.join(root,`dashboard/app/api/${file}/route.js`));if(m.status==='unlinked')await m.link(linker);if(m.status==='linked')await m.evaluate();routes[url]=m.namespace[method];
  }
  const server=http.createServer(async(req,res)=>{
    try{const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const url=new URL(req.url,'http://127.0.0.1');assert.ok(routes[url.pathname]);
      const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
      const response=await routes[url.pathname](request);res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());
    }catch(error){res.writeHead(500);res.end(JSON.stringify({testHostError:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(url,{token='synthetic-a',hotel=hotelId,body}={})=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),'x-staynex-hotel-id':hotel,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  const check=async(name,fn)=>{await fn();results.push({name,status:'PASS'});console.log('PASS HTTP '+name);};
  const extra='66666666-6666-4666-8666-666666666666',operation='77777777-7777-4777-8777-777777777777';
  try{
    await check('Anonymous/invalid session denied before RPC',async()=>{for(const token of [null,'invalid']){const before=calls.filter(c=>c.rpc).length;assert.equal((await request('/api/executive-dashboard?attentionOrigin=simulated',{token})).status,403);assert.equal(calls.filter(c=>c.rpc).length,before);}});
    let workspace;
    await check('Dashboard route -> authorized hotel -> real v2 -> DTO: 3/1/2/1',async()=>{const r=await request('/api/executive-dashboard?attentionOrigin=simulated');assert.equal(r.status,200,JSON.stringify(r.body));workspace=r.body.conversationDashboard.messageWorkspace;assert.deepEqual(Object.values(workspace.counters).map(c=>c.value),[3,1,2,1]);assert.deepEqual(workspace.messages.map(m=>m.guest),['Carlos Ruiz','Ana López','Lucía Martín']);});
    await check('Real Inbox route returns all three identities, original text and UUIDs',async()=>{const r=await request('/api/inbox');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.conversations.length,3);for(const row of workspace.messages){const c=r.body.conversations.find(c=>c.id===row.conversationId);assert.equal(c.guestName,row.guest);assert.equal(c.hotel_id,hotelId);assert.equal(c.messages[0].id,row.id);assert.equal(c.messages[0].content,row.title);}});
    await check('Attention route reads the same persisted pending/resolved states',async()=>{for(const row of workspace.messages){const r=await request('/api/inbox/attention',{body:{action:'read',conversationId:row.conversationId,messageIds:[row.id]}});assert.equal(r.status,200);assert.equal(r.body.items[0].status,row.status==='Resuelto'?'resolved':'pending');}});
    await check('Manipulated hotel does not widen access; hotel B cannot read hotel A',async()=>{const r=await request('/api/executive-dashboard?hotelId='+otherHotelId+'&attentionOrigin=simulated',{hotel:otherHotelId});assert.equal(r.body.hotel.id,hotelId);const b=await request('/api/inbox',{token:'synthetic-b',hotel:hotelId});assert.equal(b.status,200);assert.equal(b.body.hotelId,otherHotelId);assert.equal(b.body.conversations.length,0);const row=workspace.messages[0];assert.equal((await request('/api/inbox/attention',{token:'synthetic-b',body:{action:'read',conversationId:row.conversationId,messageIds:[row.id]}})).status,403);});
    await check('HTTP responses reflect a fresh insert and authorized explicit resolution',async()=>{
      const c=fixture.cases[0];must(`insert into messages(id,hotel_id,conversation_id,sender_type,content,metadata) values('${extra}','${hotelId}','${c.conversationId}','guest','HTTP synthetic live insert','{"demo":true}');`);
      let r=await request('/api/executive-dashboard?attentionOrigin=simulated');assert.equal(r.body.conversationDashboard.messageWorkspace.counters.received.value,4);
      r=await request('/api/inbox/attention',{body:{action:'resolved',conversationId:c.conversationId,operationId:operation,items:[{messageId:extra,expectedStatus:'pending',expectedVersion:1}]}});assert.equal(r.status,200,JSON.stringify(r.body));
      r=await request('/api/executive-dashboard?attentionOrigin=simulated');assert.deepEqual(Object.values(r.body.conversationDashboard.messageWorkspace.counters).map(c=>c.value),[4,2,2,1]);
    });
    await check('Origin and urgent filters use the real route and same SQL source',async()=>{const r=await request('/api/executive-dashboard?attentionOrigin=simulated&attentionUrgent=true');assert.deepEqual(r.body.conversationDashboard.messageWorkspace.messages.map(m=>m.guest),['Carlos Ruiz']);assert.equal((await request('/api/executive-dashboard')).body.conversationDashboard.messageWorkspace.counters.received.value,0);});
  }finally{
    await new Promise(resolve=>server.close(resolve));
    must(`delete from enterprise_audit_logs where hotel_id='${hotelId}' and entity_id='${operation}';delete from messages where hotel_id='${hotelId}' and id='${extra}';delete from hotel_users where user_id='${otherActor}' and hotel_id='${otherHotelId}';`);
    fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({results,transport:'HTTP route handlers + psql; synthetic auth token verification; no Supabase Auth/PostgREST/Realtime',calls},null,2));
  }
};
