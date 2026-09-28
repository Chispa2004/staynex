import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isGuestMemoryEnabled } from '../shared/guest-memory/feature-flag.js';
import * as boundary from '../shared/guest-memory/personalization-boundary.js';
import * as quality from '../shared/guest-service/quality.js';
import * as prompt from '../src/prompts/staynex.prompt.js';
import * as schema from '../src/schemas/ai-response.schema.js';
import * as pmsRevenue from '../src/services/pms-revenue-context.service.js';
import * as pmsCheckin from '../src/services/pms-checkin.service.js';
import * as pmsOccupancy from '../src/services/pms-occupancy.service.js';
import * as pmsRoom from '../src/services/pms-room-status.service.js';
import * as intelligence from '../src/services/guest-intelligence.service.js';
import * as revenue from '../src/services/revenue-ai.service.js';
import * as operations from '../src/services/conversation-context.service.js';
import { runStaynexSimulation } from '../src/services/simulation-mode.service.js';
import { evaluateAutomationOpportunity, INTELLIGENT_AUTOMATION_TYPES } from '../src/services/automation-intelligence.service.js';
import * as pilotJourneys from '../shared/automations/pilot-journeys.js';
import * as runtime from '../shared/automations/runtime.js';
import { isDemoMessageStagesReservation } from '../shared/demo-message-stages/server-provenance.js';
import { buildConversationCopilot } from '../dashboard/lib/ai-copilot.js';
import { evaluationCases } from './fixtures/guest-service-quality/cases.js';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('\r\n','\n');
const load = (file, bindings, names) => new Function(...Object.keys(bindings), read(file)
  .replace(/^import[\s\S]*?;\n/gm, '').replaceAll('export const ', 'const ')
  .replaceAll('export class ', 'class ') + `\nreturn {${names.join(',')}};`)(...Object.values(bindings));
const logger = { info() {}, warn() {}, error() {} };
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
const original = process.env.GUEST_MEMORY_ENABLED;
const setFlag = value => value === undefined ? delete process.env.GUEST_MEMORY_ENABLED : process.env.GUEST_MEMORY_ENABLED = value;
const personalTables = ['guest_memory','guest_intelligence_profiles','guest_interest_affinities','guest_behavior_signals','guest_sentiment_history','guest_revenue_predictions','guest_ai_profiles','guest_ai_tags','guest_ai_insights'];
const marker = 'HISTORICAL-PERSONAL-ALLERGY';
const foreign = 'FOREIGN-HOTEL-SECRET';
const stored = { hotel_id:'a', guest_id:'g', reservation_id:'r', room_number:'101', stay_phase:'pre_checkout', departure_date:'2026-09-29',
  upgrade_eligible:true, late_checkout_eligible:true, vip_score:99, revenue_potential:marker, transfer_likely:marker, experience_likely:marker,
  raw_payload:{source:'reservation',status:'checked_in',profile:marker} };
