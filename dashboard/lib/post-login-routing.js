import { canAccessPlatform, getFirstAllowedRoute } from './permissions.js';

export const INTERNAL_PLATFORM_ROLES = ['platform_admin', 'super_admin', 'internal_only'];

const normalizeHotelId = (hotelId) => String(hotelId || '').trim() || null;

export const appendHotelIdToRoute = (route, hotelId) => {
  const normalizedHotelId = normalizeHotelId(hotelId);

  if (!normalizedHotelId) {
    return route;
  }

  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}hotelId=${encodeURIComponent(normalizedHotelId)}`;
};

export const getPlatformRoleFromAssignments = (assignments = []) => {
  return ['super_admin','platform_admin','internal_only','support'].find(role => assignments.some(a => a.platform_role === role && (a.status || 'active') === 'active')) || 'none';
};

export const isInternalPlatformRole = (platformRole = 'none') => (
  INTERNAL_PLATFORM_ROLES.includes(platformRole)
);

export const resolvePostLoginDestination = ({
  assignments = [],
  memberships = [],
  requestedHotelId = null
} = {}) => {
  const activeAssignments = Array.isArray(assignments)
    ? assignments.filter((assignment) => (assignment.status || 'active') === 'active')
    : [];
  const normalizedRequestedHotelId = normalizeHotelId(requestedHotelId);
  const platformRole = getPlatformRoleFromAssignments(activeAssignments);
  const hasInternalPlatformAccess = isInternalPlatformRole(platformRole)
    && canAccessPlatform(platformRole, 'platform_console');

  if (hasInternalPlatformAccess) {
    if (normalizedRequestedHotelId) {
      return {
        defaultRoute: appendHotelIdToRoute('/dashboard', normalizedRequestedHotelId),
        selectedHotelId: normalizedRequestedHotelId,
        platformRole,
        reason: 'platform_active_workspace',
        requiresHotelSelection: false,
        accessDeniedReason: null
      };
    }

    return {
      defaultRoute: '/platform/hotels',
      selectedHotelId: null,
      platformRole,
      reason: 'platform_workspace_directory',
      requiresHotelSelection: false,
      accessDeniedReason: null
    };
  }

  if (normalizedRequestedHotelId && !activeAssignments.some(a => a.hotel_id === normalizedRequestedHotelId)) {
    return { defaultRoute: '/my-hotels', selectedHotelId: null, platformRole, reason: 'hotel_not_authorized', accessDeniedReason: 'hotel_not_authorized' };
  }
  if (!normalizedRequestedHotelId && (activeAssignments.length > 1 || memberships.some(m => m.role === 'org_admin' && m.status === 'active' && m.organization?.status === 'active'))) {
    return { defaultRoute: '/my-hotels', selectedHotelId: null, platformRole, reason: 'organization_directory', accessDeniedReason: null };
  }

  if (!activeAssignments.length) {
    return {
      defaultRoute: '/dashboard',
      selectedHotelId: null,
      platformRole,
      reason: 'no_active_assignment',
      requiresHotelSelection: false,
      accessDeniedReason: 'no_active_assignment'
    };
  }

  const requestedAssignment = normalizedRequestedHotelId
    ? activeAssignments.find((assignment) => assignment.hotel_id === normalizedRequestedHotelId)
    : null;
  const selectedAssignment = requestedAssignment
    || activeAssignments.find((assignment) => Boolean(assignment.is_default))
    || activeAssignments[0];
  const role = selectedAssignment?.role || 'blocked';
  const defaultRoute = appendHotelIdToRoute(
    getFirstAllowedRoute(role),
    selectedAssignment?.hotel_id
  );

  return {
    defaultRoute,
    selectedHotelId: selectedAssignment?.hotel_id || null,
    selectedAssignment,
    platformRole,
    reason: requestedAssignment
      ? 'requested_hotel'
      : activeAssignments.length === 1
        ? 'single_hotel_assignment'
        : selectedAssignment?.is_default
          ? 'default_hotel_assignment'
          : 'first_available_hotel_assignment',
    requiresHotelSelection: false,
    accessDeniedReason: null
  };
};
