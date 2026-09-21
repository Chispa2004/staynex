// Local-only HTTP transport backed by real, disposable PostgreSQL.
// Product Auth handlers/RPCs/RLS are unchanged. This is NOT remote Supabase Auth.
const { createDisposablePostgres } = require('../ci/disposable-postgres.cjs');
const fs=require('node:fs'), http=require('node:http'), cp=require('node:child_process'), assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const identities=Object.fromEntries(['staynex','cadena','direccion','recepcion','independiente','otra','invitado'].map((name,i)=>[name,{id:id(101+i),email:`${name}@synthetic.invalid`,email_confirmed_at:'2026-09-21T00:00:00Z',app_metadata:{},user_metadata:{full_name:`${name} · PRUEBA`}}]));
const quote=v=>v==null?'null':`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const identifier=s=>{assert.match(s,/^[a-z_][a-z0-9_]*$/i);return `"${s}"`;};
exports.start = async env => {
  assert.equal(env.SEND_AUTOMATIONS,'false');
  const pg=createDisposablePostgres({env});
  const sql=input=>cp.execFileSync(pg.docker,[...pg.host,'exec','-i',pg.container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000}).trim();
  try {
    const test=fs.readFileSync('scripts/test-organization-postgres.cjs','utf8');
    const schema=test.slice(test.indexOf('create role anon;'),test.indexOf('    insert into hotels(id,name)'));
    sql(schema);
    sql(fs.readFileSync('supabase/sql/create_enterprise_audit_logs.sql','utf8'));
    sql(`grant all on enterprise_audit_logs to service_role;
      insert into hotels(id,name,slug,timezone) values(${quote(id(11))},'Legado de prueba','legado-prueba','Europe/Madrid');
      insert into auth.users(id,email) values ${Object.entries(identities).filter(([name])=>name!=='invitado').map(([,u])=>`(${quote(u.id)},${quote(u.email)})`).join(',')};
      insert into hotel_users(hotel_id,user_id,email,role,platform_role) values(${quote(id(11))},${quote(identities.staynex.id)},${quote(identities.staynex.email)},'owner','platform_admin');`);
    sql(fs.readFileSync('supabase/sql/rls_phase_2_write_protection.sql','utf8'));
    sql(fs.readFileSync('supabase/sql/add_organizations.sql','utf8'));
    const tables=new Set(['hotels','hotel_users','organizations','organization_users','tickets','conversations','platform_audit_logs','enterprise_audit_logs','hotel_onboarding_state']);
    const rpc=new Set(['staynex_manage_organization','staynex_accept_organization_invitations','staynex_create_organization_hotel','staynex_invite_hotel_user']);
    const calls=[];
    const send=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
    const server=http.createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,'http://127.0.0.1');
        if(url.pathname==='/auth/v1/user') {
          const name=String(req.headers.authorization||'').replace('Bearer onboarding-','');
          const user=identities[name];
          // Choosing the invited test profile simulates a verified Auth registration.
          if(name==='invitado') sql(`insert into auth.users(id,email) values(${quote(user.id)},${quote(user.email)}) on conflict(id) do nothing;`);
          return send(res,user?200:401,user||{message:'Invalid synthetic identity'});
        }
        assert.equal(req.headers.apikey,'local-service-fixture');
        let raw='';for await(const chunk of req)raw+=chunk;
        const body=raw?JSON.parse(raw):null;
        const table=url.pathname.replace('/rest/v1/','');
        calls.push({table,method:req.method,params:[...url.searchParams],body});
        if(table.startsWith('rpc/')) {
          const fn=table.slice(4);assert.ok(rpc.has(fn));
          const result=sql(`set role service_role;select ${identifier(fn)}(${Object.entries(body).map(([k,v])=>`${identifier(k)} => ${quote(v)}`).join(',')});`);
          return send(res,200,result?JSON.parse(result):null);
        }
        assert.ok(tables.has(table),`Unsupported local fixture table ${table}`);
        const filter=(k,v)=>{
          const col=identifier(k);
          if(v==='is.null')return `${col} is null`;
          if(v==='not.is.null')return `${col} is not null`;
          if(v.startsWith('eq.'))return `${col}=${quote(v.slice(3))}`;
          if(v.startsWith('neq.'))return `${col}<>${quote(v.slice(4))}`;
          if(v.startsWith('in.('))return `${col} in (${v.slice(4,-1).split(',').map(x=>quote(x.replaceAll('"',''))).join(',')})`;
          throw Error(`Unsupported fixture filter ${k} ${v}`);
        };
        const where=[...url.searchParams].filter(([k])=>!['select','order','limit','offset'].includes(k)).map(([k,v])=>k==='or'?`(${v.slice(1,-1).split(',').map(x=>{const pos=x.indexOf('.');return filter(x.slice(0,pos),x.slice(pos+1));}).join(' or ')})`:filter(k,v)).join(' and ')||'true';
        let query;
        if(req.method==='GET'||req.method==='HEAD')query=`select * from ${identifier(table)} where ${where}`;
        else if(req.method==='POST')query=`insert into ${identifier(table)}(${Object.keys(body).map(identifier).join(',')}) values(${Object.values(body).map(quote).join(',')}) returning *`;
        else if(req.method==='PATCH')query=`update ${identifier(table)} set ${Object.entries(body).map(([k,v])=>`${identifier(k)}=${quote(v)}`).join(',')} where ${where} returning *`;
        else throw Error('Fixture method not allowed');
        let data=JSON.parse(sql(`set role service_role;with result as (${query}) select coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) from result;`));
        const total=data.length;
        if(req.method==='GET') {
          const order=url.searchParams.get('order');if(order) {const key=order.split('.')[0];data.sort((a,b)=>String(a[key]).localeCompare(String(b[key])));}
          const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);data=data.slice(offset,offset+limit);
        }
        const select=url.searchParams.get('select')||'';
        for(const [marker,table2,key,alias]of [['hotel:hotels','hotels','hotel_id','hotel'],['organization:organizations','organizations','organization_id','organization']]) {
          if(select.includes(marker))for(const row of data)row[alias]=row[key]?JSON.parse(sql(`select to_jsonb(t) from ${table2} t where id=${quote(row[key])};`)||'null'):null;
        }
        if(req.headers.prefer?.includes('count=exact'))res.setHeader('content-range',`0-${Math.max(total-1,0)}/${total}`);
        if(req.headers.accept?.includes('vnd.pgrst.object')) {
          if(data.length!==1)return send(res,406,{code:'PGRST116',details:`The result contains ${data.length} rows`,message:'JSON object requested'});
          return send(res,200,data[0]);
        }
        send(res,200,data);
      } catch(error) { console.error('Local fixture:',error.stderr?.toString()||error.message);send(res,400,{message:error.stderr?.toString()||error.message}); }
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    return {port:server.address().port,sql,calls,identities,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));pg.cleanup();}};
  } catch(error){pg.cleanup();throw error;}
};
