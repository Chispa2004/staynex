import { manualDelivery, normalizeManualDelivery } from '../../shared/manual-send/contract.js';
export const getManualSessionStorage = () => {
  try { return window.sessionStorage; } catch { return null; }
};

export const readManualRecovery = (storage, key) => {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value.text === 'string' && typeof value.attemptId === 'string'
      ? { ...value, delivery: normalizeManualDelivery(value.delivery) } : null;
  } catch { return null; }
};
export const blocksSameManualSend = (recovery, text) => Boolean(recovery && recovery.text === text.trim()
  && (recovery.delivery.status !== 'failed' || !recovery.delivery.retryable));

// A stale/uncertain DB row cannot erase a confirmation received for this exact
// message in this browser session. This is presentation only, never a DB write.
export const getManualMessageDelivery = (message, recovery) => {
  if (!message.metadata?.manual_send) return null;
  const stored = normalizeManualDelivery(message.metadata.manual_send);
  const local = normalizeManualDelivery(recovery?.delivery);
  if (stored.status === 'unknown' && recovery?.attemptId === message.id
    && recovery.text === message.content && ['accepted', 'delivered'].includes(local.status)) {
    return { ...local, persisted: false };
  }
  return stored;
};

// Synchronous lock precedes every await; persistence precedes dispatch. Restoring
// recovery data never calls request(), and unknown operations are never retried.
export const runManualAttempt = async ({ lock, key, text, attemptId, request, persist, onPending, onResult }) => {
  if (lock.size) return null;
  lock.add(key);
  let recovery = { text, attemptId, delivery: manualDelivery('unknown', 'dispatch_unconfirmed') };
  try {
    try { persist(recovery); } catch {
      recovery.delivery = manualDelivery('failed', 'local_recovery_failed');
      onResult(recovery, null);return recovery;
    }
    onPending();
    let result;
    try { result = await request(); } catch { result = { delivery: manualDelivery('unknown', 'response_unknown') }; }
    recovery = { ...recovery, delivery: normalizeManualDelivery(result?.delivery) };
    try { persist(recovery); } catch { /* The pre-dispatch unknown receipt remains conservative. */ }
    onResult(recovery, result?.message || null);
    return recovery;
  } finally { lock.delete(key); }
};
