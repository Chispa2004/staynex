const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, status) => Object.assign(new Error(message), {status});
const mutate = async ({supabase, hotelId, actor, platformRole, confirm, expectedArchivedAt = null, expectedUpdatedAt = null}, action) => {
  if (!['platform_admin','super_admin','internal_only'].includes(platformRole) || !actor?.id) throw fail('Se requiere administración de Staynex.',403);
  if (!uuid.test(hotelId || '') || confirm !== true) throw fail('Confirma la operación y el hotel correcto.',400);
  for(const value of [expectedArchivedAt,expectedUpdatedAt])if(value!==null&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw fail('Versión del hotel no válida. Recarga antes de continuar.',400);
  if (action === 'restore' && !expectedArchivedAt) throw fail('Recarga el archivo antes de restaurar.',409);
  const {data,error} = await supabase.rpc('hotel_lifecycle_v1', {p_hotel_id:hotelId,p_actor:actor.id,p_action:action,p_expected_archived_at:expectedArchivedAt,p_expected_updated_at:expectedUpdatedAt});
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === 'P0001' ? 409 : 503;
    throw fail(status === 503 ? 'Archivado no disponible. No se ha confirmado ningún cambio; recarga y reintenta. Se requiere el contrato de base de datos revisado.' : error.message,status);
  }
  if (!data?.ok || data.hotel?.id !== hotelId || data.action !== action) throw fail('Respuesta incompleta. Recarga para comprobar el estado antes de reintentar.',503);
  return data;
};
export const archiveHotelWorkspace = (args) => mutate(args,'archive');
export const restoreHotelWorkspace = (args) => mutate(args,'restore');
