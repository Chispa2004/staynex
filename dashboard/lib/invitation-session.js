export const invitationTokenKey = 'staynex_pending_invitation';

// getSession awaits the SDK's URL initialization. Never erase its callback
// fragment first, and never turn a signup user without a session into a login.
export async function initializeInvitationSession({auth, location, history, storage}) {
  const value = new URLSearchParams(location.hash.slice(1)).get('token');
  if (value !== null) {
    if (/^[a-f0-9]{64}$/.test(value)) storage.setItem(invitationTokenKey, value);
    else storage.removeItem(invitationTokenKey);
  }
  const token = storage.getItem(invitationTokenKey) || '';
  try {
    if (!auth) throw Error('auth_unavailable');
    const session = await auth.getSession();
    if (session.error) throw session.error;
    if (!session.data?.session) return {token, user:null};
    const result = await auth.getUser();
    if (result.error) throw result.error;
    return {token, user:result.data?.user || null};
  } finally {
    // Clear credentials/errors from the address bar only after SDK processing.
    history.replaceState(null, '', '/invite');
  }
}

export function validateInvitationResult(value) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.hotelId)
    || typeof value.hotelName !== 'string' || !['admin','receptionist'].includes(value.role)
    || typeof value.accepted !== 'boolean') throw Error('No se pudo continuar. Reintenta.');
  return value;
}
