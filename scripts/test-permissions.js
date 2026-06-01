import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canAccess,
  canAccessPlatform,
  canAccessRoute,
  canAccessRouteForContext,
  filterNavigationByRole,
  getPermissionsForRole
} from '../dashboard/lib/permissions.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const receptionistAllowedRoutes = [
  '/dashboard',
  '/dashboard/health',
  '/dashboard/reception',
  '/dashboard/inbox',
  '/dashboard/tickets',
  '/dashboard/qr-rooms',
  '/dashboard/knowledge',
  '/dashboard/settings/knowledge',
  '/dashboard/local-knowledge',
  '/dashboard/experience-bookings',
  '/dashboard/settings/academy'
];

for (const route of receptionistAllowedRoutes) {
  assert.equal(canAccessRoute('receptionist', route), true, `Receptionist should access ${route}`);
}

const receptionistBlockedRoutes = [
  '/dashboard/settings/pms',
  '/dashboard/settings/users',
  '/dashboard/automations',
  '/dashboard/simulation',
  '/dashboard/ai-logs',
  '/dashboard/onboarding',
  '/dashboard/guest-memory',
  '/dashboard/analytics',
  '/dashboard/upsells',
  '/dashboard/experiences',
  '/dashboard/reservations'
];

for (const route of receptionistBlockedRoutes) {
  assert.equal(canAccessRoute('receptionist', route), false, `Receptionist should not access ${route}`);
}

assert.equal(canAccess('receptionist', 'qr_rooms'), true, 'Receptionist can view QR Rooms');
assert.equal(canAccess('receptionist', 'qr_rooms_manage'), false, 'Receptionist cannot manage QR Rooms');
assert.equal(canAccess('receptionist', 'knowledge_base'), true, 'Receptionist can view Knowledge Base');
assert.equal(canAccess('receptionist', 'knowledge_base_manage'), true, 'Receptionist can manage operational Knowledge Base');
assert.equal(canAccess('receptionist', 'local_knowledge_manage'), true, 'Receptionist can manage operational Local Knowledge');
assert.equal(canAccess('receptionist', 'experience_bookings'), true, 'Receptionist can view Experience Bookings');
assert.equal(canAccess('receptionist', 'reception'), true, 'Receptionist can access Reception / Pre Check-in');
assert.equal(canAccess('receptionist', 'hotel_health'), true, 'Receptionist can access Hotel Operational Health');
assert.equal(canAccess('receptionist', 'experience_bookings_manage'), false, 'Receptionist cannot manage critical Experience Booking actions');
assert.equal(canAccess('receptionist', 'pms_connections'), false, 'Receptionist cannot access PMS setup');
assert.equal(canAccess('receptionist', 'automations'), false, 'Receptionist cannot access advanced Automations');
assert.equal(canAccess('receptionist', 'simulation'), false, 'Receptionist cannot access Simulation Mode');
assert.equal(canAccessPlatform('none', 'platform_console'), false, 'Hotel user cannot access platform console');
assert.equal(canAccessPlatform('none', 'ai_quality'), false, 'Hotel user cannot access AI Quality');
assert.equal(canAccessPlatform('none', 'platform_monitoring'), false, 'Hotel user cannot access Platform Monitoring');
assert.equal(canAccessPlatform('platform_admin', 'simulation'), true, 'Platform admin can access Simulation Mode');
assert.equal(canAccessPlatform('platform_admin', 'ai_quality'), true, 'Platform admin keeps AI Quality access');
assert.equal(canAccessPlatform('platform_admin', 'platform_monitoring'), true, 'Platform admin can access internal observability');
assert.equal(canAccessRouteForContext('admin', '/platform', 'none'), false, 'Hotel admin cannot access platform root');
assert.equal(canAccessRouteForContext('admin', '/platform/hotels', 'none'), false, 'Hotel admin cannot access platform hotels');
assert.equal(canAccessRouteForContext('admin', '/platform/providers', 'none'), false, 'Hotel admin cannot access platform providers');
assert.equal(canAccessRouteForContext('admin', '/platform/monitoring', 'none'), false, 'Hotel admin cannot access platform monitoring');
assert.equal(canAccessRouteForContext('admin', '/platform/hotels', 'platform_admin'), true, 'Platform admin can access platform hotels');
assert.equal(canAccessRouteForContext('admin', '/platform/providers', 'platform_admin'), true, 'Platform admin can access platform providers');
assert.equal(canAccessRouteForContext('admin', '/platform/monitoring', 'platform_admin'), true, 'Platform admin can access platform monitoring');
assert.equal(canAccessRouteForContext('admin', '/dashboard/simulation', 'none'), false, 'Hotel admin cannot access Simulation Mode');
assert.equal(canAccessRouteForContext('receptionist', '/dashboard/simulation', 'none'), false, 'Receptionist cannot access Simulation Mode');
assert.equal(canAccessRouteForContext('admin', '/dashboard/simulation', 'platform_admin'), true, 'Platform admin can access Simulation Mode through dashboard route');

