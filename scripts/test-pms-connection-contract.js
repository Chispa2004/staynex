import assert from 'node:assert/strict';
import {buildReadinessForHotel} from '../dashboard/lib/golive-readiness.js';
import {buildReadinessChecksFromContext} from '../src/services/golive-readiness.service.js';
import {assertApaleoDestination,assertApaleoProperty,currentPmsEvidence} from '../shared/pms/connection-contract.js';
import {ApaleoPmsConnector} from '../src/integrations/pms/apaleo/apaleo-pms-connector.js';
import {apaleoFetch} from '../src/integrations/apaleo/apaleo-client.service.js';
import {getReservations,getReservationById} from '../src/integrations/apaleo/apaleo-reservations.service.js';
import {clearApaleoTokenCache} from '../src/integrations/apaleo/apaleo-auth.service.js';
import {UbikosAdapter,UBIKOS_SYNTHETIC_TRANSPORT} from '../src/services/pms/adapters/ubikos.adapter.js';
import {pmsEvidence} from '../dashboard/lib/pms-evidence.js';
import {evaluatePilotPms,evaluatePilotUsers} from '../dashboard/lib/pilot-onboarding.js';
import {serializePmsConnectionSafe} from '../shared/pms/safe-connection.js';
const config={hotelId:'synthetic-a',connectionId:'synthetic-c',revision:1,propertyId:'A',environment:'test',clientId:'synthetic',clientSecret:'synthetic-secret',accountCode:'group',baseUrl:'https://api.apaleo.com'};
let calls=[],records=[{id:'1',property:{id:'A'}}],fail=false;
globalThis.fetch=async(url,options)=>{
 calls.push({url:String(url),options});
 assert.equal(options.redirect,'error');
 if(fail)throw new Error('synthetic transport');
 return new Response(JSON.stringify(String(url).includes('identity.apaleo.com')?{access_token:'synthetic-token',expires_in:3600}
   :new URL(url).pathname==='/booking/v1/reservations'?{reservations:records,count:records.length}:records[0]),{status:200,headers:{'Content-Type':'application/json'}});
};
for(const url of ['http://api.apaleo.com','https://127.0.0.1','https://api.apaleo.com.evil.invalid','https://u:p@api.apaleo.com','https://api.apaleo.com:444','https://api.apaleo.com/internal'])
 await assert.rejects(apaleoFetch('/booking/v1/reservations',{config:{...config,baseUrl:url}}));
assert.equal(calls.length,0);
for(const path of ['https://evil.invalid/booking/v1/reservations','//evil.invalid/','/booking/v1/../admin','/booking/v1/reservations/%2f','/booking/v1/reservations#token'])
 assert.throws(()=>assertApaleoDestination(config.baseUrl,path,'test'));
