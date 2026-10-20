import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUbikosObservationReader} from '../src/services/pms/ubikos/observation-reader.js';
import {createUbikosObservationHandler} from '../dashboard/lib/ubikos-observations-server.js';
import {canAccess} from '../dashboard/lib/permissions.js';
import {assertHotelOperationsAvailable} from '../shared/hotels/lifecycle.js';

globalThis.fetch=()=>{throw Error('NETWORK_BLOCKED');};
const hotelId='00000000-0000-4000-8000-000000000001',connectionId='00000000-0000-4000-8000-000000000002';
const secret='FICTIONAL+KEY/NOT-REAL', scope={hotelId,connectionId,externalHotelId:'10318',operation:'inhouse'};
const config={enabled:true,hotelId,connectionId,apiKey:secret};
const rows=[{BOOKING_ID:11,ROOM_ID:'0007',NAME:'PRIVATE_FAKE_PERSON',EMAIL:'person@example.invalid'},
  {BOOKING_ID:11,ROOM_ID:'0007'},{BOOKING_ID:12}];
const json=value=>Response.json(value);
function setup({settings={},hotel={id:hotelId,name:'Ficticio'},role='admin',count=1,
  fetchImpl=async()=>json(rows)}={}) {
  let calls=0;
  const reader=createUbikosObservationReader({...config,...settings,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
  const query={select(){return query;},eq(){return query;},limit(){return {data:Array.from({length:count},()=>({
    id:connectionId,hotel_id:hotelId,provider:'ubikos',enabled:true,metadata:{property_id:'10318'}
  }))};}};
  const handler=createUbikosObservationHandler({reader,canAccess,getContext:async()=>({
    hotel,role,user:{id:'synthetic'},supabase:{from:()=>query}}),
    assertContext:({hotel})=>assertHotelOperationsAvailable(hotel)});
  const request=body=>new Request('http://localhost/api/pms-connections/ubikos/observations',{
    headers:{'x-staynex-hotel-id':hotelId},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  return {reader,handler,request,get calls(){return calls;}};
}
test('route through real reader: three fixed header-only operations, projection, no cache or side effects',async()=>{
  const f=setup({fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://api.ubikos.es');assert.equal(url.search,'');
    assert.match(url.pathname,/^\/bookings(checkin|checkout|inhouse)\/10318/);
    assert.equal(options.headers['ubikos-api-key'],secret);assert.equal(options.body,undefined);
    assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
    return json(rows);
  }});
  assert.equal((await (await f.handler(f.request())).json()).serverReadingAvailable,true);
  assert.equal(f.calls,0);
  for(const operation of ['checkin','checkout','inhouse']) {
    const res=await f.handler(f.request({connectionId,operation,...(operation==='inhouse'?{}:{date:'2026-10-20'})}));
    assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');
    const data=await res.json();
    assert.equal(data.observation.rowCount,3);assert.equal(data.observation.records[0].externalRoomReference,'0007');
    assert.equal(data.observation.operationalUse,false);assert.equal(data.observation.importable,false);
    assert.equal(data.observation.completeness,'unknown');
    for(const excluded of [secret,'PRIVATE_FAKE_PERSON','person@example.invalid','NAME','EMAIL'])
      assert.ok(!JSON.stringify(data).includes(excluded));
  }
  assert.equal(f.calls,3);
});
test('disabled, incomplete, invalid or wrong server binding never calls transport',async()=>{
  for(const settings of [{enabled:false},{apiKey:undefined},{apiKey:' bad '},{hotelId:undefined},
    {connectionId:undefined},{hotelId:connectionId},{connectionId:hotelId}]) {
    const f=setup({settings});
    assert.equal((await (await f.handler(f.request())).json()).serverReadingAvailable,false);
    assert.equal((await f.handler(f.request({connectionId,operation:'inhouse'}))).status,503);
    assert.equal(f.calls,0);
  }
});
test('permissions, suspended hotel and duplicate bindings stop before provider',async()=>{
  for(const options of [{role:'manager'},{role:'receptionist'},{hotel:{id:hotelId,status:'archived'}},
    {hotel:{id:hotelId,metadata:{archive_operational_hold:true}}},{count:2}]) {
    const f=setup(options);
    assert.equal((await f.handler(f.request({connectionId,operation:'inhouse'}))).status,options.count===2?409:403);
    assert.equal(f.calls,0);
  }
});
test('empty partial observation; invalid structure and excessive response rejected',async()=>{
  const empty=setup({fetchImpl:async()=>json([])});
  assert.equal((await empty.reader.read(scope)).rowCount,0);
  for(const value of [{items:rows},Array.from({length:1001},()=>({BOOKING_ID:1})),{secret:'x'.repeat(262145)}]) {
    const f=setup({fetchImpl:async()=>json(value)});
    await assert.rejects(()=>f.reader.read(scope),e=>['READ_FAILED','STRUCTURE_INVALID'].includes(e.code));
    assert.equal(f.calls,1);
  }
});
test('provider errors, redirects and reflected secrets expose only safe codes, no retries',async()=>{
  for(const status of [302,400,401,403,429,500]) {
    const f=setup({fetchImpl:async()=>new Response(JSON.stringify({message:secret,guest:'PRIVATE_FAKE_PERSON'}),{
      status,headers:{'Content-Type':'application/json',Location:'https://example.invalid/private'}})});
    const res=await f.handler(f.request({connectionId,operation:'inhouse'}));
    const body=await res.json();assert.match(body.diagnosticId,/^[0-9a-f-]{36}$/);
    assert.deepEqual({...body,diagnosticId:undefined},{ok:false,code:'READ_FAILED',diagnosticId:undefined});assert.equal(f.calls,1);
  }
  const reflected=setup({fetchImpl:async()=>json([{BOOKING_ID:1,ROOM_ID:secret}])});
  await assert.rejects(()=>reflected.reader.read(scope),{code:'STRUCTURE_INVALID'});
});
test('aborted requests stop and late body completion cannot produce a result',async()=>{
  const controller=new AbortController();
  const f=setup({fetchImpl:async()=>{controller.abort();return json(rows);}});
  await assert.rejects(()=>f.reader.read({...scope,signal:controller.signal}),{code:'READ_FAILED'});
  assert.equal(f.calls,1);
});
