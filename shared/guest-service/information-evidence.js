// Bounded information topics, shared by retrieval, prompts and read-only drafts.
// Classification is not authority: only active, scoped, non-conflicting facts qualify.
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const questionText=value=>norm(value).replace(/^[¿¡\s]+/,'').replace(/^(?:(?:so|then|and|entonces|y)[, ]+)+/,'');
const topics=[['breakfast',/desayun|breakfast|petit dejeuner|fruhstuck/],['reception',/recepcion|reception/],
 ['luggage',/equipaje|maletas?|luggage|bags/],['cot',/cunas?|\bcots?\b|crib/],['checkout',/check.?out|salida tardia|late departure/],
 ['checkin',/check.?in|hora.*entrada/],['pool',/piscina|pool/],['gym',/gimnasio|gym/],['wifi',/wi.?fi|internet/]];
export const informationTopic=text=>topics.find(([,pattern])=>pattern.test(norm(text)))?.[0]||null;
export function informationTurnTopic(message,history=[]) {
 const topic=informationTopic(message);if(topic)return topic;
 const text=questionText(message);
 // Only an information follow-up inherits a topic. A new request never does.
 if(text.length>150 || !/^(?:what about|is that|is it|is \d{1,2}:\d{2}|where|when|donde|a que hora|es (?:ese|esa)|sigue vigente|do i need|you (?:can|cannot|can't) confirm|no podeis confirmar)/.test(text))return null;
 for(const previous of [...history].reverse().filter(m=>m.sender_type==='guest' && norm(m.content)!==text).slice(0,4)) {
  const found=informationTopic(previous.content);if(found)return found;
  if(!isInformationQuestion(previous.content))return null;
 }
 return null;
}
export function isInformationQuestion(message) {
 const text=questionText(message);
 return /^(?:a que hora|cual|como |donde|cuando|hay |teneis |ofrece|what |which |when |where |how |is |are |does |do (?:you|i)|you (?:can|cannot|can't) confirm|no podeis confirmar|can (?:i|you) (?:store|keep)|podeis guardar|puedo dejar)/.test(text)
  && !/necesito|solicito|quiero (?:una|dos)|^i need|please bring|could you bring/.test(text);
}
export function unambiguousKnowledge(rows=[],hotelId) {
 const scoped=rows.filter(r=>r && (!r.hotel_id||r.hotel_id===hotelId)&&r.is_active!==false);
 const values=new Map();
 for(const r of scoped){const key=informationTopic([r.key,r.title].join(' '))||norm(r.key||r.title||r.id);if(!values.has(key))values.set(key,new Set());values.get(key).add(norm(r.value).trim());}
 return scoped.filter(r=>values.get(informationTopic([r.key,r.title].join(' '))||norm(r.key||r.title||r.id))?.size===1);
}
export function informationEvidence({message,history=[],knowledge=[],hotelId}) {
 const topic=informationTurnTopic(message,history.filter(m=>!m.hotel_id||m.hotel_id===hotelId));if(!topic)return null;
 if(!isInformationQuestion(message) && !/^(?:¿)?(?:y |and |what about|is that|where|donde)/.test(norm(message)))return null;
 const rows=unambiguousKnowledge(knowledge,hotelId).filter(r=>informationTopic([r.key,r.title].join(' '))===topic);
 const candidates=knowledge.filter(r=>r&&(!r.hotel_id||r.hotel_id===hotelId)&&r.is_active!==false&&informationTopic([r.key,r.title].join(' '))===topic);
 return {topic,confirmed:rows.length===1&&Boolean(rows[0].value),value:rows.length===1?rows[0].value:null,
   reason:new Set(candidates.map(r=>norm(r.value).trim())).size>1?'conflicting':'missing'};
}
