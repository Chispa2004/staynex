export const maskPhoneForLogs = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : 'redacted';
};

export const hasReservationAccessTokenForLogs = (value) => Boolean(value);
