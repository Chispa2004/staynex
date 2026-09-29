// Catalog labels and saved credentials do not establish connectivity.
export const pmsActions = (provider, connection, canManage) => ({
  configure: Boolean(canManage),
  test: Boolean(canManage && provider.key === 'apaleo' && connection?.enabled && connection?.has_client_secret && !['mock','simulation','simulated'].includes(connection.metadata?.connection_mode)),
  sync: Boolean(canManage && provider.key === 'apaleo' && connection?.enabled && connection?.has_client_secret && !['mock','simulation','simulated'].includes(connection.metadata?.connection_mode))
});
export const pmsEvidence = (provider, connection, receipt = {}) => {
  const metadata = connection?.metadata || {};
  const mode = metadata.connection_mode || connection?.connection_mode;
  const environment = ['mock','simulation','simulated'].includes(mode) ? 'Configuración marcada como simulación; no acredita una API real'
    : mode === 'sandbox' ? 'Sandbox declarado; requiere evidencia del proveedor'
      : provider.key === 'apaleo' ? 'API real de Apaleo; el tipo de cuenta no está acreditado'
        : 'Configuración manual; integración externa pendiente';
  const test = receipt.test || (metadata.last_test_at ? {
    status: metadata.last_test_result === 'activation_required' ? 'activation_required' : 'unknown', at: metadata.last_test_at
  } : {status:'unknown',at:null});
  // Legacy sync_status is shared by test and sync writers. A sync timestamp
  // proves a recorded import, never current connectivity or a successful test.
  const sync = receipt.sync || {
    status: connection?.sync_status === 'failed' ? 'failed'
      : connection?.last_sync_at ? (connection.sync_status === 'partial_success' ? 'partial' : 'recorded') : 'unknown',
    at: connection?.last_sync_at || null, historical: Boolean(connection?.last_sync_at),
    previous: connection?.sync_status === 'failed'
  };
  return {
    configuration: !connection ? 'Sin configuración guardada' : connection.enabled ? 'Configuración guardada' : 'Configuración guardada; deshabilitada',
    environment, test, sync, external: provider.key !== 'apaleo',
    legacyTest: !receipt.test && connection?.sync_status === 'connected', summary: metadata.last_sync_summary || null
  };
};
export const pmsResultLabel = status => ({
  success:'Prueba de lectura correcta', sync_success:'Sincronización completada',
  failed:'Último intento fallido', partial:'Sincronización parcial', recorded:'Sincronización registrada',
  timeout:'Sin confirmación; comprueba el estado antes de reintentar',
  activation_required:'Pendiente de intervención de Staynex', unknown:'Sin comprobación acreditada'
}[status] || 'Sin comprobación acreditada');
export const validatePmsPayload = (body, hotelId) => {
  if (!hotelId || body?.hotelId !== hotelId || body?.ok !== true
    || body.hotel?.id !== hotelId || !Array.isArray(body.providers) || !Array.isArray(body.connections)
    || body.connections.some(item => item.hotel_id !== hotelId)) throw new Error('pms_invalid_response');
  return body;
};
// Bind successes and failures to the initiating hotel and archive revision.
export const createPmsRequestScope = getContext => {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    begin() {
      const current = ++generation, context = getContext();
      return { ...context, valid: () => {
        const next = getContext();
        return current === generation && context.hotelId === next.hotelId && context.revision === next.revision;
      }};
    }
  };
};
