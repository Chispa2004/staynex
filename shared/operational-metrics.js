// Read-only, shared definitions for the existing Tickets and Reservations cards.
export const OPERATIONAL_CARDS = {
  tickets: ['urgent_risk', 'satisfaction_risk', 'ai_prioritized'],
  reservations: ['total', 'arrivingSoon', 'stayingNow', 'completed']
};
export const reservationDay = (value, timezone) => {
  try {
    if (!timezone) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  } catch { return null; }
};
export const plusDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const cancelled = new Set(['cancelled', 'canceled', 'no_show', 'void']);
const completed = new Set(['completed', 'checked_out', 'departed']);
export const reservationState = (row, day) => {
  const status = String(row.status || '').toLowerCase();
  if (cancelled.has(status)) return 'cancelled';
  if (completed.has(status) || (row.departure_date && row.departure_date < day)) return 'completed';
  if (row.arrival_date && row.departure_date && row.arrival_date <= day && row.departure_date >= day) return 'in_house';
  return 'upcoming';
};
export function operationalMatch(kind, row, metric, day) {
  if (metric === 'all' || metric === 'total') return true;
  if (kind === 'tickets') {
    if (metric === 'urgent_risk') return row.copilot?.aiPriority?.level === 'urgent' || row.priority === 'urgent';
    if (metric === 'satisfaction_risk') return row.copilot?.satisfactionRisk?.level === 'high';
    if (metric === 'ai_prioritized') return Boolean(row.copilot?.aiPriority?.level && row.copilot.aiPriority.level !== 'low');
    return false;
  }
  const state = reservationState(row, day);
  if (metric === 'arrivingSoon') return state !== 'cancelled' && Boolean(row.arrival_date && row.arrival_date >= day && row.arrival_date <= plusDays(day, 7));
  if (metric === 'stayingNow') return state === 'in_house';
  if (metric === 'today_arrivals') return state !== 'cancelled' && row.arrival_date === day;
  if (metric === 'today_departures') return state !== 'cancelled' && row.departure_date === day;
  return state === metric;
}
const invalid = () => Object.assign(new Error('Filtro operativo no válido.'), { status: 400 });
export function parseOperationalFilter(params, kind) {
  const allowed = kind === 'tickets' ? [...OPERATIONAL_CARDS.tickets, 'all'] : [...OPERATIONAL_CARDS.reservations, 'all', 'upcoming', 'in_house', 'cancelled', 'today_arrivals', 'today_departures'];
  const metric = params.get('metric') || (kind === 'tickets' ? 'all' : 'upcoming');
  const date = params.get('date');
  const hotelId = params.get('hotelId');
  const page = Number(params.get('page') || 1), pageSize = Number(params.get('pageSize') || 10);
  const q = params.get('q') || '';
  const status = params.get('status') || 'all', priority = params.get('priority') || 'all', category = params.get('category') || 'all';
  if (!allowed.includes(metric) || !Number.isSafeInteger(page) || page < 1 || ![10,25,50].includes(pageSize) || q.length > 200) throw invalid();
  if (hotelId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hotelId)) throw invalid();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw invalid();
  if (!['all','open','in_progress','completed'].includes(status) || !['all','low','normal','high','urgent'].includes(priority) || !/^[a-z_]{1,50}$/.test(category)) throw invalid();
  if (kind === 'reservations' && (status !== 'all' || priority !== 'all' || category !== 'all')) throw invalid();
  return {metric,date,hotelId,page,pageSize,q,status,priority,category};
}
export function selectOperationalRows(kind, rows, filter, {hotelId, timezone, now = new Date().toISOString()}) {
  if (!hotelId || (filter.hotelId && filter.hotelId !== hotelId) || rows.some(r => r.hotel_id !== hotelId)) throw Object.assign(new Error('Acceso al hotel denegado.'), {status:403});
  const day = filter.date || reservationDay(now, timezone);
  const dated = kind === 'reservations';
  if (dated && !reservationDay(now, timezone)) throw Object.assign(new Error('Zona horaria del hotel no disponible.'),{status:503});
  const stats = Object.fromEntries(OPERATIONAL_CARDS[kind].map(metric => [metric, rows.filter(row => operationalMatch(kind,row,metric,day)).length]));
  const matching = rows.filter(row => operationalMatch(kind,row,filter.metric,day));
  const query = filter.q.trim().toLowerCase();
  const filtered = matching.filter(row =>
    (filter.status === 'all' || row.status === filter.status) &&
    (filter.priority === 'all' || row.priority === filter.priority) &&
    (filter.category === 'all' || row.category === filter.category) &&
    (!query || (kind === 'tickets' ? [row.title,row.description,row.room_number] : [row.guest_name,row.guest_email,row.guest_phone,row.pms_reservation_id,row.reservation_access_token]).some(v => v && String(v).toLowerCase().includes(query)))
  );
  const page = Math.min(filter.page, Math.max(1, Math.ceil(filtered.length/filter.pageSize)));
  return {stats,items:filtered.slice((page-1)*filter.pageSize,page*filter.pageSize),total:filtered.length,metricTotal:matching.length,page,pageSize:filter.pageSize,filter:{...filter,date:dated?day:null,hotelId,page},timezone,readAt:now,categories:[...new Set(rows.map(r=>r.category).filter(Boolean))].sort()};
}
export function operationalHref(kind, current, changes = {}) {
  const params = new URLSearchParams(current);
  params.delete('view');
  for (const [key,value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key); else params.set(key,String(value));
  }
  if (!Object.hasOwn(changes,'page')) params.delete('page');
  return `/dashboard/${kind}?${params}`;
}
