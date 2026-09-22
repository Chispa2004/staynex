// Read-only request lifecycle. A deadline includes session lookup and body parsing.
export const HEALTH_REQUEST_TIMEOUT_MS = 10000;
export const emptyHealthState = () => ({ payload: null, obtainedAt: null, status: 'loading', error: null });

export const createHealthRequest = ({ getHotelId, getHeaders, fetchHealth = fetch, onChange,
  timeoutMs = HEALTH_REQUEST_TIMEOUT_MS, now = () => new Date().toISOString() }) => {
  let state = emptyHealthState();
  let sequence = 0;
  let active = null;
  let tenant = getHotelId();
  const publish = (next) => { state = next; onChange(next); };
  const cancel = () => { sequence += 1; active?.abort(); active = null; };
  const load = async ({ reset = false } = {}) => {
    cancel();
    const id = sequence;
    const hotelId = getHotelId();
    if (reset || hotelId !== tenant) state = emptyHealthState();
    tenant = hotelId;
    const controller = new AbortController();
    active = controller;
    publish({ ...state, status: state.payload ? 'refreshing' : 'loading', error: null });
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('timeout'));
          controller.abort();
        }, timeoutMs);
      });
      const body = await Promise.race([deadline, (async () => {
        const headers = await getHeaders({ hotelId });
        if (controller.signal.aborted) throw new Error('cancelled');
        const response = await fetchHealth('/api/health/hotel', { headers, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? 'denied' : response.status === 504 ? 'timeout' : 'network');
        const value = await response.json();
        if (value?.ok !== true || !value.health || !value.hotelId
          || !Array.isArray(value.health.statusCards) || !Array.isArray(value.health.warnings)
          || !['complete', 'partial', 'unavailable'].includes(value.health.coverage?.status)
          || (hotelId && value.hotelId !== hotelId)) throw new Error('invalid');
        return value;
      })()]);
      if (id !== sequence) return;
      if (hotelId !== getHotelId()) { publish({ ...emptyHealthState(), status: 'error', error: 'changed' }); return; }
      publish({ payload: body, obtainedAt: now(), status: 'success', error: null });
    } catch (error) {
      if (id !== sequence) return;
      if (hotelId !== getHotelId()) { publish({ ...emptyHealthState(), status: 'error', error: 'changed' }); return; }
      publish({ ...state, status: state.payload ? 'stale' : 'error', error: ['timeout', 'denied', 'invalid'].includes(error.message) ? error.message : 'network' });
    } finally {
      clearTimeout(timer);
      if (id === sequence) active = null;
    }
  };
  return { load, cancel };
};

export const healthErrorText = (error) => ({
  timeout: 'La consulta ha tardado demasiado. Vuelve a intentarlo.',
  denied: 'No tienes acceso a la salud de este hotel. Revisa la sesión y vuelve a intentarlo.',
  changed: 'El hotel ha cambiado. Actualiza la información.',
  invalid: 'No se ha podido verificar la respuesta de Salud. Vuelve a intentarlo.',
  network: 'No se pudo consultar Salud. Comprueba la conexión y vuelve a intentarlo.'
}[error] || '');

export const presentHealth = (state) => {
  const health = state.payload?.health;
  const historical = Boolean(health && state.status !== 'success');
  const status = state.status === 'loading' ? 'loading' : historical ? 'stale' : health?.overallStatus || 'unavailable';
  return {
    status, historical,
    score: !health || historical || !Number.isFinite(health.healthScore) ? '—' : `${health.healthScore}%`,
    warnings: !health || historical || health.coverage?.status !== 'complete' ? '—' : health.warnings.length,
    allOperational: state.status === 'success' && health?.coverage?.status === 'complete'
      && health?.overallStatus === 'healthy' && health?.warnings?.length === 0
  };
};
