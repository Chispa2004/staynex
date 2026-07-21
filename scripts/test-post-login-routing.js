import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendHotelIdToRoute,
  resolvePostLoginDestination
} from '../dashboard/lib/post-login-routing.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const hotelAssignment = ({
  hotelId,
  role = 'admin',
  isDefault = false,
  platformRole = 'none',
  status = 'active'
}) => ({
  id: `${hotelId}-${role}`,
  hotel_id: hotelId,
  role,
  is_default: isDefault,
  platform_role: platformRole,
  status,
  hotel: {
    id: hotelId,
    name: `Hotel ${hotelId}`
  }
});

assert.equal(
  appendHotelIdToRoute('/dashboard', 'hotel-a'),
  '/dashboard?hotelId=hotel-a',
  'Hotel workspace routes should carry an explicit hotelId'
);
assert.equal(
  appendHotelIdToRoute('/dashboard/inbox?tab=unread', 'hotel-a'),
  '/dashboard/inbox?tab=unread&hotelId=hotel-a',
  'HotelId should be appended to routes that already contain query params'
);

const platformWithoutHotel = resolvePostLoginDestination({
  assignments: [
    hotelAssignment({
      hotelId: 'platform-anchor',
      role: 'owner',
      platformRole: 'platform_admin'
    })
  ]
});
assert.equal(platformWithoutHotel.defaultRoute, '/platform/hotels');
assert.equal(platformWithoutHotel.selectedHotelId, null);
assert.equal(platformWithoutHotel.reason, 'platform_workspace_directory');

const platformWithActiveHotel = resolvePostLoginDestination({
  requestedHotelId: 'melia-victoria',
  assignments: [
    hotelAssignment({
      hotelId: 'platform-anchor',
      role: 'owner',
      platformRole: 'platform_admin'
    })
  ]
});
assert.equal(platformWithActiveHotel.defaultRoute, '/dashboard?hotelId=melia-victoria');
assert.equal(platformWithActiveHotel.selectedHotelId, 'melia-victoria');
assert.equal(platformWithActiveHotel.reason, 'platform_active_workspace');

const singleHotelAdmin = resolvePostLoginDestination({
  assignments: [
    hotelAssignment({ hotelId: 'hotel-admin-a', role: 'admin', isDefault: true })
  ]
});
assert.equal(singleHotelAdmin.defaultRoute, '/dashboard?hotelId=hotel-admin-a');
assert.equal(singleHotelAdmin.selectedHotelId, 'hotel-admin-a');
assert.equal(singleHotelAdmin.reason, 'single_hotel_assignment');

const singleReceptionist = resolvePostLoginDestination({
  assignments: [
    hotelAssignment({ hotelId: 'hotel-reception-a', role: 'receptionist', isDefault: true })
  ]
});
assert.equal(singleReceptionist.defaultRoute, '/dashboard/inbox?hotelId=hotel-reception-a');
assert.equal(singleReceptionist.selectedHotelId, 'hotel-reception-a');

const multiHotelWithValidStoredHotel = resolvePostLoginDestination({
  requestedHotelId: 'hotel-b',
  assignments: [
    hotelAssignment({ hotelId: 'hotel-a', role: 'manager', isDefault: true }),
    hotelAssignment({ hotelId: 'hotel-b', role: 'manager' })
  ]
});
assert.equal(multiHotelWithValidStoredHotel.defaultRoute, '/dashboard?hotelId=hotel-b');
assert.equal(multiHotelWithValidStoredHotel.selectedHotelId, 'hotel-b');
assert.equal(multiHotelWithValidStoredHotel.reason, 'requested_hotel');

const staleStoredHotelForHotelUser = resolvePostLoginDestination({
  requestedHotelId: 'unauthorized-hotel',
  assignments: [
    hotelAssignment({ hotelId: 'hotel-a', role: 'manager', isDefault: true })
  ]
});
assert.equal(staleStoredHotelForHotelUser.defaultRoute, '/dashboard?hotelId=hotel-a');
assert.equal(staleStoredHotelForHotelUser.selectedHotelId, 'hotel-a');
assert.equal(staleStoredHotelForHotelUser.reason, 'single_hotel_assignment');

const noHotelAssignment = resolvePostLoginDestination({ assignments: [] });
assert.equal(noHotelAssignment.defaultRoute, '/dashboard');
assert.equal(noHotelAssignment.accessDeniedReason, 'no_active_assignment');

const loginRouteSource = readFileSync(join(root, 'dashboard/app/api/auth/resolve-invitations/route.js'), 'utf8');
assert.ok(loginRouteSource.includes('resolvePostLoginDestination'), 'Login resolver should use centralized post-login routing');
assert.ok(loginRouteSource.includes("headers.get('x-staynex-hotel-id')"), 'Login resolver should accept an explicit active workspace from the client');

const loginClientSource = readFileSync(join(root, 'dashboard/components/LoginClient.js'), 'utf8');
assert.ok(loginClientSource.includes('getActiveWorkspace'), 'Login client should pass the active workspace when it exists');
assert.ok(loginClientSource.includes('persistWorkspaceSelection'), 'Login client should persist resolved hotel context');

const appShellSource = readFileSync(join(root, 'dashboard/components/AppShell.js'), 'utf8');
assert.ok(appShellSource.includes("hotelContext.accessDeniedReason !== 'workspace_required'"), 'AppShell should special-case workspace selection requirements');
assert.ok(appShellSource.includes("router.replace('/platform/hotels')"), 'Platform users should be redirected to Platform Hotels instead of seeing a dead-end screen');
assert.ok(appShellSource.includes('Preparing your workspace...'), 'Workspace resolution should use a neutral loading state');
assert.equal(appShellSource.includes('Select a hotel workspace from Platform Hotels before opening hotel operations.'), false, 'Old mixed-language workspace error should not be shown');
assert.equal(appShellSource.includes('Back to Platform Hotels'), false, 'Old intermediate button copy should not be shown');

const currentHotelSource = readFileSync(join(root, 'dashboard/lib/current-hotel.js'), 'utf8');
assert.ok(currentHotelSource.includes('buildWorkspaceSelectionRequiredContext'), 'Current hotel resolver should centralize workspace-required handling');
assert.ok(currentHotelSource.includes('if (!requestedHotel && isHotelWorkspacePath(requestedWorkspacePath))'), 'Invalid platform workspace hotelIds should not fall back to another hotel');

console.log('Post-login workspace routing tests passed');
