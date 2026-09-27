import { validAttentionSnapshot } from '../../shared/message-attention/contract.js';

export const validateAttentionPayload = (data, hotelId, conversationId, ids) => {
  if (!validAttentionSnapshot(data, hotelId, conversationId, ids) || typeof data.canManage !== 'boolean') {
    throw Object.assign(new Error('Respuesta de seguimiento incompleta o incompatible.'), { kind: 'incompatible' });
  }
  return data;
};

// A reader belongs to exactly one hotel/conversation/message set. Dispose on
// scope/auth changes. Both successes and failures must belong to the latest read.
export function createAttentionReader(read, publish, timeoutMs = 15000) {
  let sequence = 0, disposed = false, controller;
  const cancel = () => { sequence++; controller?.abort(); };
  return {
    cancel,
    dispose() { disposed = true; cancel(); },
    async refresh() {
      if (disposed) return;
      cancel();
      const ticket = sequence;
      controller = new AbortController();
      const requestController = controller;
      const signal = requestController.signal;
      publish({ status: 'loading', snapshot: null });
      let timer;
      try {
        const snapshot = await Promise.race([read(signal), new Promise((_, reject) => {
          timer = setTimeout(() => { requestController.abort(); reject(Object.assign(new Error('timeout'), {kind:'timeout'})); }, timeoutMs);
        })]);
        if (disposed || ticket !== sequence) return;
        if (!snapshot) throw Object.assign(new Error('Contexto no confirmado.'), {kind:'context'});
        publish({ status: 'ready', snapshot });
      } catch (error) {
        if (disposed || ticket !== sequence) return;
        const kind = error.status === 401 ? 'session' : error.status === 403 ? 'forbidden'
          : error.kind || (signal.aborted ? 'timeout' : 'error');
        publish({ status: kind, snapshot: null });
      } finally { clearTimeout(timer); }
    }
  };
}

export const attentionReadText = state => ({
  loading: 'Cargando seguimiento…',
  session: 'La sesión ha caducado. Vuelve a iniciar sesión para consultar el seguimiento.',
  forbidden: 'No tienes permiso para consultar el seguimiento de esta conversación.',
  incompatible: 'La respuesta de seguimiento está incompleta. No se puede confirmar el estado.',
  context: 'El contexto cambió. Vuelve a abrir la conversación.',
  timeout: 'La consulta de seguimiento tardó demasiado. Puedes reintentar.',
  error: 'No se pudo consultar el seguimiento. Puedes reintentar.'
}[state.status] || (state.snapshot?.items.length === 0 ? 'No hay mensajes del huésped con seguimiento en esta conversación.'
  : state.snapshot?.items.every(row => row.status === 'untracked') ? 'Estos mensajes históricos no tienen seguimiento anterior.' : 'Atención por mensaje'));

export const controlFromState = (state, available = true) => {
  if (!available) return { status:'unknown', mode:null };
  const mode = state?.state_metadata?.conversation_ai_mode || 'ai_active';
  return ['ai_active','human_takeover','ai_paused','escalation_lock'].includes(mode)
    ? {status:'confirmed', mode} : {status:'unknown', mode:null};
};
export const conversationControl = conversation => {
  const control = conversation?.control;
  const confirmed = control?.status === 'confirmed' && ['ai_active','human_takeover','ai_paused','escalation_lock'].includes(control.mode);
  return { confirmed, mode: confirmed ? control.mode : null, human: confirmed && control.mode !== 'ai_active' };
};
export const copilotControlAction = (conversation, canReply = false) => {
  const control = conversationControl(conversation);
  if (!control.confirmed) return {title:'Comprobar el control de la conversación', detail:'No se ha podido confirmar quién tiene el control ni si las respuestas automáticas están pausadas. Actualiza antes de actuar.', tone:'amber'};
  if (control.human) return {title:canReply ? 'Revisar y responder manualmente' : 'Revisión por el equipo autorizado',
    detail:canReply ? 'El equipo tiene el control. Las respuestas automáticas están pausadas. Revisa el borrador antes de responder; no se ha enviado.'
      : 'El equipo tiene el control y las respuestas automáticas están pausadas. Tu sesión es de solo lectura; un usuario autorizado debe responder.', tone:'orange'};
  return null;
};
