import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUbikosObservationReader} from '../src/services/pms/ubikos/observation-reader.js';
import {createUbikosObservationHandler} from '../dashboard/lib/ubikos-observations-server.js';
import {canAccess} from '../dashboard/lib/permissions.js';
import {readUbikosJson} from '../src/services/pms/ubikos/bounded-json-read.js';

globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const hotelId='00000000-0000-4000-8000-000000000001',connectionId='00000000-0000-4000-8000-000000000002';
const secret='FICTIONAL-SECRET-NEVER-LOG', pii='PERSON_PRIVATE@example.invalid';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function setup(fetchImpl, settings={}, overrides={}) {
  const logs=[];let calls=0;
  const reader=createUbikosObservationReader({enabled:true,hotelId,connectionId,apiKey:secret,...settings,
    fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
  const query={select(){return query;},eq(){return query;},limit:async()=>({data:[{
    id:connectionId,hotel_id:hotelId,provider:'ubikos',enabled:true,metadata:{property_id:'10318'}}]})};
  const handler=createUbikosObservationHandler({getContext:async()=>({hotel:{id:hotelId,name:'Ficticio'},
    user:{id:'synthetic'},role:'admin',supabase:{from:()=>query}}),canAccess,assertContext:()=>{},reader,
    logDiagnostic:entry=>logs.push(entry),...overrides});
  const run=async()=>{
    const response=await handler(new Request('http://localhost/api/pms-connections/ubikos/observations',{
      method:'POST',headers:{'x-staynex-hotel-id':hotelId,'x-request-id':secret},
      body:JSON.stringify({connectionId,operation:'inhouse'})}));
    return {response,body:await response.json()};
  };
  return {logs,run,get calls(){return calls;}};
}
function check(f,res,{http=null,code,stage,started=true,status=503}) {
  assert.equal(res.response.status,status);
  assert.deepEqual(Object.keys(res.body).sort(),['code','diagnosticId','ok']);
  assert.equal(res.body.ok,false);assert.match(res.body.diagnosticId,uuid);
  assert.equal(f.logs.length,1);
  const d=f.logs[0];assert.equal(d.diagnosticId,res.body.diagnosticId);
  assert.equal(d.dashboardHttp,status);assert.equal(d.providerHttp,http);
  assert.equal(d.technicalCode,code);assert.equal(d.failureStage,stage);
  assert.equal(d.transportStarted,started);assert.equal(d.httpResponseReceived,http!==null);
  assert.ok(Number.isFinite(Date.parse(d.startedAtUtc)));assert.ok(d.durationMs>=0);
  assert.equal(f.calls,started?1:0);
  assert.deepEqual(Object.keys(d).sort(),['event','diagnosticId','startedAtUtc','durationMs','dashboardHttp',
    'failureStage','transportStarted','httpResponseReceived','providerHttp','providerDurationMs',
    'technicalCode','providerReportedCategory'].sort());
  const output=JSON.stringify([f.logs,res.body]);
  for(const value of [secret,pii,'ubikos-api-key','https://api.ubikos.es','BOOKING_ID','ROOM_ID','stack'])
    assert.ok(!output.includes(value),value);
}
for(const http of [400,401,403,429,500])test(`private diagnostic preserves provider HTTP ${http}, not Dashboard 503`,async()=>{
  const f=setup(async()=>Response.json({error:'bad_request',message:secret,guest:pii},{status:http}));
  check(f,await f.run(),{http,stage:'http',code:({401:'UBIKOS_AUTH_REJECTED',403:'UBIKOS_FORBIDDEN_AUTH_OR_IP',429:'UBIKOS_RATE_LIMITED'})[http]||'UBIKOS_HTTP_FAILED'});
  assert.equal(f.logs[0].providerReportedCategory,'REQUEST_VALIDATION_REPORTED');
});
test('network/TLS failure cannot assert provider HTTP or leak raw exception',async()=>{
  const f=setup(async()=>{throw Object.assign(Error(secret+pii),{code:secret,cause:{code:pii},diagnostic:{providerHttp:400}});});
  check(f,await f.run(),{stage:'transport',code:'UBIKOS_NETWORK_OR_TRANSPORT_FAILED'});
});
test('timeout marks transport started but no received HTTP; no retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=setup(()=>new Promise(()=>{}));const pending=f.run();
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(10001);
  check(f,await pending,{stage:'transport',code:'UBIKOS_TIMEOUT'});
});
test('body timeout retains a received HTTP 200 without claiming valid projection',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=setup(async()=>new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'application/json'}}));
  const pending=f.run();await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(10001);
  check(f,await pending,{http:200,stage:'body',code:'UBIKOS_TIMEOUT'});
});
for(const [name,response,stage,code,status] of [
  ['invalid JSON',()=>new Response('{'+secret+pii,{headers:{'Content-Type':'application/json'}}),'json','UBIKOS_JSON_INVALID',503],
  ['excess size',()=>Response.json({payload:secret+pii+'x'.repeat(262144)}),'body','UBIKOS_RESPONSE_TOO_LARGE',503],
  ['HTML',()=>new Response('<html>'+secret+pii+'</html>'),'http','UBIKOS_RESPONSE_CONTRACT',503],
  ['projection rejection',()=>Response.json({items:[],guest:pii}),'projection','UBIKOS_PROJECTION_REJECTED',502],
  ['reflected credential',()=>Response.json([{BOOKING_ID:1,ROOM_ID:secret}]),'projection','UBIKOS_PROJECTION_REJECTED',502]
])test(`${name} retains HTTP200 separately from failed validation`,async()=>{
  const f=setup(async()=>response());check(f,await f.run(),{http:200,stage,code,status});
});
test('redirect remains blocked and reflected error tokens stay unclassified',async()=>{
  const redirect=setup(async()=>new Response(null,{status:302,headers:{Location:'https://example.invalid/'+secret}}));
  check(redirect,await redirect.run(),{http:302,stage:'http',code:'UBIKOS_REDIRECT_DENIED'});
  const f=setup(async()=>Response.json({error:pii,code:secret},{status:400}));
  check(f,await f.run(),{http:400,stage:'http',code:'UBIKOS_HTTP_FAILED'});
  assert.equal(f.logs[0].providerReportedCategory,'DETAIL_UNCLASSIFIED');
});
test('disabled/incomplete configuration has no transport and no provider evidence',async()=>{
  for(const settings of [{enabled:false},{apiKey:undefined},{connectionId:hotelId}]){
    const f=setup(()=>assert.fail('no transport'),settings);
    check(f,await f.run(),{stage:'configuration',code:'SERVER_READING_UNAVAILABLE',started:false});
    assert.equal(f.logs[0].providerDurationMs,null);
  }
});
test('authorization and cross-hotel isolation still precede transport',async()=>{
  for(const patch of [{role:'receptionist'},{hotel:{id:connectionId}},{accessDenied:true}]){
    const f=setup(()=>assert.fail('no transport'),{}, {getContext:async()=>({user:{id:'synthetic'},hotel:{id:hotelId},role:'admin',...patch})});
    check(f,await f.run(),{stage:'authorization',code:'ACCESS_DENIED',status:403,started:false});
  }
});
test('unknown reader failure cannot forge evidence; logger failure does not leak or retry',async()=>{
  const f=setup(()=>assert.fail('no network'),{}, {reader:{available:()=>true,read:async()=>{
    throw Object.assign(Error(secret),{diagnostic:{providerHttp:400},http:400,durationMs:123});}}});
  const result=await f.run();assert.match(result.body.diagnosticId,uuid);
  assert.equal(f.logs[0].providerHttp,null);assert.equal(f.logs[0].transportStarted,null);
  assert.equal(f.logs[0].httpResponseReceived,null);assert.equal(f.logs[0].failureStage,'reader');
  const broken=setup(async()=>Response.json({}, {status:500}),{}, {logDiagnostic:()=>{throw Error(secret+pii);}});
  const res=await broken.run();assert.equal(res.response.status,503);assert.match(res.body.diagnosticId,uuid);assert.equal(broken.calls,1);
});
test('correlation is generated per attempt, independent of caller; success remains partial',async()=>{
  const f=setup(async()=>Response.json({}, {status:400}));
  const a=await f.run(),b=await f.run();assert.notEqual(a.body.diagnosticId,b.body.diagnosticId);assert.equal(f.calls,2);
  const ok=setup(async()=>Response.json([]));const res=await ok.run();
  assert.equal(res.response.status,200);assert.equal(res.body.observation.operationalUse,false);
  assert.equal(ok.calls,1);assert.equal(ok.logs.length,0);
});
test('cancelled before transport is distinct from unknown and retains null HTTP',async()=>{
  const c=new AbortController();c.abort();let calls=0;
  const result=await readUbikosJson({prepareRequest:()=>({url:new URL('https://example.invalid'),headers:{}}),
    fetchImpl:()=>{calls++;assert.fail();},consumePayload:()=>{},signal:c.signal,timeoutMs:100,maxBytes:100});
  assert.equal(calls,0);assert.equal(result.http,null);assert.equal(result.diagnostic.transportStarted,false);
  assert.equal(result.diagnostic.httpResponseReceived,false);assert.equal(result.code,'UBIKOS_CANCELLED');
});
