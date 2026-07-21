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
  const platformAssignment = assignments.find((assignment) => (
    assignment.platform_role && assignment.platform_role !== 'none'
  ));

  return platformAssignment?.platform_role || 'none';
};

export const isInternalPlatformRole = (platformRole = 'none') => (
  INTERNAL_PLATFORM_ROLES.includes(platformRole)
);

export const resolvePostLoginDestination = ({
  assignments = [],
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
  const role = selectedAssignment?.role || 'owner';
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
