// Executable production bodies, synthetic DB and provider spies. No SDK/network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoMessageStages } from './demo-message-stages.js';
import * as provenance from '../shared/demo-message-stages/server-provenance.js';
import * as catalog from '../shared/automations/catalog.js';
import * as lifecycle from '../shared/automations/reservation-lifecycle.js';
import * as safePms from '../shared/pms/safe-connection.js';
import * as language from '../src/services/language.service.js';
import * as manual from '../shared/manual-send/contract.js';
import { createManualMessageSender } from '../src/services/message.service.js';
import { formatGuestMemoryForPrompt } from '../src/services/guest-memory.service.js';
import { isGuestMemoryEnabled } from '../shared/guest-memory/feature-flag.js';

assert.equal(process.env.SEND_AUTOMATIONS, 'false', 'Run with SEND_AUTOMATIONS=false');
const logger = { info(){}, warn(){}, error(){} };
const load = (file, supplied, names) => {
  const bindings = { ...provenance, ...catalog, ...lifecycle, ...safePms, logger, ...supplied };
  const source = readFileSync(new URL('../'+file, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replaceAll('export const ', 'const ');
  return new Function(...Object.keys(bindings), source+'\nreturn {'+names.join(',')+'};')(...Object.values(bindings));
};
const H='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const fixture=demoMessageStages({hotelId:H,actorId:B,referenceDate:'2026-09-14'});
const ordinary={id:'ordinary',hotel_id:H,guest_id:'ordinary-guest',guest_name:'Ordinary synthetic guest',status:'confirmed',arrival_date:'2026-09-15',departure_date:'2026-09-18'};
const day=offset=>new Date(Date.UTC(2026,8,14+offset)).toISOString().slice(0,10);
const reservations=fixture.cases.map(c=>({id:c.reservationId,hotel_id:H,guest_id:c.guestId,pms_provider:'checkin_demo_mock',guest_name:c.name,status:c.status,arrival_date:day(c.arrival),departure_date:day(c.departure)}));
const guests=fixture.cases.map(c=>({id:c.guestId,hotel_id:H,phone_number:c.phone,preferred_language:'es'}));
const conversations=fixture.cases.map(c=>({id:c.conversationId,hotel_id:H,guest_id:c.guestId}));
const messages=fixture.cases.map(c=>({id:c.messageId,hotel_id:H,conversation_id:c.conversationId,content:c.text,original_language:'es',metadata:{demo:true,fixture:'staynex_message_stages_v1'}}));
const dbFor = (tables={}) => {
  const writes=[];
  const client={ from(table){let filters=[], action='select', values; const q={
    select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},
    order(){return q;},limit(){return q;},lte(){return q;},gte(){return q;},
    update(v){action='update';values=v;return q;},insert(v){action='insert';values=v;return q;},upsert(v){action='insert';values=v;return q;},
    execute(single=false){let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
      if(action!=='select'){writes.push({table,action,values});if(action==='insert'){rows=[values];(tables[table]||=[]).push(values);}else rows.forEach(r=>Object.assign(r,values));}
      return {data:single?(rows[0]||null):rows,error:null};},
    maybeSingle:async()=>q.execute(true),single:async()=>q.execute(true),then:(a,b)=>Promise.resolve(q.execute()).then(a,b)
  };return q;} };return {client,writes,tables};
};
const tests=[];
const test=async(name,fn)=>{await fn();tests.push(name);console.log('PASS '+name);};
const calls={whatsapp:0,translation:0,automationAi:0,folio:0,sheets:0};

await test('Reserved server identities match generator, not mutable labels, browser flags or another hotel',()=>{
  assert.equal(fixture.cases.length,9);
  for(const slot of ['ana','carlos','lucia'])for(const entity of ['guest','reservation','conversation','message']){
    assert.ok(provenance.isDemoMessageStagesContext({hotelId:H,[entity+'Id']:provenance.demoMessageStageId(H,slot,entity)}),'Legacy identity remains blocked during replacement/recovery');
  }
  for(const c of fixture.cases){
    assert.ok(provenance.isDemoMessageStagesContext({hotelId:H,guestId:c.guestId}));
    assert.ok(provenance.isDemoMessageStagesContext({hotelId:H,conversationId:c.conversationId}));
    assert.ok(provenance.isDemoMessageStagesContext({hotelId:H,messageId:c.messageId}));
    assert.equal(provenance.isDemoMessageStagesContext({hotelId:B,guestId:c.guestId}),false);
  }
  assert.equal(provenance.isDemoMessageStagesReservation({...ordinary,pms_provider:'checkin_demo_mock',metadata:{demo:true},name:'Hotel Demo Checkin'}),false);
});

await test('Manual send rejects demo even with edited valid phone; no translation, dispatch or durable attempt; ordinary accepted',async()=>{
  for(const c of fixture.cases){
    const db=dbFor({conversations:[{id:c.conversationId,hotel_id:H,guest_id:c.guestId}],guests:[{id:c.guestId,hotel_id:H,phone_number:'+34900000001'}]});
    const sender=createManualMessageSender({getClient:()=>db.client,translate:async()=>{calls.translation++;},send:async()=>{calls.whatsapp++;}});
    await assert.rejects(()=>sender({hotelId:H,conversationId:c.conversationId,message:'Synthetic reply'}),e=>e.code==='demo_external_blocked'&&!e.retryable);
    assert.equal(db.writes.length,0);
  }
  assert.equal(calls.whatsapp,0);assert.equal(calls.translation,0);
  const db=dbFor({conversations:[{id:'normal-chat',hotel_id:H,guest_id:'normal'}],guests:[{id:'normal',hotel_id:H,phone_number:'+34900000001'}]});
  const send=createManualMessageSender({getClient:()=>db.client,detect:()=> 'es',translate:async()=>({translatedText:null}),send:async()=>{calls.whatsapp++;return {sid:'SM'+'a'.repeat(32),status:'queued'};}});
  const result=await send({hotelId:H,conversationId:'normal-chat',message:'Synthetic ordinary reply'});
  assert.equal(result.delivery.status,'accepted');assert.equal(calls.whatsapp,1);
  assert.match(manual.manualDeliveryText(manual.manualDelivery('failed','demo_external_blocked')),/no se ha enviado nada/);
});

await test('Inbox translation authorizes stored message then blocks demo before cache/provider; ordinary still translates',async()=>{
  const db=dbFor({messages:[...structuredClone(messages),{id:'normal-message',hotel_id:H,conversation_id:'normal-chat',content:'Ordinary original',metadata:{}}],conversations:[...conversations,{id:'normal-chat',hotel_id:H}]});
  const {handleTranslateMessage}=load('src/controllers/messages.controller.js',{getSupabase:()=>db.client,detectLanguage:language.detectGuestLanguage,normalizeLanguage:language.normalizeLanguage,
    translateText:async()=>{calls.translation++;return {translatedText:'Synthetic translation',sourceLanguage:'es',targetLanguage:'en',provider:'spy'};}},['handleTranslateMessage']);
  const invoke=async(messageId,hotelId=H)=>{const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
    await handleTranslateMessage({body:{hotelId,messageId,targetLanguage:'en'}},res,e=>{throw e;});return res;};
  for(const c of fixture.cases){const res=await invoke(c.messageId);assert.equal(res.code,409);assert.equal(res.body.code,'demo_external_blocked');}
  assert.equal((await invoke(fixture.cases[0].messageId,B)).code,404);
  assert.equal(calls.translation,0);assert.equal(db.writes.length,0);
  assert.equal((await invoke('normal-message')).code,200);assert.equal(calls.translation,1);
});

await test('Inbound and prepared/retried AI paths reject demo before mutations, translation and AI integrations',async()=>{
  let writes=0,ordinaryReads=0;
  const {findOrCreateGuest}=load('src/services/guest.service.js',{
    detectGuestLanguage:language.detectGuestLanguage,
    findGuestByPhone:async({phoneNumber})=>guests.find(g=>g.phone_number===phoneNumber)||{id:'ordinary-guest',hotel_id:H,preferred_language:'es'},
    maskPhoneForLogs:()=> 'synthetic',updateGuestLanguage:async()=>{writes++;},updateGuestRoom:async()=>{writes++;}
  },['findOrCreateGuest']);
  for(const c of fixture.cases)await assert.rejects(()=>findOrCreateGuest({hotelId:H,phoneNumber:c.phone,message:'Hola'}),e=>e.code==='demo_external_blocked');
  assert.equal(writes,0);
  assert.equal((await findOrCreateGuest({hotelId:H,phoneNumber:'+34900000001',message:'Hola'})).id,'ordinary-guest');
  const {processGuestMessage}=load('src/services/staynex.service.js',{checkInboundMessageRateLimit:()=>{ordinaryReads++;throw Error('ordinary boundary reached');}},['processGuestMessage']);
  for(const c of fixture.cases)await assert.rejects(()=>processGuestMessage({message:'Hola',phone:c.phone,sendReply:true,
    preparedInbound:{activeHotel:{id:H},guest:{id:c.guestId},conversation:{id:c.conversationId},guestMessage:{id:c.messageId}}}),e=>e.code==='demo_external_blocked');
  assert.equal(ordinaryReads,0);
  await assert.rejects(()=>processGuestMessage({message:'Hola',phone:'+34900000001',preparedInbound:{activeHotel:{id:H},guest:{id:'normal'},conversation:{id:'normal'},guestMessage:{id:'normal'}}}),/ordinary boundary/);
});

await test('Scheduler excludes only reserved reservations; direct AI generation also rejects them with a provider spy',async()=>{
  class OpenAI {constructor(){this.chat={completions:{create:async()=>{calls.automationAi++;return {choices:[{message:{content:'Synthetic ordinary automation'}}]};}}};}}
  // Local object shadows process for this loaded body only. No real SDK is imported.
  const automation=load('src/services/automation.service.js',{OpenAI,formatGuestMemoryForPrompt,process:{env:{SEND_AUTOMATIONS:'false',OPENAI_API_KEY:'synthetic-spy',USE_MOCK_AI:'false'}}},['generateAutomationMessage','shouldScheduleAutomationForReservation']);
  for(const reservation of reservations)await assert.rejects(()=>automation.generateAutomationMessage({hotel:{id:H},reservation,guest:{},automationType:'pre_arrival_1d'}),e=>e.code==='demo_external_blocked');
  assert.equal(calls.automationAi,0);
  const db=dbFor({reservations:[...reservations,ordinary]});let queued=0;
  const scheduler=load('src/services/scheduler.service.js',{getSupabase:()=>db.client,...automation,
    AUTOMATION_TYPES:catalog.getLegacyAutomationTypesMap(),getAutomationRulesForHotel:async()=>[{automation_type:'pre_arrival_1d'}],
    getAutomationContextForReservation:async()=>({hotelProfile:{id:H},guest:{},guestMemory:[],hotelKnowledge:[],upsells:[],conversation:null}),
    createScheduledMessage:async()=>{queued++;return {id:'spy-only'};},createAiLog:async()=>{}
  },['runAutomationScheduler']);
  await scheduler.runAutomationScheduler({hotelId:H,legacyRuntimeEnabled:true,now:new Date('2026-09-14T00:00:00Z')});
  assert.equal(calls.automationAi,1);assert.equal(queued,1);
});

await test('Queued demo retries are cancelled before send flags/provider; send-time DB gate rejects demo and permits ordinary',async()=>{
  const rows=reservations.map((r,i)=>({id:'queue-'+i,hotel_id:H,reservation_id:r.id,guest_id:r.guest_id,automation_type:'pre_arrival',execution_mode:'live',certification_status:'certified',runtime_version:catalog.AUTOMATION_RUNTIME_VERSION,idempotency_key:'synthetic-'+i,send_to:'+34900000001'}));
  const db=dbFor({reservations:[...reservations,ordinary],scheduled_messages:rows});
  const queue=load('src/services/message-queue.service.js',{getSupabase:()=>db.client,sendWhatsAppMessage:async()=>{calls.whatsapp++;}},['processScheduledMessage','getReservationSendTimeGate']);
  const before=calls.whatsapp;
  for(const row of rows){assert.ok(lifecycle.isCanonicalAutomationScheduledMessage(row));const result=await queue.processScheduledMessage(row,{supabase:db.client});assert.equal(result.status,'cancelled');assert.equal(result.error_message,'demo_external_blocked');
    assert.equal((await queue.getReservationSendTimeGate({scheduledMessage:row,supabase:db.client})).reason,'demo_external_blocked');}
  assert.equal(calls.whatsapp,before);
  assert.equal((await queue.getReservationSendTimeGate({scheduledMessage:{hotel_id:H,reservation_id:ordinary.id},supabase:db.client})).allowed,true);
});

await test('Folio requests never reach PMS for demo; same-hotel ordinary request reaches injected provider',async()=>{
  const {getGuestFolioSummary}=load('src/services/pms-folio.service.js',{},['getGuestFolioSummary']);
  const request=reservationId=>getGuestFolioSummary({hotelId:H,reservationId,roomNumber:'208',connection:{provider:'spy'},folioProvider:async()=>{calls.folio++;return {available:true,currency:'EUR',outstandingBalance:0,lineItems:[]};}});
  for(const r of reservations)assert.ok((await request(r.id)).warnings.includes('demo_external_blocked'));
  assert.equal(calls.folio,0);await request(ordinary.id);assert.equal(calls.folio,1);
});

await test('Queue creation and lifecycle reconciliation reject reserved identities before any writes',async()=>{
  const db=dbFor();
  const {writeAutomationDecisionToQueue}=load('shared/automations/queue-writer.js',{},['writeAutomationDecisionToQueue']);
  const {reconcileReservationAutomationLifecycle}=load('src/services/automation-reconciliation.service.js',{},['reconcileReservationAutomationLifecycle']);
  for(const r of reservations){
    const result=await writeAutomationDecisionToQueue({supabase:db.client,decision:{hotelId:H,reservationId:r.id,guestId:r.guest_id,automationType:'pre_arrival',idempotencyKey:'synthetic',eligible:true,executionMode:'live',sendable:true,certificationStatus:'certified'}});
    assert.equal(result.reason,'demo_external_blocked');assert.equal(result.scheduledMessage,null);
    const reconciled=await reconcileReservationAutomationLifecycle({supabase:db.client,previousReservation:r,currentReservation:{...r,status:'cancelled'}});
    assert.equal(reconciled.reason,'demo_external_blocked');assert.equal(reconciled.replacementsCreated,0);
  }
  assert.equal(db.writes.length,0);
});

await test('Due pre-checkout/post-stay workers and PMS refresh leave examples untouched without providers or derived records',async()=>{
  const db=dbFor({hotels:[{id:H}],reservations,guests,conversations});
  const folio=load('src/services/pms-folio.service.js',{},['runPreCheckoutFolioReminder','isPreCheckoutFolioEligibleWindow']);
  const poststay=load('src/services/post-stay-review-intelligence.service.js',{isGuestMemoryEnabled},['runPostStayReviewIntelligence','isPostStayReviewDue']);
  const pms=load('src/services/pms-intelligence.service.js',{},['runPmsIntelligenceRefresh','persistReservationOperationalContext']);
  for(const r of reservations.filter(r=>r.status!=='checked_out')){
    const now=new Date(r.departure_date+'T12:00:00Z');now.setUTCDate(now.getUTCDate()-1);
    assert.ok(folio.isPreCheckoutFolioEligibleWindow({reservation:r,now}));
    await folio.runPreCheckoutFolioReminder({hotelId:H,now,supabase:db.client,folioProvider:async()=>{calls.folio++;throw Error('Demo reached PMS');}});
  }
  for(const reservation of reservations.filter(r=>r.status==='checked_out'))assert.ok(poststay.isPostStayReviewDue({reservation,now:new Date('2026-09-15T12:00:00Z')}));
  await poststay.runPostStayReviewIntelligence({hotelId:H,now:new Date('2026-09-15T12:00:00Z'),supabase:db.client});
  assert.equal((await pms.runPmsIntelligenceRefresh({hotelId:H,supabase:db.client})).reservationsScanned,0);
  for(const reservation of reservations)assert.equal((await pms.persistReservationOperationalContext({reservation,supabase:db.client})).context,null);
  assert.equal(db.writes.length,0);assert.equal(calls.folio,1); // only the previous ordinary control
});

await test('Sheets export omits reserved identities and their contribution; ordinary reservation remains',async()=>{
  const db=dbFor({hotels:[{id:H,name:'Hotel Demo Checkin'}],reservations:[...reservations,ordinary],conversations});let exported;
  const {syncPlatformGoogleSheets}=load('src/services/platform-sheets-sync.service.js',{syncAllSheets:async rows=>{calls.sheets++;exported=rows;return []; }},['syncPlatformGoogleSheets']);
  await syncPlatformGoogleSheets({supabase:db.client});
  assert.equal(calls.sheets,1);const json=JSON.stringify(exported);
  for(const c of fixture.cases){assert.ok(!json.includes(c.reservationId));assert.ok(!json.includes(c.name));}
  assert.ok(json.includes(ordinary.guest_name));assert.equal(exported.reservations.length,2);
});

console.log(JSON.stringify({checks:tests.length,providerSpyCallsForDemo:0,ordinaryControlCalls:calls,scope:'local executable bodies; no remote SDK, Auth, PostgreSQL or browser in this suite'},null,2));
