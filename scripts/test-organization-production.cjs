// Real Next production handlers over HTTP. Only the Auth/PostgREST transport is
// substituted by a loopback fixture; no product auth or route code is replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
assert.equal(process.env.SEND_AUTOMATIONS, 'false');
assert.ok(process.env.NODE_OPTIONS?.includes('isolate.cjs'), 'Run through ci:dashboard');
assert.equal(process.env.NEXT_PUBLIC_STAYNEX_LOCAL_REVIEW, undefined);
const root = path.resolve(__dirname, '..');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A,B,H1,H2,H3,U,M,INTERNAL] = [1,2,11,12,21,101,102,103].map(id);
const organizations = [{id:A,name:'Synthetic A',kind:'chain',status:'active'}, {id:B,name:'Synthetic B',kind:'chain',status:'active'}];
const hotels = [H1,H2,H3].map((h,i)=>({id:h,name:`Synthetic hotel ${i}`,organization_id:i===2?B:A,metadata:{},timezone:'Europe/Madrid'}));
const member = (org,user,role='member')=>({id:`${org}-${user}`,organization_id:org,user_id:user,email:`${user}@synthetic.invalid`,role,status:'active'});
const memberships = [member(A,U,'org_admin'),member(A,M),member(B,M)];
const assignment = (h,u,role,origin=null,platform='none')=>({id:`${h}-${u}-${origin||'independent'}`,hotel_id:h,user_id:u,email:`${u}@synthetic.invalid`,role,organization_user_id:origin,organization_grant_revoked:false,platform_role:platform,status:'active',is_default:h===H1});
const assignments = [assignment(H1,U,'admin',memberships[0].id),assignment(H2,U,'admin',memberships[0].id),assignment(H1,U,'receptionist'),assignment(H1,M,'admin'),assignment(H3,M,'manager'),assignment(H1,INTERNAL,'owner',null,'platform_admin')];
const tickets = [H1,H3].map((h,i)=>({id:id(500+i),hotel_id:h,status:'open',priority:i?'normal':'urgent',conversation_id:id(600+i),title:`Synthetic ${i}`}));
const rows = {organizations,hotels,organization_users:memberships,hotel_users:assignments,tickets,messages:[],enterprise_audit_logs:[]};
const calls=[]; let serverLog='', child;
const response=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
const fixture = http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/auth/v1/user') {
      const user=({'Bearer proof-a':U,'Bearer proof-mixed':M,'Bearer proof-internal':INTERNAL})[req.headers.authorization];
      return response(res,user?200:401,user?{id:user,email:`${user}@synthetic.invalid`,email_confirmed_at:'2026-09-01T00:00:00Z',app_metadata:{},user_metadata:{}}:{message:'Invalid test session'});
    }
    assert.equal(req.headers.apikey,'local-service-fixture');
    let body=''; for await (const chunk of req) body+=chunk;
    const payload=body?JSON.parse(body):null;
    const table=url.pathname.replace('/rest/v1/','');
    calls.push({table,method:req.method,params:[...url.searchParams],payload});
    if(table==='rpc/staynex_accept_organization_invitations') return response(res,200,null);
    assert.ok(rows[table],`Unexpected fixture table: ${table}`);
    const filters=[...url.searchParams].filter(([k])=>!['select','order','offset','limit'].includes(k));
    const matches=row=>filters.every(([key,value])=>{
      if(value.startsWith('eq.')) return String(row[key])===value.slice(3);
      if(value.startsWith('is.')) return value==='is.null'&&row[key]==null;
      if(value.startsWith('in.(')) return value.slice(4,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(row[key]));
      throw Error(`Unsupported fixture filter ${key}=${value}`);
    });
    let data=rows[table].filter(matches);
    if(req.method==='POST') {data=[{id:id(900+rows[table].length),platform_role:'none',organization_user_id:null,...payload}];rows[table].push(...data);}
    if(req.method==='PATCH') data.forEach(row=>Object.assign(row,payload));
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
    data=data.slice(offset,offset+limit).map(row=>({...row}));
    const select=url.searchParams.get('select')||'';
    if(select.includes('hotel:hotels')) data=data.map(row=>({...row,hotel:hotels.find(h=>h.id===row.hotel_id)}));
    if(select.includes('organization:organizations')) data=data.map(row=>({...row,organization:organizations.find(o=>o.id===row.organization_id)}));
    if(req.headers.accept?.includes('vnd.pgrst.object')) {
      if(data.length!==1) return response(res,406,{code:'PGRST116',details:`The result contains ${data.length} rows`,message:'JSON object requested'});
      return response(res,200,data[0]);
    }
    return response(res,200,data);
  } catch(error) {response(res,500,{message:error.message});}
});
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;};
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
(async()=>{
  try {
    for(const file of [...files(path.join(root,'dashboard/.next/static')),...files(path.join(root,'dashboard/.next/server/app'))].filter(f=>/\.(js|html)$/.test(f))) {
      const content=fs.readFileSync(file,'utf8');
      for(const marker of ['LABORATORIO SINTÉTICO','local-review-token','LocalReviewNetworkBoundary','profile=staynex']) assert.ok(!content.includes(marker),`Lab marker in production asset ${file}`);
    }
    console.log('PASS production artifacts: no profile toolbar, synthetic session or review boundary');
    const authPort=await listen(fixture);
    const reserve=http.createServer();const appPort=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
    child=spawn(process.execPath,[path.join(root,'dashboard/node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(appPort)],{
      cwd:path.join(root,'dashboard'),env:{...process.env,NODE_ENV:'production',SUPABASE_URL:`http://127.0.0.1:${authPort}`,SUPABASE_SERVICE_ROLE_KEY:'local-service-fixture'},stdio:['ignore','pipe','pipe']
    });
    child.stdout.on('data',x=>serverLog+=x);child.stderr.on('data',x=>serverLog+=x);
    const base=`http://127.0.0.1:${appPort}`;
    let ready=false;for(let n=0;n<120;n++){try{await fetch(base+'/login',{signal:AbortSignal.timeout(1000)});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
    assert.ok(ready,'Production server did not start');
    const request=async (route,{token='proof-a',method='GET',body,headers={}}={})=>{
      const res=await fetch(base+route,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
      return {status:res.status,body:await res.json()};
    };
    // None of these client-controlled values is an identity source.
    const spoof={'x-staynex-hotel-id':H1,'x-user-id':INTERNAL,'x-platform-role':'platform_admin',cookie:`staynex_active_hotel_id=${H1}; profile=staynex; role=platform_admin`};
    for(const token of [null,'local-review-token','forged']) {
      assert.equal((await request(`/api/current-hotel?profile=staynex&hotelId=${H1}&organizationId=${A}`,{token,headers:spoof})).status,401);
      assert.equal((await request('/api/current-hotel',{token,method:'POST',headers:spoof,body:{hotelId:H1,user_id:INTERNAL,platformRole:'platform_admin',profile:'staynex'}})).status,401);
      assert.equal((await request(`/api/organizations?profile=staynex&organizationId=${A}`,{token,headers:spoof})).status,401);
    }
    assert.equal(calls.length,0,'Unauthenticated requests must not reach data queries');
    console.log('PASS production HTTP: query/header/cookie/body/profile spoofing grants no session');
    let result=await request(`/api/organizations?organizationId=${A}&profile=staynex`,{headers:spoof});
    assert.equal(result.status,200);assert.equal(result.body.platformRole,'none');assert.equal(result.body.canManage,false);
    assert.deepEqual(result.body.hotels.map(h=>h.id),[H1,H2]);assert.equal(result.body.metrics.people,2);assert.equal(result.body.metrics.assignments,4);
    assert.equal((await request('/api/organizations?platform=1&profile=staynex')).status,403);
    assert.equal((await request(`/api/organizations?organizationId=${B}`)).status,403);
    assert.equal((await request('/api/organizations',{method:'POST',body:{action:'member',payload:{p_actor:INTERNAL,role:'org_admin'}}})).status,403);
    for(const options of [{route:`/api/current-hotel?hotelId=${H3}`},{route:'/api/current-hotel',headers:{'x-staynex-hotel-id':H3}},{route:'/api/current-hotel',headers:{cookie:`staynex_active_hotel_id=${H3}`}}]) {
      assert.equal((await request(options.route,options)).status,403);
    }
    assert.equal((await request(`/api/current-hotel?hotelId=${H3}`,{token:'proof-mixed'})).body.role,'manager');
    assert.equal((await request(`/api/settings/users?hotelId=${H3}`,{token:'proof-mixed',method:'POST',body:{email:'new@synthetic.invalid',role:'admin'}})).status,403);
    console.log('PASS production HTTP: scoped directory/metrics, internal role denial, explicit hotel denial and mixed roles');
    calls.length=0;
    assert.equal((await request(`/api/tickets?hotelId=${H1}`)).body.tickets.length,1);
    assert.equal((await request(`/api/tickets/${tickets[1].id}?hotelId=${H1}`)).status,404);
    assert.equal((await request(`/api/tickets/${tickets[1].id}/status?hotelId=${H1}`,{method:'PATCH',body:{status:'completed',hotel_id:H3}})).status,404);
    assert.equal(tickets[1].status,'open');
    for(const call of calls.filter(c=>['tickets','messages'].includes(c.table))) assert.ok(call.params.some(([k,v])=>k==='hotel_id'&&v===`eq.${H1}`),'Nested resource must be scoped in the query');
    assert.equal((await request(`/api/settings/users?hotelId=${H1}`,{method:'POST',body:{email:'new@synthetic.invalid',role:'platform_admin'}})).status,400);
    assert.equal((await request(`/api/settings/users?hotelId=${H1}`,{method:'POST',body:{email:'new@synthetic.invalid',role:'receptionist',hotel_id:H3,user_id:INTERNAL,platform_role:'platform_admin',organization_user_id:'forged'}})).status,200);
    const created=assignments.at(-1);assert.equal(created.hotel_id,H1);assert.equal(created.platform_role,'none');assert.equal(created.user_id,undefined);assert.equal(created.organization_user_id,null);
    for(const assignmentId of [assignments[0].id,assignments[5].id,assignments[4].id]) {
      assert.notEqual((await request(`/api/settings/users?hotelId=${H1}`,{method:'PATCH',body:{id:assignmentId,status:'active',role:'admin',hotel_id:H1}})).status,200);
      assert.notEqual((await request(`/api/settings/users?hotelId=${H1}`,{method:'DELETE',body:{id:assignmentId}})).status,200);
    }
    console.log('PASS production HTTP: nested reads/writes and team create/update/revoke cannot cross scope or modify privileged grants');
    // Same token, cookie and stale URL after authoritative access changes.
    const stale=`/api/current-hotel?hotelId=${H1}`;
    assert.equal((await request(stale)).body.role,'admin');
    memberships[0].role='member';
    assert.equal((await request(stale)).body.role,'receptionist');
    assert.equal((await request(`/api/settings/users?hotelId=${H1}`)).status,403);
    memberships[0].status='disabled';calls.length=0;
    for(const route of [stale,`/api/tickets?hotelId=${H1}`,`/api/settings/users?hotelId=${H1}`,`/api/organizations?organizationId=${A}`]) assert.equal((await request(route,{headers:{cookie:`staynex_active_hotel_id=${H1}`}})).status,403,route);
    assert.equal((await request(`/api/tickets/${tickets[0].id}/status?hotelId=${H1}`,{method:'PATCH',body:{status:'completed'}})).status,403);
    assert.equal((await request(`/api/settings/users?hotelId=${H1}`,{method:'POST',body:{email:'stale@synthetic.invalid',role:'admin'}})).status,403);
    assert.equal(calls.filter(c=>c.table==='tickets'||(c.table==='hotel_users'&&c.method!=='GET')).length,0,'Revocation must stop operational queries/writes');
    assert.equal((await request(`/api/current-hotel?hotelId=${H3}`,{token:'proof-internal'})).body.user.id,INTERNAL);
    assert.ok(rows.enterprise_audit_logs.some(a=>a.actor_user_id===INTERNAL&&a.hotel_id===H3&&a.action==='workspace_opened'));
    console.log('PASS production HTTP: stale session/URL denied after revocation, independent role only while valid, internal identity audited');
    console.log('Organization production proof PASS. Local transport fixture, not remote Auth; zero providers.');
  } catch(error) {console.error(serverLog.slice(-6000));throw error;}
  finally { if(child){child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);}fixture.closeAllConnections();await new Promise(r=>fixture.close(r)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
