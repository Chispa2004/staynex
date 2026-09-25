import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {captureFinalOutput} from './fixtures/guest-service-quality/final-output-harness.js';
import {buildConversationCopilot} from '../dashboard/lib/ai-copilot.js';
import {translatePhrase} from '../dashboard/lib/i18n/translations.js';
import {localizeCopilotText,copilotPhrases} from '../dashboard/lib/i18n/copilot-phrases.js';
import {serviceCopy,missingServiceQuestion} from '../shared/guest-service/quality.js';
import {shouldAiAutoRespond} from '../shared/pilot/ai-safety.js';

const evidence=JSON.parse(fs.readFileSync(new URL('../docs/evidence/arrival-booking-quality.json',import.meta.url)));
const rows=[...evidence.rawInitial,...evidence.rawReevaluation];
const inputs=new Map(evidence.inputs.map(c=>[c.id,c]));
export const reviewedOutputs=[];
for(const [index,row] of rows.entries()) {
  const input=inputs.get(row.id);assert.ok(input);
  const companion=row.path==='primary'?row:rows.find(r=>r.id===row.id && r.phase===row.phase && r.path==='primary');
  assert.ok(companion,'Concierge requires an explicitly identified primary companion');
  const result=await captureFinalOutput(input,companion.output,{conciergeOutput:row.path==='concierge'?row.output:null});
  assert.equal(result.error,undefined,JSON.stringify({index,error:result.error}));
  const transport=result.calls.filter(c=>c.kind==='transport');assert.equal(transport.length,1);
  assert.equal(transport[0].values.body,result.result.aiMessage.content);
  assert.equal(transport[0].values.body,result.result.response.reply);
  assert.ok(!transport[0].values.body.includes('SYNTHETIC-RESTRICTED'));
  if(result.result.ticket) {
    assert.ok(transport[0].values.body.startsWith(serviceCopy(input.conversationContext.language).saved));
    assert.ok(result.calls.findIndex(c=>c.kind==='ticket')<result.calls.findIndex(c=>c.kind==='transport'));
  }
  reviewedOutputs.push({index,id:row.id,phase:row.phase,path:row.path,inputHash:row.inputHash,
    original:row.output.reply || row.output.suggested_response,
    companionIndex:row.path==='concierge'?rows.indexOf(companion):null,
    final:transport[0].values.body,receipt:result.result.response.service_quality,
    scope:input.conversationContext.conversation_ai_mode==='human_takeover'?'counterfactual-boundary-only; automatic entry is blocked':'isolated-final-boundary'});
}
assert.equal(reviewedOutputs.length,92);
console.log('PASS all 92 preserved generations replayed through production finalization, message persistence and captured test transport; no provider calls');

