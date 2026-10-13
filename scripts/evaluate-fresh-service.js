import {assertsAvailability} from './fixtures/guest-service-quality/evidence-assertions.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createNativeTestPostgres} from './ci/native-test-postgres.js';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {recordOperationalRequest} from '../src/services/operational-request.service.js';
import * as quality from '../shared/guest-service/quality.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
import * as primaryPrompt from '../src/prompts/staynex.prompt.js';
import * as aiSchema from '../src/schemas/ai-response.schema.js';
import * as memoryBoundary from '../shared/guest-memory/personalization-boundary.js';
import {chooseNaturalConciergeResponse} from '../src/services/natural-conversation.service.js';
import {shouldAiAutoRespond} from '../shared/pilot/ai-safety.js';
assert.equal(process.env.SEND_AUTOMATIONS,'false');assert.equal(process.env.GUEST_MEMORY_ENABLED,'false');
assert.match(process.env.NODE_OPTIONS||'',/isolate\.cjs/);
const [split='diagnostic',output='../evaluation.json']=process.argv.slice(2);
assert(['diagnostic','holdout','validation','naturalness-reserved','naturalness-final','arrival-targeted'].includes(split));
const bytes=fs.readFileSync(new URL('./fixtures/guest-service-quality/fresh-service-evaluation.json',import.meta.url));
const dataset=JSON.parse(bytes);
const validationBytes=fs.readFileSync(new URL('./fixtures/guest-service-quality/fresh-service-validation.json',import.meta.url));
const naturalnessPlan=JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/naturalness-evaluation-plan.json',import.meta.url)));
const expectedReserved={N01:['record','detail','social','observe'],N02:['record','observe','observe','no_delivery'],N03:['unknown_knowledge','unknown_knowledge','unknown_knowledge','social'],N04:['multiple','multiple','multiple','human']};
const selected=split==='arrival-targeted'?[...dataset.cases.filter(c=>['D02','D06','D07','D09','D11'].includes(c.id)),...JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/naturalness-final-reserve.json',import.meta.url))).cases.filter(c=>c.id==='F01')]:split==='naturalness-final'?JSON.parse(fs.readFileSync(new URL('./fixtures/guest-service-quality/naturalness-final-reserve.json',import.meta.url))).cases:split==='naturalness-reserved'?naturalnessPlan.heldout.map(c=>({...c,
  stateChanges:Object.fromEntries(c.turns.flatMap((t,n)=>t.persistedStatus?[[n,t.persistedStatus]]:[])),
  turns:c.turns.map((t,n)=>({...t,message:t.guest,expected:expectedReserved[c.id][n],
    probe:c.hotel==='a'?'Ya hemos avisado al equipo y está todo solucionado.':'We have notified the team and everything is resolved.'}))
})):(split==='validation'?JSON.parse(validationBytes).cases:dataset.cases).filter(c=>c.split===split);
assert.equal(selected.length,split==='diagnostic'?16:split==='holdout'?8:split==='naturalness-reserved'?4:split==='naturalness-final'?3:6);
// Execute production generation functions with only the SDK transport substituted.
// No credential discovery or provider connection is supported.
process.env.OPENAI_API_KEY='synthetic-not-a-credential';process.env.USE_MOCK_AI='false';process.env.AI_CONCIERGE_ENABLED='true';
let pending=null,captures=[],outside=[];
globalThis.fetch=async url=>{outside.push({url:String(url)});throw Error('External transport forbidden');};
class FakeOpenAI {constructor(){this.chat={completions:{create:async request=>{assert(pending,'Unplanned generation');const raw=pending;pending=null;captures.push({request,raw,synthetic:true});return {choices:[{message:{content:JSON.stringify(raw)}}]};}}};}}
const load=(file,names)=>{
 const bindings={...quality,...primaryPrompt,...aiSchema,...memoryBoundary,OpenAI:FakeOpenAI,logger:{info(){},warn(){},error(){}},
  isGuestMemoryEnabled:()=>false,getAiTimeoutMs:()=>1000,isAiCircuitBreakerOpen:()=>false,recordAiFailure(){},recordAiSuccess(){},
  analyzeGuestMessageWithMockAi:()=>{throw Error('Unexpected mock fallback');}};
 const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export class ','class ');
 return new Function(...Object.keys(bindings),source+';return {'+names.join(',')+'};')(...Object.values(bindings));
};
const {analyzeGuestMessage}=load('src/services/openai.service.js',['analyzeGuestMessage']);
const {enhanceConciergeIntelligence}=load('src/services/openai-concierge.service.js',['enhanceConciergeIntelligence']);
const require=createRequire(import.meta.url),db=process.env.TEST_NATIVE_PG_BIN ? await createNativeTestPostgres(process.env.TEST_NATIVE_PG_BIN,process.env.TEST_NATIVE_PG_DRIVER) : require('./ci/disposable-postgres.cjs').createDisposablePostgres({env:process.env});
const sql=db.sql|| (text=>execFileSync(db.docker,[...db.host,'exec','-i',db.container,'psql','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:text,env:process.env,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim());
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,q=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const pipeline=fs.readFileSync(new URL('../src/services/staynex.service.js',import.meta.url),'utf8');
const start=pipeline.indexOf('  const operationalRequest = await recordOperationalRequest('),end=pipeline.indexOf('  const previousLastProviderExperience',start);
assert(start>0&&end>start);const body=pipeline.slice(start,end)+';return {ticket,aiMessage,response:aiResponseWithUpsell,operationalRequest};';
const rows=[];
try {
 sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE hotels(id uuid PRIMARY KEY,name text,status text DEFAULT 'active',metadata jsonb DEFAULT '{}',archived_at timestamptz,deleted_at timestamptz);
 CREATE TABLE guests(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels);
 CREATE TABLE conversations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE messages(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,conversation_id uuid REFERENCES conversations,sender_type text,content text,created_at timestamptz DEFAULT now());
 CREATE TABLE reservations(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests);
 CREATE TABLE hotel_users(id uuid PRIMARY KEY,hotel_id uuid REFERENCES hotels,user_id uuid,status text,role text);
 CREATE TABLE conversation_ai_state(hotel_id uuid,conversation_id uuid,state_metadata jsonb,PRIMARY KEY(hotel_id,conversation_id));
 CREATE TABLE tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),hotel_id uuid REFERENCES hotels,guest_id uuid REFERENCES guests,conversation_id uuid REFERENCES conversations,room_number text,category text,title text,description text,priority text,status text,created_at timestamptz DEFAULT now());
 GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
 INSERT INTO hotels(id,name)VALUES('${id(1)}','Synthetic Faro'),('${id(2)}','Synthetic Juniper');`);
 for(const file of ['add_operational_request_receipts.sql','guard_operational_request_clarification.sql'])sql(fs.readFileSync(new URL('../supabase/sql/'+file,import.meta.url),'utf8'));
 let seq=100;
 for(const c of selected) for(const path of ['primary','concierge']) {
  const spec=dataset.hotels[c.hotel],h=id(c.hotel==='a'?1:2),g=id(++seq),cid=id(++seq),rid=id(++seq);
  const hotel={id:h,name:spec.name,timezone:'Europe/Madrid',default_language:spec.language,check_in_time:c.hotel==='a'?'15:30':'16:30',check_out_time:c.hotel==='a'?'11:30':'10:30',ai_auto_reply_enabled:true};
  const room=c.roomState?null:c.phase==='stay'?spec.room:null,guest={id:g,hotel_id:h,name:'Synthetic Traveller',current_room:room,preferred_language:spec.language};
  const conversation={id:cid,hotel_id:h,guest_id:g};
  const reservation={id:rid,hotel_id:h,guest_id:g,arrival_date:c.phase==='pre'?'2026-11-08':'2026-11-01',departure_date:c.phase==='post'?'2026-11-04':'2026-11-10',reservation_status:c.phase==='post'?'checked_out':'confirmed'};
  sql(`INSERT INTO guests VALUES('${g}','${h}');INSERT INTO conversations VALUES('${cid}','${h}','${g}');INSERT INTO reservations VALUES('${rid}','${h}','${g}');INSERT INTO conversation_ai_state VALUES('${h}','${cid}',${q(c.humanControl?{conversation_ai_mode:'human_takeover'}:{})});`);
  let history=[];const transcript=[];
  const knowledge=spec.knowledge.map(([key,value])=>({hotel_id:h,key,title:key,value,is_active:true}));
  if(c.conflictingBreakfast)knowledge.push({hotel_id:h,key:'breakfast',value:'Breakfast from 05:00 to 07:00.',is_active:true});
  if(c.expiredOffer)knowledge.push({hotel_id:h,key:'promotion',value:'Oferta válida hasta 2025-01-01: 10% descuento.',is_active:true});
  // Foreign and inactive rows are deliberately present to check prompt isolation.
  knowledge.push({hotel_id:id(c.hotel==='a'?2:1),key:'breakfast',value:'FOREIGN-HOTEL-SECRET 03:14',is_active:true},{hotel_id:h,key:'pool',value:'EXPIRED-POOL 23:00',is_active:false});
  const getTickets=()=>JSON.parse(sql(`SELECT coalesce(jsonb_agg(t ORDER BY created_at,id),'[]') FROM tickets t WHERE conversation_id='${cid}';`));
  for(const [n,turn] of c.turns.entries()) {
   const mid=id(++seq),sourceMessage={id:mid,hotel_id:h,conversation_id:cid,sender_type:'guest',content:turn.message,created_at:dataset.referenceTime};
   sql(`INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content)VALUES('${mid}','${h}','${cid}','guest',${q(turn.message)});`);
   if(c.stateChanges?.[n])sql(`UPDATE tickets SET status=${q(c.stateChanges[n])} WHERE conversation_id='${cid}';`); // synthetic staff action, never production
   const before=getTickets(),effects=[];
   const operationalContext={hotel_id:h,guest_id:g,conversation_id:cid,known_room:room,reservation:c.roomState==='ambiguous'?null:reservation,phase:c.phase,
    ambiguous:c.roomState==='ambiguous',reason:c.roomState==='ambiguous'?'stay_unconfirmed':c.roomState==='unknown'?'room_missing':c.phase==='pre'?'room_unassigned':'confirmed',room_source:room?'reservation':null};
   const context={language:spec.language,reservation,reservationAmbiguous:c.roomState==='ambiguous',operationalContext,knownRoom:room,tickets:before,recentMessages:history,hotelKnowledge:knowledge,referenceTime:dataset.referenceTime,guestMemory:[],serviceCapabilities:{requestRecording:c.recording!==false,mode:'guest_reply'}};
   const draftInput={...conversation,guest,hotelProfile:hotel,hotelKnowledge:knowledge,reservation,operationalContext,tickets:before,contextReadAt:dataset.referenceTime,aiState:{state_metadata:{conversation_ai_mode:c.humanControl?'human_takeover':'ai_active'}},messages:[...history,sourceMessage]};
   const originalDraftInput=structuredClone(draftInput),draft=buildConversationCopilot(draftInput).suggestedReply;
   assert.deepEqual(draftInput,originalDraftInput);assert(draft.draft);assert.deepEqual(getTickets(),before);
   const gate=shouldAiAutoRespond({hotel,conversationState:{state_metadata:{conversation_ai_mode:c.humanControl?'human_takeover':'ai_active'}},env:{STAYNEX_GLOBAL_AI_AUTO_REPLY:'on'}});
   let raw=null,model=null,concierge=null,result=null,modelCaptures=[];
   if(gate.allowed) {
    const create=['record','new','failure','urgent','human','multiple','repeat'].includes(turn.expected);
    const category=['towels','pillow','cleaning','unknown_room','ambiguous_room','multiple'].includes(c.kind)?'housekeeping':['failure'].includes(c.kind)?'maintenance':c.kind==='urgent'?'emergency':'reception';
    raw={intent:turn.expected==='urgent'?'emergency':create?'housekeeping_request':'hotel_info',confidence:path==='primary'?.95:.5,reply:turn.probe,create_ticket:create,
     ticket:{category:create?category:null,title:create?turn.message:null,description:create?turn.message:null,priority:create?'normal':null},escalate_to_human:turn.expected==='human',emergency:turn.expected==='urgent',upsell_opportunity:false};
    captures=[];pending=raw;
    model=await analyzeGuestMessage({hotel,guest,message:turn.message,hotelKnowledge:knowledge,conversationContext:context,failClosedOnProviderFailure:true});
    let processed=model;
    if(path==='concierge') {
     pending={primary_intent:'hotel_info',secondary_intents:[],sentiment:'neutral',confidence:.95,should_escalate:false,escalation_level:'ai_handled',revenue_opportunity:false,offer_type:null,suggested_response:turn.probe,summary:'Synthetic',department_actions:[],risk_flags:[],satisfaction_estimate:50,resolution_estimate:false,reasoning:'Controlled probe'};
     concierge=await enhanceConciergeIntelligence({hotel,guest,message:turn.message,hotelKnowledge:knowledge,conversationContext:context});assert(concierge.ok);
     processed={...model,reply:chooseNaturalConciergeResponse({baseResponse:model.reply,openAiSuggestedResponse:concierge.result.suggested_response})};
    }
    modelCaptures=structuredClone(captures);
    const client={rpc:async(name,p)=>{effects.push({kind:'rpc',name,request:p.p_request});if(c.failTurn===n)return {error:{code:'SYNTHETIC_TIMEOUT'}};
     try{return {data:JSON.parse(sql(`SET ROLE service_role;SELECT record_guest_operational_request_v1(${q(p.p_hotel_id)},${q(p.p_conversation_id)},${q(p.p_message_id)},${q(p.p_request)}::jsonb);`))};}catch{return {error:{code:'SYNTHETIC_SQL_ERROR'}};}},
     from:table=>{assert.equal(table,'tickets');const filters={};const query={select:()=>query,eq:(k,v)=>{assert(['id','hotel_id','guest_id','conversation_id'].includes(k));filters[k]=v;return query;},single:async()=>({data:JSON.parse(sql(`SELECT coalesce((SELECT to_jsonb(t) FROM tickets t WHERE ${Object.entries(filters).map(([k,v])=>k+'='+q(v)).join(' AND ')}),'null'::jsonb);`))})};return query;}};
    const bindings={...quality,recordOperationalRequest:v=>recordOperationalRequest({...v,client}),composeRecordedGuestReply:async()=>null,
     activeHotel:hotel,guest,conversation,guestMessage:sourceMessage,conversationContext:context,message:turn.message,rawAiResponse:model,aiResponseWithUpsell:processed,
     enhancedRisk:{hasRisk:false},upsellInterest:null,providerExperienceOwnsResponse:false,experienceBookingIntent:{detected:false},experienceBookingRequest:null,
     finalOfferSuppression:{suppress:false},humanEscalation:{humanReason:turn.expected==='human'?'human_requested':null},smarterResponse:{metadata:{}},
     createUpsellInterestTicket:async()=>{throw Error('Unexpected effect');},
     createMessage:async values=>{effects.push({kind:'persist_ai_message',content:values.content});sql(`INSERT INTO messages(id,hotel_id,conversation_id,sender_type,content)VALUES('${id(++seq)}','${h}','${cid}','ai',${q(values.content)});`);return values;}};
    result=await new Function(...Object.keys(bindings),'return (async()=>{'+body+'})()')(...Object.values(bindings));
   }
   const after=getTickets(),final=result?.response?.reply||null,failures=[];
   const check=(ok,label)=>{if(!ok)failures.push(label);};
   const expected=turn.expected,outcome=result?.operationalRequest;
   if(['record','urgent','failure'].includes(expected))check(expected==='failure'?outcome?.status==='unconfirmed':Boolean(outcome?.ticket),'request_persistence');
   if(expected==='detail')check(outcome?.ticket?.id===before[0]?.id&&outcome?.ticket?.description.includes(turn.message),'detail_lost_or_wrong_ticket');
   if(expected==='repeat')check(after.length===before.length,'duplicate_ticket');
   if(expected==='new')check(after.length===before.length+1,'new_request_merged');
   if(expected==='observe')check(outcome?.status==='observed'&&effects.every(e=>e.kind!=='rpc'),'progress_wrote_or_lost_context');
   if(expected==='social')check(outcome?.status==='not_requested'&&effects.every(e=>e.kind!=='rpc')&&after.length===before.length&&!/request|petici[oó]n|habitaci[oó]n|TEST-|F-617|J-842/.test(final||''),'social_repeated_or_wrote');
   if(expected==='ambiguous')check(outcome?.status==='ambiguous'&&after.length===before.length,'ambiguous_ticket_selected');
   if(expected.startsWith('cancellation'))check(!/request is cancelled|cancelad[oa]|is cancelled/i.test(final||'')||/no |not |cannot|can't|a[uú]n/i.test(final),'false_cancellation');
   if(expected==='cancellation')check(after[0]?.description.includes(turn.message)&&after[0]?.status==='open','withdrawal_lost_or_closed');
   if(expected==='multiple')check(after.length===0&&!/both.*(?:recorded|progress|handling)/i.test(final||''),'partial_multi_request_success');
   if(expected==='blocked')check(!result&&effects.length===0&&!gate.allowed,'human_control_bypassed');
   if(expected==='proposed')check(after.length===0&&!/est[aá] registrada|enviamos ahora|s[ií], registrada/i.test(final||''),'capability_claim');
   if(expected==='no_delivery')check(!/we (?:have )?sent|has been returned|ya est[aá] en camino|enviamos ahora/i.test(final||''),'false_delivery');
   if(expected==='unknown_knowledge')check(!/05:00|floor 4|23:00|no booking is needed/i.test(final||''),'unverified_knowledge');
   if(['information','unknown_knowledge','no_availability'].includes(expected))check(after.length===before.length,'informational_ticket');
   if(expected==='no_availability')check(!assertsAvailability(final),'false_availability');
   if(room&&final)check(!/¿(?:En )?qu[eé] habitaci[oó]n|Which room|What room number/i.test(final),'known_room_reasked');
   check(after.every(t=>t.hotel_id===h&&t.guest_id===g&&t.conversation_id===cid),'cross_hotel_ticket');
   check(!JSON.stringify(modelCaptures.map(x=>x.request.messages)).includes('FOREIGN-HOTEL-SECRET'),'foreign_knowledge_prompt');
   check(!JSON.stringify(modelCaptures.map(x=>x.request.messages)).includes('EXPIRED-POOL'),'inactive_knowledge_prompt');
   check(!final?.includes('FOREIGN-HOTEL-SECRET'),'foreign_knowledge_reply');
   if(c.roomState)check(after.every(t=>t.room_number===null),'untrusted_room');
   transcript.push({turn:n+1,guest:turn.message,expected,gate,rawControlledProbe:raw,modelResponse:model,conciergeResponse:concierge,modelCaptures,
    transformation:result?.response?.service_quality||null,originalIsRealModel:false,
    final,draft,before,after,outcome,effects,failures,styleSignals:{words:final?.split(/\s+/).length||0,repeatsPrevious:!!final&&final===transcript.at(-1)?.final},communicationPending:c.communicationPending===true});
   history.push(sourceMessage);if(final)history.push({hotel_id:h,conversation_id:cid,sender_type:'ai',content:final});
  }
  const persistedReceipts=JSON.parse(sql(`SELECT coalesce(jsonb_agg(r),'[]') FROM operational_request_receipts r JOIN tickets t ON t.id=r.ticket_id WHERE t.conversation_id='${cid}' AND t.hotel_id='${h}';`));
  rows.push({id:c.id,path,hotel:hotel.name,language:spec.language,phase:c.phase,turns:transcript,persistedReceipts});
  console.log(`EVAL ${split} ${c.id} ${path}: ${transcript.flatMap(t=>t.failures).length} failed properties`);
 }
 assert.equal(outside.length,0);
 const failures={};for(const r of rows)for(const t of r.turns)for(const f of t.failures)failures[f]=(failures[f]||0)+1;
 const report={validationHash:split==='validation'?createHash('sha256').update(validationBytes).digest('hex'):null,datasetCanonicalHash:createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex'),datasetHash:createHash('sha256').update(bytes).digest('hex'),split,realCalls:0,realTokens:0,syntheticCalls:rows.flatMap(r=>r.turns).reduce((n,t)=>n+t.modelCaptures.length,0),externalAttempts:outside,
  conversations:selected.length,routeReplays:rows.length,guestTurns:selected.reduce((n,c)=>n+c.turns.length,0),routeTurns:rows.reduce((n,r)=>n+r.turns.length,0),failures,rows};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({conversations:report.conversations,routeTurns:report.routeTurns,syntheticCalls:report.syntheticCalls,failures}));
} finally {db.cleanup();}