assert.throws(()=>assertApaleoDestination(config.baseUrl,undefined,'sandbox'));
console.log('PASS fixed documented destination/method/path/environment; rejected before credentials/network');
assert.equal((await getReservations({config})).length,1);
assert.equal(new URL(calls.at(-1).url).searchParams.get('propertyIds'),'A');
records=[{id:'foreign',property:{id:'B'}}];await assert.rejects(getReservations({config}),/PMS_PROPERTY_MISMATCH/);
await assert.rejects(getReservationById({config,reservationId:'foreign'}),/PMS_PROPERTY_MISMATCH/);
records=[{id:'missing'}];await assert.rejects(getReservations({config}),/PMS_PROPERTY_MISMATCH/);
assert.throws(()=>assertApaleoProperty({property:{id:'A'},propertyId:'B'},config));
const connector=new ApaleoPmsConnector({config});
assert.equal((await connector.healthCheck()).ok,false);
await assert.rejects(connector.connect(),/PMS_PROPERTY_MISMATCH/);
console.log('PASS group account filter plus page/detail/missing/conflicting property rejected');
records=[{id:'1',property:{id:'A'}}];
const before=calls.filter(x=>x.url.includes('identity')).length;
await apaleoFetch('/booking/v1/reservations',{config:{...config,revision:2,clientSecret:'rotated'}});
assert.equal(calls.filter(x=>x.url.includes('identity')).length,before+1);
fail=true;await assert.rejects(apaleoFetch('/booking/v1/reservations',{config}),/PMS_TRANSPORT_FAILED/);fail=false;
const normalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'error');return new Response('',{status:302,headers:{Location:'https://127.0.0.1/private'}});};
await assert.rejects(apaleoFetch('/booking/v1/reservations',{config}),/PMS_API_REQUEST_FAILED/);
let pageCalls=0;globalThis.fetch=async()=>{pageCalls++;return pageCalls===1?new Response(JSON.stringify({reservations:[{id:'ok',property:{id:'A'}}],count:2}),{status:200}):new Response('provider-secret',{status:400});};
await assert.rejects(getReservations({config,pageSize:1,maxReservations:2}),/PMS_API_REQUEST_FAILED/);assert.equal(pageCalls,2);
globalThis.fetch=normalFetch;
console.log('PASS connection/revision/credential cache partition; redirect forbidden and errors do not expose provider payload');
const connection={id:'synthetic-c',hotel_id:'synthetic-a',provider:'apaleo',config_revision:1,enabled:true,metadata:{environment:'test',property_id:'A'},encrypted_client_secret:'hidden'};
const receipt={hotel_id:connection.hotel_id,provider:'apaleo',environment:'test',property_id:'A',revision:1,at:new Date().toISOString(),result:'success',coverage:'unknown'};
assert.equal(currentPmsEvidence(connection).accessVerified,false);
connection.evidence={access:receipt,sync:receipt};
assert.equal(currentPmsEvidence(connection).accessVerified,true);assert.equal(currentPmsEvidence(connection).syncVerified,false);
assert.equal(pmsEvidence({key:'apaleo'},connection).test.status,'success');
assert.equal(evaluatePilotPms({pmsConnections:[connection]}).readyForGoLive,false);
assert.equal(currentPmsEvidence({...connection,config_revision:2}).accessVerified,false);
assert.equal(currentPmsEvidence({...connection,enabled:false}).accessVerified,false);
assert.equal(currentPmsEvidence({...connection,evidence:{access:{...receipt,result:'failed'}}}).accessVerified,false);
const safe=serializePmsConnectionSafe(connection,{surface:'health'});assert.equal(safe.encrypted_client_secret,undefined);assert.equal(safe.evidence.access.revision,1);
assert.equal(evaluatePilotUsers([{status:'active',role:'admin',email:'a@example.invalid'}]).readyForConfiguration,false);
assert.equal(evaluatePilotPms().details[0].value,'Pendiente');
console.log('PASS shared evidence: config/historical rows/partial coverage cannot establish current readiness');
for(const options of [{},{config:{enabled:true,sandbox:true}},{config:{enabled:false,sandbox:true},simulation:UBIKOS_SYNTHETIC_TRANSPORT},{config:{enabled:true,sandbox:false},simulation:UBIKOS_SYNTHETIC_TRANSPORT}]){
 const u=new UbikosAdapter(options);
 for(const method of ['searchReservations','getArrivalsToday','getDeparturesToday','getInHouseGuests','getRooms'])assert.deepEqual(await u[method](),[]);
 assert.equal(await u.getReservationDetails('x'),null);assert.equal(await u.getGuestProfile('x'),null);
 assert.equal((await u.getRoomStatus()).hotel_status,null);assert.equal((await u.getFolioSummary('x')).available,false);
 assert.equal((await u.getConnectionHealth()).ok,false);
}
const synthetic=new UbikosAdapter({simulation:UBIKOS_SYNTHETIC_TRANSPORT,config:{enabled:true,sandbox:true}});
assert((await synthetic.getRooms()).length>0);clearApaleoTokenCache();
console.log('PASS all Ubikos reads fail closed outside trusted explicit synthetic transport; fixtures retained for isolated tests');

assert.equal(evaluatePilotPms({pmsConnections:[{...connection,evidence:{access:receipt,sync:{...receipt,coverage:'complete'}}}]}).readyForGoLive,false);

for(const builder of [args=>buildReadinessForHotel(args).checks,buildReadinessChecksFromContext]){
 const users=[{role:'admin',status:'active'},{role:'receptionist',status:'active'}];
 assert.notEqual(builder({users}).find(c=>c.check_type==='users_configured').status,'healthy');
 assert.equal(builder({users:users.map(u=>({...u,identity_verified:true}))}).find(c=>c.check_type==='users_configured').status,'healthy');
 const production={...connection,metadata:{environment:'production',property_id:'A'},evidence:{access:{...receipt,environment:'production'}}};
 assert.equal(builder({pmsConnections:[production]}).find(c=>c.check_type==='pms_connected').status,'healthy');
 assert.notEqual(builder({pmsConnections:[{...production,config_revision:2}]}).find(c=>c.check_type==='pms_connected').status,'healthy');
 assert.notEqual(builder({pmsConnections:[connection]}).find(c=>c.check_type==='pms_connected').status,'healthy');
}
console.log('PASS Platform/backend readiness requires verified identities and current production PMS evidence');
