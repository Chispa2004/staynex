// Deliberate opt-in: Dashboard and Inbox (including query variants) retain
// their existing shell, controls and spacing.
const compactRoutes = new Set([
  '/dashboard/tickets', '/dashboard/reservations', '/dashboard/health',
  '/dashboard/automations', '/dashboard/settings/users',
  '/dashboard/knowledge', '/dashboard/settings/knowledge',
  '/dashboard/settings/pms', '/dashboard/onboarding',
  '/dashboard/housekeeping', '/dashboard/maintenance',
  '/dashboard/settings/academy', '/settings', '/platform/hotels',
  '/dashboard/reception', '/dashboard/experience-bookings', '/dashboard/qr-rooms',
  '/dashboard/local-knowledge', '/dashboard/upsells', '/dashboard/experiences',
  '/dashboard/analytics', '/dashboard/ai-logs', '/dashboard/simulation',
  '/platform', '/platform/providers'
]);
export const usesCompactLayout = pathname => compactRoutes.has(pathname);