assert.ok(getPermissionsForRole('admin').includes('qr_rooms_manage'), 'Admin keeps QR Rooms management');
assert.ok(getPermissionsForRole('admin').includes('pms_connections_manage'), 'Admin keeps PMS management');
assert.equal(getPermissionsForRole('admin').includes('simulation'), false, 'Hotel admin should not keep Simulation Mode');
assert.ok(getPermissionsForRole('manager').includes('qr_rooms_manage'), 'Manager keeps QR Rooms management');

const navigationGroups = [
  {
    id: 'ops',
    items: [
      { href: '/dashboard/inbox', label: 'Inbox' },
      { href: '/dashboard/tickets', label: 'Tickets' },
      { href: '/dashboard/health', label: 'Hotel Health' },
      { href: '/dashboard/reception', label: 'Reception / Pre Check-in' },
      { href: '/dashboard/experience-bookings', label: 'Experience Bookings' },
      { href: '/dashboard/qr-rooms', label: 'QR Rooms' },
      { href: '/dashboard/settings/pms', label: 'PMS' },
      { href: '/dashboard/automations', label: 'Automations' },
      { href: '/dashboard/simulation', label: 'Simulation' },
      { href: '/dashboard/settings/academy', label: 'Academy' },
      { href: '/dashboard/knowledge', label: 'Knowledge' }
    ]
  }
];

const receptionistNav = filterNavigationByRole(navigationGroups, 'receptionist')
  .flatMap((group) => group.items.map((item) => item.href));

assert.deepEqual(receptionistNav, [
  '/dashboard/inbox',
  '/dashboard/tickets',
  '/dashboard/health',
  '/dashboard/reception',
  '/dashboard/experience-bookings',
  '/dashboard/qr-rooms',
  '/dashboard/settings/academy',
  '/dashboard/knowledge'
]);

const academySource = readFileSync(join(root, 'dashboard/components/StaynexAcademyClient.js'), 'utf8');
const academyBlock = (id) => {
  const start = academySource.indexOf(`id: '${id}'`);
  assert.notEqual(start, -1, `Academy module ${id} should exist`);
  const next = academySource.indexOf("\n  {\n    id: '", start + 1);
  return academySource.slice(start, next === -1 ? academySource.length : next);
};
assert.ok(academySource.includes("title: 'Receptionist Academy'"), 'Receptionist Academy title should be present');
assert.ok(academySource.includes("id: 'ai-copilot'"), 'Receptionist Academy should cover AI Copilot');
assert.ok(academySource.includes("id: 'human-control'"), 'Receptionist Academy should cover human takeover');
assert.ok(academySource.includes("id: 'urgencies'"), 'Receptionist Academy should cover urgencies');
assert.equal(academyBlock('pms').includes("'receptionist'"), false, 'PMS Academy module must not be receptionist-facing');
assert.equal(academyBlock('whatsapp-qr').includes("'receptionist'"), false, 'WhatsApp setup Academy module must not be receptionist-facing');

const qrApiSource = readFileSync(join(root, 'dashboard/app/api/qr-rooms/route.js'), 'utf8');
assert.ok(qrApiSource.includes("canAccess(role, 'qr_rooms_manage')"), 'QR write APIs must require qr_rooms_manage');

const knowledgeSource = readFileSync(join(root, 'dashboard/lib/knowledge.js'), 'utf8');
assert.ok(knowledgeSource.includes('PROTECTED_KNOWLEDGE_CATEGORIES'), 'Knowledge Base should define protected admin categories');
assert.ok(knowledgeSource.includes("getKnowledgeContext(request, 'knowledge_base_manage')"), 'Knowledge writes should require knowledge_base_manage');

const appShellSource = readFileSync(join(root, 'dashboard/components/AppShell.js'), 'utf8');
const workspaceContextSource = readFileSync(join(root, 'dashboard/lib/workspace-context.js'), 'utf8');
const currentHotelSource = readFileSync(join(root, 'dashboard/lib/current-hotel.js'), 'utf8');
const platformHotelsSource = readFileSync(join(root, 'dashboard/components/PlatformHotelsClient.js'), 'utf8');
const platformConsoleSource = readFileSync(join(root, 'dashboard/components/PlatformConsoleClient.js'), 'utf8');
const platformHotelDetailSource = readFileSync(join(root, 'dashboard/components/PlatformHotelDetailClient.js'), 'utf8');
const receptionApiSource = readFileSync(join(root, 'dashboard/app/api/reception/route.js'), 'utf8');
const healthApiSource = readFileSync(join(root, 'dashboard/app/api/health/hotel/route.js'), 'utf8');

