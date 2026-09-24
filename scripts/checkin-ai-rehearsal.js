import {buildCheckinDemoFixturePlan} from '../src/services/demo-data.service.js';
import {demoMessageStages} from './demo-message-stages.js';
import {createHash} from 'node:crypto';
import {analyzeGuestMessage} from '../src/services/openai.service.js';
import {demoMessageStageId, isDemoMessageStagesContext} from '../shared/demo-message-stages/server-provenance.js';
import {checkinAiCases, syntheticKnowledgeAdditions} from './checkin-ai-cases.js';

export const rehearsalHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const humanControlled = state => ['human_takeover','ai_paused','escalation_lock'].includes(state?.state_metadata?.conversation_ai_mode);
// Pure orchestration around the production generator. No DB/transport/action
// dependency is provided; a proposed ticket is a proposal, never executed.
export async function generateDemoReplies({snapshot, now = ()=>new Date().toISOString(), generate = analyzeGuestMessage, onResult = async()=>{}, previous = []}) {
  const hotel = snapshot.rows.hotels[0];
  if (snapshot.rows.hotels.length !== 1 || hotel.id !== snapshot.hotelId || hotel.slug !== 'hotel-demo-checkin') throw Error('Verified demo hotel required');
  const seeded = buildCheckinDemoFixturePlan({hotelId:hotel.id}).knowledge;
  const knowledge = snapshot.rows.hotel_knowledge.filter(k=>k.is_active !== false && k.key !== 'wifi').map(k=>{
    if (!seeded.some(seed=>seed.key === k.key && seed.value === k.value)) throw Error('Knowledge differs from fictional seed; review before export');
    return {key:k.key,value:k.value};
  });
  const originalCases = demoMessageStages({hotelId:hotel.id,actorId:hotel.id,referenceDate:'2026-09-15'}).cases;
  knowledge.push(...syntheticKnowledgeAdditions);
  // Explicit projection: no contacts, tokens, keys, guest memories or unrelated rows.
  const safeHotel = {id:hotel.id,name:hotel.name,timezone:hotel.timezone,default_language:'es',check_in_time:hotel.check_in_time||'15:00',check_out_time:hotel.check_out_time||'12:00'};
  const old = snapshot.rows.conversations.flatMap(c=>{
    const messages = snapshot.rows.messages.filter(m=>m.conversation_id === c.id && m.sender_type === 'guest');
    if (!messages.length) return [];
    if (!isDemoMessageStagesContext({hotelId:hotel.id,conversationId:c.id,guestId:c.guest_id})) throw Error('Non-reserved conversation: manual review required');
    if (messages.length !== 1) throw Error('Existing demo changed; review before generating');
    const reservation = snapshot.rows.reservations.find(r=>r.id === messages[0].metadata?.reservation_id && r.hotel_id === hotel.id && r.guest_id === c.guest_id);
    if (!reservation) throw Error('Unambiguous reservation required');
    const original = originalCases.find(original=>original.conversationId === c.id);
    if (!original || original.text !== messages[0].content || original.name !== reservation.guest_name) throw Error('Existing content differs from synthetic seed');
    return [{slot:'existing-'+c.id,conversationId:c.id,guestId:c.guest_id,reservation,turns:[messages[0].content],existing:true,state:snapshot.rows.conversation_ai_state.find(s=>s.conversation_id===c.id)}];
  });
  const reference = new Intl.DateTimeFormat('en-CA',{timeZone:hotel.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
  const date = offset => new Date(Date.parse(reference+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const cases = [...old,...checkinAiCases.map(c=>({...c,conversationId:demoMessageStageId(hotel.id,c.slot,'conversation'),guestId:demoMessageStageId(hotel.id,c.slot,'guest'),reservation:{id:demoMessageStageId(hotel.id,c.slot,'reservation'),guest_name:c.name,arrival_date:date(c.arrival),departure_date:date(c.departure),status:c.stage==='pre'?'confirmed':c.stage==='stay'?'checked_in':'checked_out'},existing:false}))];
  const output = [];
  for (const c of cases) {
    const recentMessages = [];
    for (let index=0;index<c.turns.length;index++) {
      const message = c.turns[index];
      const input = {hotel:safeHotel,guest:{id:c.guestId,preferred_language:'es'},message,hotelKnowledge:knowledge,
        conversationContext:{language:'es',responseGuidance:{style_profile:{label:'Ensayo ficticio de orientación, sin ejecución operativa'},message_focus:'No existe transporte ni herramienta de avisos en esta sesión. No digas aviso, avisaré, solicito, voy a informar, vamos a avisar ni prometas acciones. Explica que recepción debe revisar la solicitud y que el huésped puede contactar con ella; pide aclaraciones útiles. La habitación antes de las 15:00 no está confirmada. Ningún objeto se ha encontrado ni se puede coordinar su envío todavía. No hay descuento ni disponibilidad acreditados.',answer_question_first:true,memory_is_passive_context:true,offer_suppressed:true,offer_suppression_reason:'Sin operación comercial en el ensayo'},hotelProfile:safeHotel,reservation:{guest_name:c.reservation.guest_name,arrival_date:c.reservation.arrival_date,departure_date:c.reservation.departure_date,reservation_status:c.reservation.status},recentMessages:[...recentMessages],guestMemory:[],openTickets:[]},failClosedOnProviderFailure:true};
      const inputHash = rehearsalHash(input);
      let result = previous.find(r=>r.conversationId===c.conversationId && r.turn===index);
      if (result && result.inputHash !== inputHash) throw Error('Checkpoint input changed; do not silently regenerate');
      if (!result) {
        const guestAt = now();
        const response = await generate(input);
        if (response.ai_provider !== 'openai' || response.fallback_used || !response.reply?.trim()) throw Error('Real provider reply required; mock/fallback rejected');
        const draft = humanControlled(c.state) || response.escalate_to_human === true || c.slot==='ai-noise' && index>0;
        result = {slot:c.slot,conversationId:c.conversationId,guestId:c.guestId,reservation:c.reservation,existing:c.existing,turn:index,message,guestAt,generatedAt:now(),inputHash,outputHash:rehearsalHash(response),draft,response};
        await onResult(result);
      }
      output.push(result);
      recentMessages.push({sender_type:'guest',content:message},{sender_type:'ai',content:result.response.reply});
    }
  }
  return output;
}
