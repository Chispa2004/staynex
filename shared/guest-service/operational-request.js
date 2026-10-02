const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Bounded, deterministic action intents supplement the model. The original
// message is retained in the ticket, including quantities and unparsed details.
const kinds=[
  ['air_conditioning','maintenance',/aire acondicionado|air condition|climatis|klimaanlage|aria condizion|ar condicionado/],
  ['water_leak','maintenance',/fuga|gote|inund|water leak|leaking|fuite|wasseraustritt|perdita d.acqua/],
  ['towels','housekeeping',/toallas?|towels?|serviettes?|handtuch|handtucher|asciugaman|toalhas?/],
  ['cleaning','housekeeping',/limpiez|limpiar|clean (?:my |the )?room|nettoy|reinig|pulizi|limpeza/],
  ['noise','complaint',/ruido|noise|bruit|larm|rumore|barulho/],
  ['lost_property','reception',/olvid|perdid|lost|left (?:my|a|the)|oublie|verlor|dimentic|esquec/]
];
const actionable=/necesit|pido|pedi|podri|(?:pod|pued).*(?:traer|enviar|llevar)|traig|quiero|quisiera|solicit|hay |sigue|no funciona|gote|fuga|pierde agua|dej[eé]|olvide|me falta|need|please|could you|can you (?:bring|send|clean)|not work|leak|lost|left my|besoin|pourriez|bitte|brauche|vorrei|preciso|por favor/;
const informational=/^(?:a que hora|cual es el horario|what time|when does|quand|wann|a che ora|qual.*horario)/;
export function interpretOperationalRequest({message='',aiResponse=null,openTickets=[]}) {
  const text=normalize(message).replace(/^[^a-z0-9]+/,'');
  if(informational.test(text))return null;
  const matched=kinds.find(([, ,pattern])=>pattern.test(text));
  const explicitFollowup=/\b(sigue|todavia|aun|mismo problema|same problem|still|encore|toujours|immer noch)\b/.test(text);
  const open=openTickets.map(t=>({...t,request_key:t.request_context?.request_key||t.request_key})).filter(t=>['open','in_progress'].includes(t.status)&&t.request_key);
  const previous=!matched && explicitFollowup && open.length===1 ? open[0] : null;
  if(!matched && !previous && !aiResponse?.create_ticket)return null;
  if(matched && !actionable.test(text) && !aiResponse?.create_ticket)return null;
  const category=matched?.[1] || previous?.category || (['housekeeping','maintenance','complaint','emergency'].includes(aiResponse?.ticket?.category)?aiResponse.ticket.category:'reception');
  if(!['housekeeping','maintenance','complaint','reception','emergency'].includes(category))return null;
  const key=matched?.[0] || previous?.request_key || `request:${normalize(aiResponse?.ticket?.title || message).replace(/[^a-z0-9]+/g,'-').slice(0,90)}`;
  const danger=/incendio|humo|fire|smoke|gas leak|fuga de gas|electric.*agua|agua.*electric/.test(text);
  const damage=/fuga|gote|inund|leak|fuite|pierde agua/.test(text);
  return {key,category:danger?'emergency':category,priority:danger?'urgent':damage?'high':'normal',
    priority_reason:danger?'immediate_safety_risk':damage?'ongoing_water_damage':'guest_operational_request',
    title:(aiResponse?.ticket?.title || message).trim().slice(0,180),details:message.trim().slice(0,8000),
    new_incident:/\b(otra incidencia|otro problema|new issue|different problem|autre probleme)\b/.test(text)};
}