assert.ok(workspaceContextSource.includes('WORKSPACE_SELECTION_EVENT'), 'Workspace selection should broadcast an explicit tenant-change event');
assert.ok(workspaceContextSource.includes("params.get('hotelId')"), 'Workspace context should honor hotelId query params');
assert.ok(workspaceContextSource.includes('notify = false'), 'Workspace persistence should avoid reload loops by making notifications explicit');
assert.ok(currentHotelSource.includes("searchParams.get('hotelId')"), 'Current hotel resolver should honor hotelId query params');
assert.ok(currentHotelSource.indexOf("headers?.get('x-staynex-hotel-id')") < currentHotelSource.indexOf("cookies?.get?.(ACTIVE_HOTEL_COOKIE)"), 'Current hotel resolver should prefer explicit headers over stale cookies');
assert.ok(currentHotelSource.includes('x-staynex-workspace-path'), 'Current hotel resolver should know whether the user is opening hotel workspace routes');
assert.ok(currentHotelSource.includes("accessDeniedReason: 'workspace_required'"), 'Platform admins should be asked to select a hotel instead of falling back to a default workspace');
assert.ok(appShellSource.includes('window.addEventListener(WORKSPACE_SELECTION_EVENT'), 'AppShell should listen for explicit workspace changes');
assert.ok(appShellSource.includes('setWorkspaceRetryNonce((current) => current + 1)'), 'AppShell should reload workspace context after platform hotel selection');
assert.ok(appShellSource.includes("parsed.hotelId === currentHotel.id"), 'Support session must be scoped to the active hotel');
assert.ok(appShellSource.includes("'x-staynex-workspace-path': pathname || ''"), 'AppShell should pass the current route while resolving workspace context');
assert.ok(appShellSource.includes("router.replace('/platform/hotels')"), 'Workspace-required errors should guide platform admins back to Platform Hotels');
assert.ok(platformHotelsSource.includes("notify: true"), 'Platform Hotels enter workspace should notify AppShell');
assert.ok(platformHotelsSource.includes('/dashboard?hotelId='), 'Platform Hotels enter workspace should route with selected hotelId');
assert.ok(platformConsoleSource.includes('/dashboard?hotelId='), 'Platform console support access should route with selected hotelId');
assert.ok(platformHotelDetailSource.includes('/dashboard?hotelId='), 'Platform hotel detail support access should route with selected hotelId');
assert.ok(receptionApiSource.includes('getCurrentHotelForRequest'), 'Reception API should resolve the active hotel from workspace context');
assert.ok(receptionApiSource.includes('hotelId: hotel.id'), 'Reception API should pass the active hotelId to the service');
assert.ok(healthApiSource.includes('getCurrentHotelForRequest'), 'Hotel Health API should resolve the active hotel from workspace context');
assert.ok(healthApiSource.includes('hotelId: hotel.id'), 'Hotel Health API should pass the active hotelId to health builder');

assert.ok(appShellSource.includes("{ href: '/dashboard/health', labelKey: 'sidebar.health', icon: ShieldCheck }"), 'Hotel Health should be visible in hotel workspace operations navigation');
assert.ok(appShellSource.includes("{ href: '/dashboard/reception', labelKey: 'sidebar.reception', icon: ConciergeBell },\n      { href: '/dashboard/experience-bookings'"), 'Reception should sit in the main Operations sidebar before Experience Bookings');
assert.ok(appShellSource.includes('platformNavigationItems'), 'Platform sidebar should use a dedicated platform navigation set');
assert.ok(appShellSource.includes('/platform/hotels'), 'Platform sidebar should expose Hotels');
assert.ok(appShellSource.includes('/platform/providers'), 'Platform sidebar should expose Experience Providers');
assert.ok(appShellSource.includes('/platform/monitoring'), 'Platform sidebar should expose internal Monitoring');
assert.ok(appShellSource.includes('!isPlatformContext ? allowedNavigationGroups.map'), 'Hotel workspace navigation should be hidden in platform context');
assert.ok(appShellSource.includes('const showBackToPlatform = canAccessPlatformConsole && !isPlatformContext'), 'Back to Platform must only render for internal users inside hotel workspaces');
assert.ok(appShellSource.includes('Back to Platform'), 'Platform admins need a visible Back to Platform action in hotel workspaces');
assert.ok(appShellSource.includes('href="/platform/hotels"'), 'Back to Platform should return to the platform hotel directory');
assert.ok(appShellSource.includes('Hotel workspace view'), 'Internal hotel workspace view should be visually labelled');

console.log('Receptionist permission tests passed');