const invoice=rows.find(r=>r.id==='a-invoice' && r.phase==='after');
const fixed=await captureFinalOutput(inputs.get(invoice.id),invoice.output);
assert.equal(fixed.result.response.reply,serviceCopy('es').saved);
for(const q of ['¿Quieres que registre una solicitud?','Would you like me to create a ticket?','Shall I open a request?']) {
  assert.equal(missingServiceQuestion(q,{requestRecorded:true}),null);
  assert.ok(missingServiceQuestion(q,{requestRecorded:false}));
}
assert.equal(missingServiceQuestion('¿Qué edad tiene el bebé?',{requestRecorded:true}),'¿Qué edad tiene el bebé?');
console.log('PASS saved receipt removes redundant consent to create the same request, retaining essential missing questions');
for(const failTicket of [true,false]) {
  const r=await captureFinalOutput(inputs.get(invoice.id),invoice.output,{failTicket});
  assert.equal(r.calls.some(c=>c.kind==='transport'),!failTicket);
  if(failTicket)assert.ok(r.error);
}
const foreign=await captureFinalOutput(inputs.get('a-towels'),rows.find(r=>r.id==='a-towels').output,{foreignTicket:true});
assert.equal(foreign.result.response.service_quality.request_status,'not_recorded');
assert.ok(!foreign.result.response.reply.includes('ha quedado registrada'));
console.log('PASS ticket failure blocks persistence/send; retry works; foreign receipt cannot acknowledge success');
for(const id of ['b-lost','b-invoice','a-towels']) {
  const row=rows.find(r=>r.id===id && r.phase==='after');
  const input=structuredClone(inputs.get(id));input.conversationContext.serviceCapabilities.requestRecording=false;
  const r=await captureFinalOutput(input,row.output);
  assert.equal(r.result.response.service_quality.request_status,'not_recorded');
  assert.equal(r.calls.find(c=>c.kind==='transport').values.body,serviceCopy(input.conversationContext.language).pending);
  assert.ok(!r.calls.some(c=>c.kind==='ticket'));
}
console.log('PASS unavailable recording strips observed contracted/future promises at the test transport');
for(const row of rows.filter(r=>r.path==='concierge')) {
  const input=inputs.get(row.id),primary=rows.find(r=>r.id===row.id && r.phase===row.phase && r.path==='primary').output;
  const r=await captureFinalOutput(input,{...primary,confidence:.5},{conciergeOutput:row.output});
  assert.equal(r.error,undefined);
  const body=r.calls.find(c=>c.kind==='transport').values.body;
  if(row.id==='promo-current-a')for(const term of ['2026-10-31','2026-11-30','No acumulable','disponibilidad'])assert.ok(body.includes(term));
  if(row.id.startsWith('arrival-'))assert.ok(!/room will be available|on your arrival day|habitación estará disponible/.test(body));
  if(row.id==='booking-request-b')assert.equal(body,serviceCopy('en').saved);
}
console.log('PASS all 12 Concierge candidates selected with low-confidence primary remain guarded at transport');

