// Calendar validation shared by the bounded list client and offline adapter.
// These are local input rules, not an asserted provider response schema.
export const ubikosListOperations = Object.freeze(['checkin', 'checkout', 'inhouse']);
export const isUbikosListDay = value =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
