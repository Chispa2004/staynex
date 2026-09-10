// Plain-text Body contract of the existing Twilio Messages API. No coercion.
export const MANUAL_MESSAGE_MAX_LENGTH = 1600;
export const manualSendError = (code, statusCode = 400, retryable = false) => (
  Object.assign(new Error(code), { code, statusCode, retryable, manualSendSafe: true })
);
export const validateManualSend = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw manualSendError('invalid_body');
  if (typeof body.conversationId !== 'string' || !body.conversationId.trim() || body.conversationId.length > 128) throw manualSendError('invalid_conversation');
  if (typeof body.message !== 'string') throw manualSendError('invalid_text');
  const message = body.message.trim();
  if (!message) throw manualSendError('empty_text');
  if (message.length > MANUAL_MESSAGE_MAX_LENGTH) throw manualSendError('text_too_long');
  if (body.attemptId !== undefined && (typeof body.attemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.attemptId))) throw manualSendError('invalid_attempt');
  if (body.staffLanguage !== undefined && typeof body.staffLanguage !== 'string') throw manualSendError('invalid_language');
  return { conversationId: body.conversationId, message, attemptId: body.attemptId, staffLanguage: body.staffLanguage };
};
export const manualDelivery = (status, reason, retryable = false, extra = {}) => ({
  version: 1, status, reason, retryable: status === 'failed' && retryable, ...extra
});
export const normalizeManualDelivery = (delivery) => (
  delivery?.version === 1 && ['accepted', 'delivered', 'failed', 'unknown'].includes(delivery.status)
    ? { ...delivery, retryable: delivery.status === 'failed' && delivery.retryable === true }
    : manualDelivery('unknown', 'response_unknown')
);
export const manualDeliveryText = (delivery) => {
  const value = normalizeManualDelivery(delivery);
  if (value.status === 'accepted') return value.persisted === false
    ? 'Aceptado por el proveedor. No se pudo guardar la confirmación; no repitas el envío.'
    : 'Aceptado por el proveedor. Entrega todavía no confirmada.';
  if (value.status === 'delivered') return 'Entregado: el proveedor ha confirmado la entrega.';
  if (value.status === 'unknown') return 'Resultado sin confirmar. Conservamos el texto. Revisa el historial antes de enviar otro mensaje; no se reintentará automáticamente.';
  return ({
    invalid_body: 'No se pudo validar la solicitud.', invalid_text: 'El mensaje debe ser texto.',
    empty_text: 'Escribe un mensaje antes de enviarlo.', text_too_long: 'El mensaje supera los 1600 caracteres. Acórtalo antes de enviarlo.',
    invalid_conversation: 'Selecciona una conversación válida.', invalid_language: 'Revisa el idioma de envío.',
    access_denied: 'No tienes permiso para responder en esta conversación.', invalid_attempt: 'No se pudo validar este intento. Revisa el historial.',
    recipient_unavailable: 'No hay un destinatario válido para esta conversación. Revisa sus datos.',
    persistence_failed: 'No enviado: no se pudo guardar el intento. El texto está disponible para reintentar.',
    translation_failed: 'No enviado: no se pudo preparar la traducción. Puedes reintentar.',
    provider_unavailable: 'No enviado: el servicio de WhatsApp no está disponible. Avisa a administración.',
    provider_rejected: 'El proveedor rechazó el envío. Revisa el destinatario o consulta con administración.',
    provider_busy: 'El proveedor rechazó este intento temporalmente. Puedes reintentar.',
    local_recovery_failed: 'No enviado: no se pudo conservar el borrador en esta pestaña. Revisa el almacenamiento del navegador.'
  })[value.reason] || 'El mensaje no se ha enviado. Revisa la conversación antes de continuar.';
};

export const classifyManualProviderError = (error) => {
  if (error?.manualSendNotAttempted) return manualDelivery('failed', 'provider_unavailable');
  // A transport timeout/5xx does not establish whether Messages.create succeeded.
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    && error.status !== 408 && Number.isInteger(error.code)) {
    return manualDelivery('failed', error.status === 429 ? 'provider_busy' : 'provider_rejected', error.status === 429);
  }
  return manualDelivery('unknown', 'provider_unknown');
};
export const classifyManualProviderResult = (result) => {
  if (typeof result?.sid !== 'string' || !/^SM[0-9a-f]{32}$/i.test(result.sid)) return manualDelivery('unknown', 'provider_unknown');
  const evidence = { provider_sid: result.sid, provider_status: result.status || null };
  if (['delivered', 'read'].includes(result.status)) return manualDelivery('delivered', 'provider_confirmed', false, evidence);
  if (['failed', 'undelivered', 'canceled'].includes(result.status)) return manualDelivery('failed', 'provider_rejected', false, evidence);
  return manualDelivery('accepted', 'provider_accepted', false, evidence);
};
