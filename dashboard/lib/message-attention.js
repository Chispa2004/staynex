import { canAccess, canManageHumanTakeover } from './permissions.js';
import { validateAttentionRequest, validAttentionSnapshot, attentionError, attentionDashboardDTO, attentionDashboardUnavailable, ATTENTION_ORIGINS } from '../../shared/message-attention/contract.js';

// Reuse existing operator permissions without granting support or fallback sessions mutation rights.
export const canManageMessageAttention = context => Boolean(context?.user?.id && context?.hotel?.id
  && context.hotelUser?.user_id === context.user.id && context.hotelUser?.hotel_id === context.hotel.id
  && context.hotelUser?.status === 'active' && context.hotelUser?.role === context.role
  && context.platformRole !== 'support' && context.hotelUser?.platform_role !== 'support' && !context.fallback
  && canAccess(context.role,'inbox_human_takeover') && canManageHumanTakeover(context));
const rpcError = error => {
  if (['40001','23505'].includes(error?.code)) return attentionError('El estado cambió. Actualiza y revisa los mensajes.',409);
  if (error?.code === '42501') return attentionError('No tienes permiso para estos mensajes.',403);
  if (['22023','22P02'].includes(error?.code)) return attentionError('Revisa el alcance de la selección.',400);
  return attentionError('Seguimiento no disponible. No se ha confirmado el cambio.',503);
};
export const handleAttentionRequest = async ({ request, getContext }) => {
  try {
    const context = await getContext(request);
    if (!context?.user?.id) throw attentionError('Authentication required',401);
    if (!context.hotel?.id || !canAccess(context.role,'inbox')) throw attentionError('Access denied',403);
    const body = validateAttentionRequest(await request.json());
    const canManage = canManageMessageAttention(context);
    if (body.action !== 'read' && !canManage) throw attentionError('Access denied',403);
    const args = { p_hotel:context.hotel.id, p_conversation:body.conversationId };
    const { data, error } = body.action === 'read'
      ? await context.supabase.rpc('staynex_attention_read_v1',{...args,p_ids:body.messageIds})
      : await context.supabase.rpc('staynex_attention_transition_v1',{...args,p_actor:context.user.id,
        p_operation:body.operationId,p_target:body.action,p_items:body.items});
    if (error) throw rpcError(error);
    if (!validAttentionSnapshot(data,context.hotel.id,body.conversationId,body.action==='read'?body.messageIds:body.items.map(item=>item.messageId)))
      throw attentionError('Seguimiento no disponible. Actualiza antes de continuar.',503);
    return { status:200, body:{...data,canManage} };
  } catch (error) {
    return {status:error.status || error.statusCode || 503,body:{error: error.status ? error.message : 'Seguimiento no disponible. No se ha confirmado el cambio.'}};
  }
};
export const loadAttentionDashboard = async ({ supabase, hotelId, origin='traced', urgentOnly=false, cursor=null }) => {
  if (!hotelId || !ATTENTION_ORIGINS.includes(origin)) return attentionDashboardUnavailable();
  try {
    const {data,error} = await supabase.rpc('staynex_attention_dashboard_v1',{
      p_hotel:hotelId,p_origin:origin,p_urgent_only:urgentOnly,p_cursor_at:cursor?.at || null,p_cursor_id:cursor?.id || null
    });
    return error ? attentionDashboardUnavailable() : attentionDashboardDTO(data,hotelId);
  } catch { return attentionDashboardUnavailable(); }
};
