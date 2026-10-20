import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUbikosObservationHandler} from '../dashboard/lib/ubikos-observations-server.js';
import {createUbikosObservationReader} from '../src/services/pms/ubikos/observation-reader.js';
import {observeUbikosList} from '../src/services/pms/ubikos/list-observation.js';
const project=(rows,scope=input)=>observeUbikosList({provider:'ubikos',externalHotelId:'10318',operation:scope.operation,...(scope.date?{date:scope.date}:{}),observedAt:'2026-10-20T10:00:00Z'},rows);
import {canAccess} from '../dashboard/lib/permissions.js';
import {shouldRedirectToOnboarding} from '../dashboard/lib/onboarding-navigation.js';
import {createHotelAtomically} from '../dashboard/lib/hotel-creation.js';
import {state, supabase} from './fixtures/ubikos-view-store.js';

globalThis.fetch=()=>{throw Error('No network permitted');};
const hotel={id:'hotel-a',name:'Hotel ficticio A'};
const connection={id:'connection-a',hotel_id:hotel.id,provider:'ubikos',enabled:true,
  account_code:'10318',metadata:{property_id:'10318',credentials_encrypted:'DO_NOT_DISCLOSE'}};
function fixture(patch={}, conn=connection) {
  let calls=0,selects=[];
  const query={select(v){selects.push(v);return query;},eq(k,v){selects.push([k,v]);return query;},
    limit(){return Promise.resolve({data:conn?[conn]:[]});}};
  const context={hotel,user:{id:'synthetic-admin'},role:'admin',platformRole:'none',fallback:false,
    supabase:{from(table){assert.equal(table,'hotel_pms_connections');return query;}},...patch};
  const handler=createUbikosObservationHandler({getContext:async(_request,options)=>{
    assert.deepEqual(options,{readOnly:true,includeDirectory:false});return context;
  },canAccess,
    assertContext:()=>hotel.id,reader:{simulated:true,available:()=>true,read:async args=>{
      calls++;assert.equal(args.hotelId,'hotel-a');assert.equal(args.externalHotelId,'10318');
      return project([{BOOKING_ID:12,ROOM_ID:'0002',NAME:'DO_NOT_DISCLOSE'},
        {BOOKING_ID:12,ROOM_ID:'0002'},{BOOKING_ID:13}],args);
    }}});
  return {handler,context,get calls(){return calls;},selects};
}
const request=(body,hotelId='hotel-a')=>new Request('http://localhost/api/pms-connections/ubikos/observations',{
  method:body?'POST':'GET',headers:{'x-staynex-hotel-id':hotelId,'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});
const input={connectionId:'connection-a',operation:'checkin',date:'2026-10-20'};

test('authorized manual operations return partial projections, scoped binding and no secret/PII',async()=>{
  const f=fixture();
  const config=await (await f.handler(request())).json();
  assert.equal(f.calls,0);assert.equal(config.serverReadingAvailable,true);
  for(const operation of ['checkin','checkout','inhouse']){
    const res=await f.handler(request({...input,operation,...(operation==='inhouse'?{date:undefined}:{})}));
    assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
    const data=await res.json();assert.equal(data.hotelId,hotel.id);
    assert.equal(data.observation.kind,'partial_observation');
    assert.equal(data.observation.rowCount,3);
    assert.equal(data.observation.records[2].externalRoomReference,null);
    assert.equal(data.observation.completeness,'unknown');
    assert.equal(data.observation.operationalUse,false);
    assert.ok(!JSON.stringify(data).includes('DO_NOT_DISCLOSE'));
  }
  assert.equal(f.calls,3);
  assert.ok(f.selects.some(v=>Array.isArray(v)&&v[0]==='hotel_id'&&v[1]==='hotel-a'));
});
test('no context fallback, unauthenticated access, denied assignment or cross-hotel header',async()=>{
  for(const patch of [{user:null},{accessDenied:true},{fallback:true},{role:'receptionist'},
    {hotel:null}]) {
    const f=fixture(patch);assert.equal((await f.handler(request(input))).status,403);assert.equal(f.calls,0);
  }
  const f=fixture();assert.equal((await f.handler(request(input,'hotel-b'))).status,403);
  assert.equal((await f.handler(request(input,''))).status,403);assert.equal(f.calls,0);
});
test('read-only roles and support cannot manually invoke transport',async()=>{
  for(const patch of [{role:'analyst'},{role:'manager'},{platformRole:'support'}]){
    const f=fixture(patch);
    assert.equal((await f.handler(request(input))).status,403);assert.equal(f.calls,0);
    if(patch.role==='manager'||patch.platformRole==='support'){
      const config=await (await f.handler(request())).json();
      assert.equal(config.ok,true);assert.equal(config.canQuery,false);
    }
  }
});
test('connection ownership, provider, enabled state and explicit property must match',async()=>{
  for(const conn of [null,{...connection,hotel_id:'hotel-b'},{...connection,provider:'apaleo'},
    {...connection,enabled:false},{...connection,metadata:{}},
    {...connection,metadata:{property_id:'10319'}},{...connection,account_code:'10319'}]){
    const f=fixture({},conn);assert.equal((await f.handler(request(input))).status,409);assert.equal(f.calls,0);
  }
});
test('no arbitrary proxy inputs, invalid dates, alternative connection or injected hotel/provider',async()=>{
  for(const body of [{...input,date:'2026-02-30'},{...input,connectionId:'connection-b'},
    {...input,operation:'other'},{...input,url:'https://example.invalid'},
    {...input,hotelId:'hotel-b'},{...input,apiKey:'PRIVATE'},{...input,externalHotelId:'10319'},
    {...input,operation:'inhouse'}]){
    const f=fixture();assert.equal((await f.handler(request(body))).status,400);assert.equal(f.calls,0);
  }
});
test('deployment transport disabled; errors sanitized; empty list does not write',async()=>{
  assert.equal(createUbikosObservationReader().available({}),false);
  const f=fixture();
  const make=reader=>createUbikosObservationHandler({getContext:async()=>f.context,canAccess,assertContext:()=>hotel.id,reader});
  assert.equal((await make(null)(request(input))).status,503);
  const bad=await make({available:()=>true,read:async()=>{throw Error('secret private guest');}})(request(input));
  assert.equal(bad.status,503);const body=await bad.json();assert.match(body.diagnosticId,/^[0-9a-f-]{36}$/);assert.deepEqual({...body,diagnosticId:undefined},{ok:false,code:'READ_FAILED',diagnosticId:undefined});
  const empty=await (await make({simulated:true,available:()=>true,read:async()=>project([])})(request(input))).json();
  assert.equal(empty.observation.rowCount,0);assert.equal(empty.observation.completeness,'unknown');
});
test('navigation exception is exact and still uses PMS permission',()=>{
  assert.equal(shouldRedirectToOnboarding({pathname:'/dashboard/settings/pms/ubikos',completed:false,role:'admin'}),false);
  assert.equal(shouldRedirectToOnboarding({pathname:'/dashboard/settings/pms/ubikos/other',completed:false,role:'admin'}),true);
  assert.equal(canAccess('receptionist','pms_connections_manage'),false);
});
test('existing atomic creation function with synthetic store preserves idempotency and invited status',async()=>{
  const args={supabase,user:{id:'00000000-0000-4000-8000-000000000009'},
    key:'00000000-0000-4000-8000-000000000010',mode:'platform',
    body:{name:'Checkin Camino de Granada',country_code:'ES',city:'Granada',timezone:'Europe/Madrid',admin_email:'qa@example.invalid'}};
  const a=await createHotelAtomically(args),b=await createHotelAtomically(args);
  assert.equal(a.hotel.id,b.hotel.id);assert.equal(b.replayed,true);
  assert.equal(a.hotelUser.status,'invited');assert.equal(a.state.onboarding_completed,false);
  assert.equal(a.hotel.address,undefined);assert.equal(a.hotel.ai_auto_reply_enabled,undefined);
  assert.equal(state.writes.filter(w=>w.type==='local_hotel_creation').length,1);
});
test('existing workspace creation uses authenticated actor, without inventing a hotel administrator',async()=>{
  const user={id:'00000000-0000-4000-8000-000000000009',email:'platform@example.invalid'};
  const result=await createHotelAtomically({supabase,user,
    key:'00000000-0000-4000-8000-000000000011',mode:'workspace',
    body:{name:'Otro hotel ficticio',country_code:'ES',city:'Ciudad ficticia',timezone:'Europe/Madrid'}});
  assert.equal(result.hotelUser.user_id,user.id);
  assert.equal(result.hotelUser.email,user.email);
  assert.equal(result.hotelUser.role,'owner');assert.equal(result.hotelUser.status,'active');
  assert.equal(result.state.onboarding_completed,false);
});
