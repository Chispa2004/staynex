export const PENDING_TICKET_STATUSES = ['open', 'pending', 'in_progress'];
export const isPendingTicket = row => PENDING_TICKET_STATUSES.includes(row.status);
const rank = {urgent: 4, high: 3, normal: 2, low: 1};
// Tickets exposes persisted priority and the existing copilot escalation. Never
// downgrade an explicitly assigned normal/high/urgent priority.
export const effectiveTicketPriority = row => (rank[row.copilot?.aiPriority?.level] || 0) > (rank[row.priority] || 0)
  ? row.copilot.aiPriority.level : (rank[row.priority] ? row.priority : 'normal');
export const comparePendingTickets = (a,b) => rank[effectiveTicketPriority(b)] - rank[effectiveTicketPriority(a)]
  || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || a.id.localeCompare(b.id);
export const isNewTicket = (row, now) => {
  const age = Date.parse(now) - Date.parse(row.created_at);
  return Number.isFinite(age) && age >= 0 && age <= 86400000;
};
export function dashboardTicketContext(params, hotelId) {
  const result = new URLSearchParams({from:'dashboard',hotelId});
  for (const [key,allowed] of [['attentionOrigin',['traced','simulated','unknown']],['ticketOrigin',['other','simulated']]]) {
    const value=params.get(key); if(allowed.includes(value)) result.set(key,value);
  }
  return result;
}
export function ticketDashboardReturn(params) {
  const hotelId=params.get('hotelId');
  if(params.get('from')!=='dashboard' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hotelId || '')) return null;
  const result=dashboardTicketContext(params,hotelId);result.delete('from');
  return '/dashboard?'+result;
}
