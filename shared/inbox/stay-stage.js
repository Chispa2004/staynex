// Historical classification: never use today's date or a message's wording.
export const STAY_STAGES = { all: 'Todas las etapas', pre: 'Antes de llegar', stay: 'Durante la estancia', post: 'Después de salir', unknown: 'Sin clasificar' };
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const time = value => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value || '') ? value.slice(0,5) : null;
export function messageStayStage(message, conversation, reservations, hotel) {
  if (!hotel?.id || conversation?.hotel_id !== hotel.id || message?.hotel_id !== hotel.id
    || message.conversation_id !== conversation.id || !Number.isFinite(Date.parse(message.created_at))) return 'unknown';
  const explicit = message.metadata?.reservation_id || conversation.reservation_id;
  const candidates = reservations.filter(r => r.hotel_id === hotel.id && r.guest_id === conversation.guest_id && (!explicit || r.id === explicit));
  if (candidates.length !== 1) return 'unknown';
  const reservation = candidates[0];
  if (!day(reservation.arrival_date) || !day(reservation.departure_date) || reservation.departure_date < reservation.arrival_date) return 'unknown';
  let local;
  try {
    if (!hotel.timezone) return 'unknown';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:hotel.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(message.created_at)).map(p=>[p.type,p.value]));
    local = {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
  } catch { return 'unknown'; }
  if (local.date < reservation.arrival_date) return 'pre';
  if (local.date > reservation.departure_date) return 'post';
  const arrival = time(hotel.check_in_time), departure = time(hotel.check_out_time);
  // Date-only reservations cannot establish the boundary without hotel hours.
  if (local.date === reservation.arrival_date && !arrival || local.date === reservation.departure_date && !departure) return 'unknown';
  if (local.date === reservation.arrival_date && local.time < arrival) return 'pre';
  if (local.date === reservation.departure_date && local.time >= departure) return 'post';
  return 'stay';
}
export const conversationStages = conversation => [...new Set((conversation.messages || []).filter(m=>m.sender_type === 'guest').map(m=>m.stayStage || 'unknown'))];
export const matchesInboxScope = (conversation, stage = 'all', origin = 'all') => (conversation.messages || []).some(m => m.sender_type === 'guest'
  && (stage === 'all' || (m.stayStage || 'unknown') === stage) && (origin === 'all' || m.inboxOrigin === origin))
  || (stage === 'all' && origin === 'all' && !(conversation.messages || []).some(m=>m.sender_type === 'guest'));
export const demoReplyLabel = message => message?.metadata?.demo_ai?.version === 1
  ? message.metadata.demo_ai.draft ? 'Demo · borrador generado por IA · sin envío real' : 'Demo · respuesta generada por IA · sin envío real' : null;

export async function readAllInboxRows(makeQuery, pageSize = 500) {
  const rows = [], seen = new Set();
  for (let start = 0;; start += pageSize) {
    const {data, error} = await makeQuery().range(start, start + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Inbox: lectura incompleta');
    for (const row of data) {
      if (!row.id || seen.has(row.id)) throw new Error('Inbox: datos cambiaron durante la lectura; reintenta');
      seen.add(row.id); rows.push(row);
    }
    if (data.length < pageSize) return rows;
  }
}

export const inboxFilterUrl = (href,key,value) => {
  const url = new URL(href);
  if (!['q','stage','origin','filter'].includes(key)) throw Error('Unknown Inbox filter');
  if (!value || value === 'all') url.searchParams.delete(key); else url.searchParams.set(key,value);
  return url.pathname+url.search;
};
export function filterInboxConversations({items,stage='all',origin='all',query='',filter='all',unread=()=>0,human=()=>false,urgent=()=>false,vip=()=>false,searchText=c=>[c.guestName,...(c.messages||[]).map(m=>m.content)].join(' ')}) {
  return items.filter(c=>matchesInboxScope(c,stage,origin) && (!query.trim() || searchText(c).toLowerCase().includes(query.trim().toLowerCase()))
    && (filter==='unread'?unread(c)>0:filter==='human'?human(c):filter==='urgent'?urgent(c):filter==='vip'?vip(c):filter==='ai'?!human(c):true));
}
