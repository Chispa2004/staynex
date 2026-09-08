// Attention is a human attestation about explicit incoming message identities.
export const ATTENTION_CONTRACT = 1;
export const ATTENTION_BATCH_LIMIT = 50;
export const ATTENTION_ORIGINS = ['traced', 'simulated', 'unknown'];
export const isAttentionMessage = message => message?.sender_type === 'guest'
  && !['system_event', 'preview', 'draft', 'translation_only', 'automation_type'].some(key =>
    Object.prototype.hasOwnProperty.call(message.metadata || {}, key));
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isAttentionId = uuid;
export const acceptsAttentionResponse = (started,current) => started.generation===current.generation
  && started.hotelId===current.hotelId && started.authorization===current.authorization;
export const attentionError = (message, status = 400) => Object.assign(new Error(message), { status });
export const validateAttentionRequest = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw attentionError('Invalid request');
  const read = body.action === 'read';
  const allowed = read ? ['action', 'conversationId', 'messageIds'] : ['action', 'conversationId', 'operationId', 'items'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || !uuid(body.conversationId)) throw attentionError('Invalid request scope');
  if (read) {
    if (!Array.isArray(body.messageIds) || body.messageIds.length > 3000 || body.messageIds.some(id => !uuid(id))
      || new Set(body.messageIds).size !== body.messageIds.length) throw attentionError('Invalid message identities');
    return body;
  }
  if (!['resolved', 'pending'].includes(body.action) || !uuid(body.operationId) || !Array.isArray(body.items)
    || !body.items.length || body.items.length > ATTENTION_BATCH_LIMIT) throw attentionError('Invalid transition');
  if (body.items.some(item => !item || Object.keys(item).some(key => !['messageId','expectedVersion','expectedStatus'].includes(key))
    || !uuid(item.messageId) || !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 0
    || !['untracked','pending','resolved'].includes(item.expectedStatus)
    || (item.expectedStatus === 'untracked') !== (item.expectedVersion === 0))
    || new Set(body.items.map(item => item.messageId)).size !== body.items.length) throw attentionError('Expected states required');
  return body;
};
export const freezeAttentionOperation = ({ conversationId, selected, action, operationId }) =>
  validateAttentionRequest({ conversationId, action, operationId,
    items: selected.map(item => ({ messageId: item.messageId, expectedStatus: item.status, expectedVersion: item.version })) });

export const validAttentionSnapshot = (data,hotelId,conversationId,ids) => data?.contract === 1 && data.hotelId === hotelId
  && data.conversationId === conversationId && Array.isArray(data.items) && data.items.length === ids.length
  && new Set(data.items.map(item=>item.messageId)).size === ids.length
  && data.items.every(item=>ids.includes(item.messageId) && ['untracked','pending','resolved'].includes(item.status)
    && Number.isSafeInteger(item.version) && item.version>=0 && (item.status==='untracked')===(item.version===0)
    && (item.status==='untracked' ? item.changedAt===null : Number.isFinite(Date.parse(item.changedAt))));

export const attentionDashboardUnavailable = () => ({
  coverage: 'incomplete', pending: [], nextCursor: null,
  counters: Object.fromEntries(['received','resolved','pending','urgent'].map(key => [key,{value:null,detail:'Seguimiento no disponible'}])),
  scope: 'Seguimiento no disponible. No se asumen estados ni totales.'
});
export const attentionDashboardDTO = (data, hotelId) => {
  if (data?.contract !== 1 || data.hotelId !== hotelId || !ATTENTION_ORIGINS.includes(data.origin)
    || !Array.isArray(data.pending) || data.pending.length > 8 || !data.counters
    || new Set(data.pending.map(item=>item.id)).size !== data.pending.length
    || data.pending.some(item=>!uuid(item.id) || !uuid(item.conversationId) || item.origin!==data.origin || item.status!=='Pendiente'
      || (data.urgentOnly && item.priority!=='urgent'))
    || ['received','resolved','pending','urgent'].some(key => data.counters[key] !== null
      && (!Number.isSafeInteger(data.counters[key]) || data.counters[key] < 0))) return attentionDashboardUnavailable();
  const details = { received: 'Recibidos hoy', resolved: 'Marcados como atendidos hoy y actualmente resueltos',
    pending: 'Ahora · con seguimiento de atención', urgent: 'Ahora · pendientes con alerta vigente' };
  return { coverage:'complete', origin:data.origin, urgentOnly:data.urgentOnly, nextCursor:data.nextCursor,
    counters: Object.fromEntries(Object.keys(details).map(key => [key,{ value:data.counters[key],
      detail:data.counters[key] === null ? 'Fuente o periodo no disponible' : details[key] }])),
    pending:data.pending.map(item => ({...item,title:item.title || 'Mensaje sin texto',
      href:'/dashboard/inbox?conversationId=' + encodeURIComponent(item.conversationId),actionLabel:'Abrir conversación'})),
    scope:'Con seguimiento de atención. Históricos sin clasificar excluidos. Hoy usa la zona horaria del hotel.' };
};
