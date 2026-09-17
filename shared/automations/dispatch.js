// Only explicit non-acceptance is retryable. In particular, timeout/5xx/connection
// loss are not evidence that Messages.create did not create a resource.
export const classifyAutomationProviderError = (error) => {
  if (error?.automationSendNotAttempted === true) {
    return { phase: 'rejected', code: 'provider_not_attempted', retry: true };
  }
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    && error.status !== 408 && Number.isInteger(error?.code)) {
    return { phase: 'rejected', code: `twilio_${error.code}`, retry: error.status === 429 };
  }
  return { phase: 'unknown', code: 'provider_result_unknown', retry: false };
};

export const classifyAutomationProviderResult = (result) => {
  const sid = /^SM[0-9a-f]{32}$/i.test(result?.sid || '') ? result.sid : null;
  // A resource SID proves creation, not delivery. Even failed/undelivered
  // resources must not be recreated by a generic queue retry.
  return { phase: sid ? 'accepted' : 'unknown', code: sid ? null : 'provider_result_unknown',
    retry: false, sid, providerStatus: String(result?.status || '').slice(0, 80) || null };
};

export const dispatchRpc = async (supabase, name, args) => {
  const { data, error } = await supabase.rpc(`automation_dispatch_${name}`, args);
  if (error) throw error; // Missing migration is a hard stop, never a legacy fallback.
  return Array.isArray(data) ? data[0] || null : data;
};

export const requestAutomationRetry = async ({ supabase, messageId, hotelId }) => (
  dispatchRpc(supabase, 'retry', { p_message_id: messageId, p_hotel_id: hotelId })
);