// Stateful adapter: immutable reads, real filters, writes recorded without provider or remote access.
const database = (rows = {}, forbidden = [], mutateUpserts = false) => {
  const calls = [], data = structuredClone(rows);
  const db = { calls, data, from(table) {
    assert.ok(!forbidden.includes(table), `Forbidden OFF query: ${table}`);
    const call = {table, filters:[]}; calls.push(call); let values, kind, single=false;
    const q = { select(){return q;}, eq(k,v){call.filters.push([k,v]);return q;}, in(k,v){call.filters.push([k,v]);return q;},
      order(){return q;}, limit(){return q;}, gte(){return q;}, lte(){return q;}, lt(){return q;}, neq(){return q;},
      maybeSingle(){single=true;return q;}, single(){single=true;return q;},
      upsert(v){kind='upsert';values=v;return q;}, insert(v){kind='insert';values=v;return q;},
      then(resolve,reject){
        if(kind){
          call.kind=kind;call.values=structuredClone(values);
          if(mutateUpserts && kind==='upsert') {
            const old=(data[table]||[]).find(row=>row.reservation_id===values.reservation_id);
            assert.ok(old);Object.assign(old,values);return Promise.resolve({data:structuredClone(old),error:null}).then(resolve,reject);
          }
          return Promise.resolve({data:values,error:null}).then(resolve,reject);
        }
        const found=(data[table]||[]).filter(row=>call.filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
        return Promise.resolve({data:single?(found[0]||null):structuredClone(found),error:null}).then(resolve,reject);
      }};return q;
  }};return db;
};
const trap = () => {throw Error('Unexpected OFF database access');};
try {
for (const flag of [undefined, 'false', 'TRUE', '1', 'invalid']) {
  setFlag(flag);
  await test(`OFF ${String(flag)}: builders, writers and readers stop before database access`, async () => {
    const api=load('src/services/guest-intelligence.service.js',{isGuestMemoryEnabled,getSupabase:trap,logger},['buildGuestIntelligenceProfile','persistGuestIntelligenceProfile','getGuestIntelligenceContext']);
    assert.equal(api.buildGuestIntelligenceProfile({hotelId:'a',guestId:'g',message:marker}),null);
    assert.equal(await api.persistGuestIntelligenceProfile({hotelId:'a',guestId:'g',signals:[{detectedFrom:marker}]}),null);
    assert.equal(await api.getGuestIntelligenceContext({hotelId:'a',guestId:'g'}),null);
    const prediction=load('src/services/revenue-ai.service.js',{isGuestMemoryEnabled,getSupabase:trap,logger},['persistRevenuePrediction']);
    assert.equal(await prediction.persistRevenuePrediction({hotelId:'a',guestId:'g',prediction:{}}),null);
    const profile=load('src/services/guest-memory-ai.service.js',{isGuestMemoryEnabled,getSupabase:trap,logger},['generateGuestProfile']);
    assert.equal((await profile.generateGuestProfile({hotelId:'a',guestId:'g'})).disabled,true);
    const inbox=load('dashboard/lib/inbox.js',{isGuestMemoryEnabled},['getGuestIntelligenceByGuest']);
    assert.equal((await inbox.getGuestIntelligenceByGuest({supabase:{from:trap},hotelId:'a',guestIds:['g']})).size,0);
  });
}
setFlag('false');
await test('Production main profile block does not compute, persist or propagate reusable context with OFF',async()=>{
  const source=read('src/services/staynex.service.js');
  const start=source.indexOf('  const guestMemoryEnabled = isGuestMemoryEnabled();',source.indexOf('export const processGuestMessage'));
  const end=source.indexOf('  const knowledgeResult',start);
  assert.ok(start>0 && end>start,'Production boundary moved');
  const bindings={isGuestMemoryEnabled,conversationContext:{guestMemory:[{memory_key:marker}],guestIntelligence:{profileSummary:marker}},
    activeHotel:{id:'a'},guest:{id:'g'},reservation:{id:'r'},conversation:{id:'c'},message:'Necesito ayuda',
    buildPmsIntelligenceContext:async()=>({stayPhase:'in_house'}),buildGuestIntelligenceProfile:trap,persistGuestIntelligenceProfile:trap,
    predictLikelyConversions:trap,persistRevenuePrediction:trap};
  await new Function(...Object.keys(bindings),'return (async()=>{'+source.slice(start,end)+'})()')(...Object.values(bindings));
  assert.deepEqual(bindings.conversationContext.guestMemory,[]);assert.equal(bindings.conversationContext.guestIntelligence,null);
});
await test('PMS mixed rows: only current stay fields read/written; legacy personal data left intact',async()=>{
  const db=database({guest_stay_context:[stored]},[],true);const before=structuredClone(db.data.guest_stay_context[0]);
  const api=load('src/services/pms-operational-context.service.js',{...boundary,isGuestMemoryEnabled,logger,getSupabase:()=>db},['upsertGuestStayContext','getOperationalContextForGuest']);
  const result=await api.getOperationalContextForGuest({hotelId:'a',guestId:'g',supabase:db});
  assert.equal(result.room_number,'101');assert.equal(result.late_checkout_eligible,true);assert.ok(!JSON.stringify(result).includes(marker));assert.equal(result.vip_score,undefined);
  await api.upsertGuestStayContext({context:stored,supabase:db});
  const write=db.calls.find(c=>c.kind==='upsert').values;assert.equal(write.hotel_id,'a');assert.equal(write.vip_score,undefined);assert.ok(!JSON.stringify(write).includes(marker));
  assert.equal(await api.getOperationalContextForGuest({hotelId:'b',guestId:'g',supabase:db}),null);
  for(const key of ['vip_score','revenue_potential','transfer_likely','experience_likely','raw_payload']) assert.deepEqual(db.data.guest_stay_context[0][key],before[key],`OFF must not clean historical ${key}`);
});
await test('PMS background refresh retains room, occupancy and arrival events, without personal profiles',async()=>{
  const reservation={id:'r',hotel_id:'a',guest_id:'g',room_number:'101',room_type:'suite',notes:marker,status:'confirmed',arrival_date:'2026-09-28',departure_date:'2026-09-30'};
  const writes=[];
  const api=load('src/services/pms-intelligence.service.js',{...boundary,...pmsRevenue,...pmsCheckin,...pmsOccupancy,...pmsRoom,isGuestMemoryEnabled,isDemoMessageStagesReservation,logger,
    getSupabase:trap,upsertGuestStayContext:async v=>{writes.push(['stay',v.context]);return v.context;},upsertRoomStatusSnapshot:async v=>writes.push(['room',v.snapshot]),
    upsertOccupancySnapshot:async v=>writes.push(['occupancy',v.snapshot]),createOperationalEvent:async ({supabase,...v})=>writes.push(['event',v]),createPmsIntelligenceLog:async ({supabase,...v})=>writes.push(['log',v])},['runPmsIntelligenceRefresh']);
  await api.runPmsIntelligenceRefresh({supabase:database({reservations:[reservation]}),now:new Date('2026-09-28T12:00:00Z')});
  for(const kind of ['stay','room','occupancy','event','log'])assert.ok(writes.some(w=>w[0]===kind),kind);
  assert.ok(!JSON.stringify(writes).includes(marker));assert.ok(!JSON.stringify(writes).includes('vip_guest_detected'));
  assert.equal(writes.find(w=>w[0]==='stay')[1].vip_score,undefined);
});
const input=structuredClone(evaluationCases[0]);
input.conversationContext.guestMemory=[{hotel_id:input.hotel.id,memory_key:marker,memory_value:marker}];
input.conversationContext.guestIntelligence={profile:{hotel_id:input.hotel.id,guest_id:input.guest.id,profile_summary:marker}};
input.conversationContext.pmsIntelligenceContext={stayPhase:'pre_checkout',vipScore:marker,guestStayContext:{...stored,hotel_id:input.hotel.id,guest_id:input.guest.id},recommendedActions:['vip_follow_up','check_room_status_before_reply']};
input.conversationContext.recentMessages.push({hotel_id:'foreign',content:foreign,sender_type:'guest'});
input.hotelKnowledge.push({hotel_id:'foreign',key:'breakfast',value:foreign});
let captured=[];
class SimulatedOpenAI { chat={completions:{create:async request=>{
  captured.push(request);
  return {choices:[{message:{content:JSON.stringify(request.response_format.json_schema.name === 'staynex_ai_response' ? {intent:'hotel_info',confidence:0.9,reply:'Respuesta operativa',create_ticket:false,ticket:{category:null,title:null,description:null,priority:null},escalate_to_human:false,emergency:false,upsell_opportunity:false} : {guest_insights:[{memory_key:marker}],primary_intent:'information'})}}]};
}}};}
const sdkBindings={...boundary,...quality,...prompt,...schema,isGuestMemoryEnabled,logger,OpenAI:SimulatedOpenAI,
  process:{env:{OPENAI_API_KEY:'synthetic-not-secret',AI_CONCIERGE_ENABLED:'true',USE_MOCK_AI:'false'}},getAiTimeoutMs:()=>100,
  isAiCircuitBreakerOpen:()=>false,recordAiSuccess(){},recordAiFailure(){}};
await test('Captured PRIMARY provider request: current conversation/reservation/Knowledge retained; history and other hotel excluded',async()=>{
  const api=load('src/services/openai.service.js',sdkBindings,['analyzeGuestMessage']);
  const response = await api.analyzeGuestMessage({...input,failClosedOnProviderFailure:true});
  assert.equal(response.fallbackUsed,false);
  const request=captured.at(-1);assert.ok(request);const payload=request.messages[1].content;
  assert.ok(payload.includes(input.message));assert.ok(payload.includes(input.hotelKnowledge[0].value));
  assert.ok(payload.includes(input.guest.current_room));assert.ok(!payload.includes(marker));assert.ok(!payload.includes(foreign));
});
await test('Captured CONCIERGE request and output: no profile/extraction, operational evidence remains',async()=>{
  const api=load('src/services/openai-concierge.service.js',sdkBindings,['enhanceConciergeIntelligence','generateGuestInsights']);
  const response=await api.enhanceConciergeIntelligence({...input,conversationState:{sentiment:'urgent',escalation_level:'reception_required',ai_summary:marker,state_metadata:{human_takeover:{active:true}}}});
  assert.equal(response.ok,true);assert.deepEqual(response.result.guest_insights,[]);
  const request=captured.at(-1),payload=JSON.parse(request.messages[1].content);
  assert.equal(payload.guest_intelligence,null);assert.deepEqual(payload.guest_memory,[]);assert.equal(payload.current_message,input.message);
  assert.ok(payload.reservation.id);assert.equal(payload.conversation_state.sentiment,'urgent');assert.equal(payload.conversation_state.escalation_level,'reception_required');
  assert.equal(payload.pms_intelligence_context.guestStayContext.room_number,'101');assert.ok(!JSON.stringify(payload).includes(marker));assert.ok(!JSON.stringify(payload).includes(foreign));
  assert.ok(!request.response_format.json_schema.schema.required.includes('guest_insights'));assert.equal(request.response_format.json_schema.schema.properties.guest_insights,undefined);
  const count=captured.length;assert.equal((await api.generateGuestInsights(input)).disabled,true);assert.equal(captured.length,count);
});
await test('Inbox drafts discard historic profiles but retain incident/ticket/current room and authoritative human control',()=>{
  const conversation={hotelId:'a',guestMemoryEnabled:false,guestIntelligence:{profile:{profile_summary:marker,vip_score:100}},guestMemory:[{memory_value:marker}],
    pmsIntelligenceContext:input.conversationContext.pmsIntelligenceContext,roomNumber:'101',guest:{current_room:'101'},
    messages:[{sender_type:'guest',content:'El aire acondicionado no funciona en la habitación 101',hotel_id:'a'}],
    aiState:{sentiment:'negative',current_intent:'maintenance',escalation_level:'reception_required',state_metadata:{human_takeover:{active:true},conversation_ai_mode:'human_takeover'}},openTickets:[{title:'Aire acondicionado',status:'open',priority:'high'}]};
  const before=JSON.stringify(conversation),copilot=buildConversationCopilot(conversation);
  assert.equal(copilot.guestIntelligence.profileSummary,null);assert.ok(!JSON.stringify(copilot).includes(marker));assert.equal(copilot.guestSnapshot.openTickets,1);
  assert.equal(operations.isHumanControlledConversation(conversation.aiState),true);assert.equal(JSON.stringify(conversation),before);
});
await test('Post-stay analysis ignores historic profiles/guest metadata with OFF, keeps urgent unresolved incident',()=>{
  const api=load('src/services/post-stay-review-intelligence.service.js',{isGuestMemoryEnabled,logger},['analyzePostStayReviewStrategy']);
  const clean=api.analyzePostStayReviewStrategy({messages:[{content:'Gracias, todo perfecto'}],guest:{metadata:{vip_score:99,review_risk_score:99}},intelligenceProfile:{vip_score:99,review_risk_score:99},guestMemory:[{memory_value:'medical emergency'}]});
  assert.equal(clean.vipScore,0);assert.equal(clean.reviewRiskScore,0);assert.equal(clean.staySentiment,'positive');
  const incident=api.analyzePostStayReviewStrategy({tickets:[{title:'Urgente: riesgo eléctrico',priority:'urgent',status:'open'}]});
  assert.equal(incident.staySentiment,'negative');assert.equal(incident.reviewStrategy,'alert_quality_team');
});
await test('Post-stay background consumer never queries personal tables and isolates hotels',async()=>{
  const db=database({reservations:[{id:'r',hotel_id:'a',guest_id:'g',status:'checked_out',departure_date:'2026-09-25'}],hotels:[{id:'a'}],guests:[{id:'g',hotel_id:'a'}],
    messages:[{guest_id:'g',hotel_id:'b',content:'medical emergency '+foreign}],tickets:[],conversations:[]},personalTables);
  const api=load('src/services/post-stay-review-intelligence.service.js',{isGuestMemoryEnabled,logger,isDemoMessageStagesReservation,...runtime,
    isHumanControlledConversation:operations.isHumanControlledConversation,writeAutomationDecisionToQueue:async()=>({scheduledMessage:null})},['runPostStayReviewIntelligence']);
  const before=JSON.stringify(db.data);const result=await api.runPostStayReviewIntelligence({supabase:db,now:new Date('2026-09-28T12:00:00Z')});
  assert.equal(result.errors?.length||0,0,JSON.stringify(result));assert.equal(result.negativeStays,0);assert.equal(JSON.stringify(db.data),before);
});
await test('Current incident state persists with takeover, escalation and tracking metadata intact; wrong hotel blocked',async()=>{
  const db=database({conversations:[{id:'c',hotel_id:'a'}]});
  const state={currentIntent:'emergency',sentiment:'negative',escalationLevel:'urgent',primaryIntent:{confidence:1},
    previousState:{state_metadata:{conversation_ai_mode:'human_takeover',human_takeover:{activated_by:'staff'},tracking_reference:'operational'}}};
  const result=await operations.upsertConversationAiState({hotelId:'a',conversationId:'c',state,aiSummary:'Current electrical incident',supabase:db});
  assert.equal(result.sentiment,'negative');assert.equal(result.escalation_level,'urgent');assert.equal(result.ai_summary,'Current electrical incident');
  assert.equal(result.state_metadata.human_takeover.activated_by,'staff');assert.equal(result.state_metadata.tracking_reference,'operational');assert.equal(operations.isHumanControlledConversation(result),true);
  const count=db.calls.filter(c=>c.kind).length;
  assert.equal(await operations.upsertConversationAiState({hotelId:'b',conversationId:'c',state,supabase:db}),null);assert.equal(db.calls.filter(c=>c.kind).length,count);
});
await test('Alternate simulation path keeps operational results without creating a personal profile',()=>{
  const result=runStaynexSimulation({count:12});assert.equal(result.ok,true);assert.equal(result.results.length,12);
  for(const row of result.results) {assert.equal(row.analysis.guest_intelligence,null);assert.equal(row.analysis.revenue_prediction,null);assert.deepEqual(row.analysis.automation_preview,[]);}
});
await test('Automation evaluator ignores persistent affinities/VIP with OFF while current urgent sentiment still blocks',()=>{
  const base={automation:{type:INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL},reservation:{id:'r',hotel_id:'a',guest_id:'g',arrival_date:'2026-09-25',departure_date:'2026-09-30',status:'in_house'},guest:{id:'g',vip:true,score:99},
    now:new Date('2026-09-28T12:00:00Z'),guestIntelligenceContext:{affinities:{spa_affinity:100}},guestMemory:[{memory_key:'spa',memory_value:'loves spa'}]};
  assert.equal(evaluateAutomationOpportunity(base).shouldRun,false);
  assert.equal(evaluateAutomationOpportunity({...base,conversation:{last_message:'Quiero información del spa'}}).shouldRun,true);
  assert.equal(evaluateAutomationOpportunity({...base,aiState:{sentiment:'negative'},conversation:{last_message:'Quiero información del spa'}}).reason,'negative_sentiment');
});
await test('Separate demo seed honors OFF without touching existing demo data',async()=>{
  const api=load('src/services/demo-data.service.js',{...pilotJourneys,isGuestMemoryEnabled},['createDemoMemoryAndSignals']);
  await api.createDemoMemoryAndSignals({hotelId:'synthetic',guest:{id:'g'},scenario:{}});
});
await test('Explicit ON synthetic regression: profile generation, all derived writes and scoped reads still work',async()=>{
  setFlag('true');
  const profile=intelligence.buildGuestIntelligenceProfile({hotelId:'a',guestId:'g',message:'Me interesa el spa y el transfer',source:'synthetic'});assert.ok(profile);assert.ok(profile.signals.length);
  const db=database({guest_intelligence_profiles:[{hotel_id:'a',guest_id:'g',profile_summary:'AUTHORIZED'},{hotel_id:'b',guest_id:'g',profile_summary:foreign}]});
  const api=load('src/services/guest-intelligence.service.js',{isGuestMemoryEnabled,getSupabase:()=>db,logger},['persistGuestIntelligenceProfile','getGuestIntelligenceContext']);
  await api.persistGuestIntelligenceProfile(profile);
  const prediction=load('src/services/revenue-ai.service.js',{isGuestMemoryEnabled,getSupabase:()=>db,logger},['persistRevenuePrediction']);
  await prediction.persistRevenuePrediction({hotelId:'a',guestId:'g',prediction:revenue.predictLikelyConversions({guestIntelligence:profile})});
  for(const table of ['guest_intelligence_profiles','guest_interest_affinities','guest_behavior_signals','guest_sentiment_history','guest_revenue_predictions'])assert.ok(db.calls.some(c=>c.table===table&&c.kind),table);
  const context=await api.getGuestIntelligenceContext({hotelId:'a',guestId:'g'});assert.equal(context.profile.profile_summary,'AUTHORIZED');assert.ok(!JSON.stringify(context).includes(foreign));
  assert.equal(boundary.operationalStayContext(stored,true),stored);
  const apiConcierge=load('src/services/openai-concierge.service.js',sdkBindings,['enhanceConciergeIntelligence']);
  await apiConcierge.enhanceConciergeIntelligence(input);const request=captured.at(-1);assert.ok(request.messages[1].content.includes(marker));assert.ok(request.response_format.json_schema.schema.required.includes('guest_insights'));
  const other=structuredClone(input);other.conversationContext.guestIntelligence.profile.hotel_id='other-hotel';other.conversationContext.pmsIntelligenceContext.guestStayContext.hotel_id='other-hotel';other.conversationContext.guestMemory=[{hotel_id:'other-hotel',guest_id:input.guest.id,memory_value:foreign}];
  await apiConcierge.enhanceConciergeIntelligence(other);const foreignPayload=JSON.parse(captured.at(-1).messages[1].content);
  assert.equal(foreignPayload.guest_intelligence,null);assert.equal(foreignPayload.pms_intelligence_context,null);assert.deepEqual(foreignPayload.guest_memory,[]);assert.ok(!JSON.stringify(foreignPayload).includes(foreign));
  setFlag('false');
});
console.log(`${passed} personal memory boundary behavior groups passed; synthetic adapters only, no remote writes or provider calls`);
} finally { setFlag(original); }
