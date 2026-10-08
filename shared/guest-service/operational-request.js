const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Bounded, deterministic action intents supplement the model. The original
// message is retained in the ticket, including quantities and unparsed details.
import {requestTopics} from './ticket-context.js';
const kinds=requestTopics;
const actionable=/necesit|pido|pedi|podri|(?:pod|pued).*(?:traer|enviar|llevar|poner|limpiar)|traig|quiero|quisiera|solicit|hay |sigue|no funciona|gote|fuga|pierde agua|dej[eé]|olvide|me falta|need|please|could (?:you|we|i)|can you (?:bring|send|clean)|not work|leak|lost|left my|besoin|pourriez|bitte|brauche|vorrei|preciso|por favor/;
const informational=/^(?:a que hora|cual es el horario|what time|when does|quand|wann|a che ora|qual.*horario)/;
export function interpretOperationalRequest({message='',aiResponse=null,openTickets=[]}) {
  const text=normalize(message).replace(/^[^a-z0-9]+/,'');
  if(informational.test(text))return null;
  const matched=kinds.find(([, ,pattern])=>pattern.test(text))
    || (aiResponse?.create_ticket && kinds.find(([, ,pattern])=>pattern.test(normalize(aiResponse.ticket?.title))));
  // A transport/booking enquiry may be resolved by a documented external route
  // or an unavailable service. Classification alone must not create that request.
  const explicitFollowup=/\b(sigue|todavia|aun|mismo problema|same problem|still|encore|toujours|immer noch|teneis (?:la|el)|ya esta|queda reservado|esta confirmada|habeis encontrado|is it (?:confirmed|ready)|do you have (?:the|my) request)\b/.test(text);
  const open=openTickets.map(t=>({...t,request_key:t.request_context?.request_key||t.request_key})).filter(t=>['open','in_progress'].includes(t.status)&&t.request_key);
  const previous=explicitFollowup ? matched ? open.find(t=>t.request_key===matched[0]) : open.length===1 ? open[0] : null : null;
  if (['airport_transfer','new_booking','parking','wifi_support'].includes(matched?.[0]) && !aiResponse?.create_ticket && !previous) return null;
  if(!matched && !previous && !aiResponse?.create_ticket)return null;
  if(matched && !previous && !actionable.test(text) && !aiResponse?.create_ticket)return null;
  const category=matched?.[1] || previous?.category || (['housekeeping','maintenance','complaint','emergency'].includes(aiResponse?.ticket?.category)?aiResponse.ticket.category:'reception');
  if(!['housekeeping','maintenance','complaint','reception','emergency'].includes(category))return null;
  const key=matched?.[0] || previous?.request_key || `request:${normalize(aiResponse?.ticket?.title || message).replace(/[^a-z0-9]+/g,'-').slice(0,90)}`;
  const danger=/incendio|humo|fire|smoke|gas leak|fuga de gas|electric.*agua|agua.*electric/.test(text);
  const damage=/fuga|gote|inund|leak|fuite|pierde agua|agua.*suelo|water.*floor/.test(text);
  return {key,category:danger?'emergency':category,priority:danger?'urgent':damage?'high':'normal',
    priority_reason:danger?'immediate_safety_risk':damage?'ongoing_water_damage':'guest_operational_request',
    title:(aiResponse?.ticket?.title || message).trim().slice(0,180),details:message.trim().slice(0,8000),
    new_incident:/\b(otra incidencia|otro problema|new issue|different problem|autre probleme)\b/.test(text)};
}