for(const input of evidence.inputs) {
  const conversation={hotel_id:input.hotel.id,hotelProfile:input.hotel,hotelKnowledge:input.hotelKnowledge,
    guest:input.guest,reservation:input.conversationContext.reservation,contextReadAt:input.conversationContext.referenceTime,
    aiState:{state_metadata:{conversation_ai_mode:'human_takeover'}},
    messages:[...input.conversationContext.recentMessages,{sender_type:'guest',content:input.message,original_language:input.conversationContext.language}]};
  const before=structuredClone(conversation),copilot=buildConversationCopilot(conversation);
  assert.deepEqual(conversation,before);assert.equal(copilot.suggestedReply.draft,true);
  assert.equal(copilot.suggestedReply.language,input.conversationContext.language);
  assert.ok(!copilot.suggestedReply.text.includes('Voy a pedir a recepción'));
}
console.log('PASS 36 Inbox drafts use guest language and preserve human state without performing an action');
for(const language of ['es','en']) {
  const tx=(v,r)=>translatePhrase(language,v,r);
  for(const [es,en] of copilotPhrases)assert.equal(tx(en),language==='es'?es:en);
  assert.equal(localizeCopilotText('Latest guest message: Hello, gracias',tx),language==='es'?'Último mensaje del huésped: Hello, gracias':'Latest guest message: Hello, gracias');
}
console.log('PASS ES/EN staff presentation translates fixed labels and explanations without changing quoted guest language');
const require=createRequire(new URL('../dashboard/package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),swc=require('next/dist/build/swc');
let staffLanguage='es';
const uiSource=fs.readFileSync(new URL('../dashboard/components/InboxAiCopilotPanel.js',import.meta.url),'utf8');
const {code}=await swc.transform(uiSource,{filename:'InboxAiCopilotPanel.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
const mocks={
  '@/lib/i18n/useDashboardLanguage':{useDashboardLanguage:()=>({tx:(v,r)=>translatePhrase(staffLanguage,v,r)})},
  '@/lib/theme/useDashboardTheme':{useDashboardTheme:()=>({theme:'light'})},
  '@/lib/ai-copilot':{buildConversationCopilot},'@/lib/i18n/copilot-phrases':{localizeCopilotText}
};
const module={exports:{}};
new Function('require','module','exports',code)(id=>mocks[id]||require(id),module,module.exports);
const uiConversation={hotel_id:'synthetic-a',guest:{preferred_language:'en',current_room:'A-204'},
  guestMemoryEnabled:false,guestMemory:[{memory_key:'private-marker',memory_value:'not-for-display'}],
  aiState:{state_metadata:{conversation_ai_mode:'human_takeover'}},
  messages:[{sender_type:'guest',content:'Thanks. Is the cot confirmed? My baby is nine months old.',original_language:'en',translated_content:'Gracias, traducción para lectura.',translated_language:'es'}]};
const before=structuredClone(uiConversation),guestReply=buildConversationCopilot(uiConversation).suggestedReply.text;
for(staffLanguage of ['es','en'])for(const supplied of [false,true]) {
  const markup=renderToStaticMarkup(React.createElement(module.exports.InboxAiCopilotPanel,{
    conversation:{...uiConversation,...(supplied?{copilot:buildConversationCopilot(uiConversation)}:{})},
    humanEscalation:{needsHuman:true,reason:'human_takeover'},onClose(){} }));
  assert.ok(markup.includes(guestReply));
  assert.ok(markup.includes(staffLanguage==='es'?'Tranquilo':'Calm'));
  assert.ok(markup.includes(staffLanguage==='es'?'Basta con una respuesta breve':'A concise hospitality reply'));
  assert.ok(!markup.includes('Voy a pedir a recepción'));
  assert.ok(!markup.includes('private-marker'));assert.ok(!markup.includes('not-for-display'));
  assert.ok(markup.includes(staffLanguage==='es'?'Cerrar asistencia IA':'Close AI assistance'));
}
assert.deepEqual(uiConversation,before);
console.log('PASS actual panel renders ES/EN, supplied and fallback copilot, guest EN independent of reading translation, memory OFF and unchanged human control');
const processSource=fs.readFileSync(new URL('../src/services/staynex.service.js',import.meta.url),'utf8');
const gateStart=processSource.indexOf('  if (!aiAutoResponseGate.allowed) {');
const gateEnd=processSource.indexOf('  if (!rateLimit.allowed)',gateStart);
assert.ok(gateStart>0 && gateEnd>gateStart);
const gate=shouldAiAutoRespond({hotel:{id:'synthetic-a',ai_auto_reply_enabled:true},
  conversationState:{state_metadata:{conversation_ai_mode:'human_takeover'}},env:{}});
assert.equal(gate.allowed,false);assert.equal(gate.reason,'human_takeover_active');
const gateBindings={aiAutoResponseGate:gate,activeHotel:{id:'synthetic-a'},guest:{},conversation:{},
  guestMessage:{},message:'synthetic',guestLanguage:'en',staffTranslation:{},reservation:null,channel:'test',existingAiState:{},
  returnSuppressedAutoResponse:async()=>({suppressed:true})};
const gated=await new Function(...Object.keys(gateBindings),'return (async()=>{'+processSource.slice(gateStart,gateEnd)+';throw Error("Reached generation/send after human gate");})()')(...Object.values(gateBindings));
assert.equal(gated.suppressed,true);
console.log('PASS actual early-return gate prevents generation/send under human control; boundary probes do not authorize sending');
if(process.argv.includes('--write-evidence'))fs.writeFileSync(new URL('../docs/evidence/guest-final-output-replay.json',import.meta.url),JSON.stringify({
  kind:'Offline reconstruction, not original end-to-end provider traces',
  originalEvidence:'arrival-booking-quality.json',providerCalls:0,
  limitations:['Independent Concierge generations require the documented primary companion; original intervening runtime state was not recorded.',
    'Analytics and external-provider workflows are excluded. Human-controlled samples are counterfactual boundary probes, not eligible automatic sends.',
    'Receipt success uses scoped synthetic persistence, not production records.'],
  outputs:reviewedOutputs},null,2)+'\n');
