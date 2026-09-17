export const INTERNAL_ROLES = ['super_admin', 'platform_admin', 'internal_only', 'support'];
const roleOrder = ['owner', 'admin', 'manager', 'receptionist', 'analyst', 'housekeeping', 'maintenance'];
export const getInternalRole = (assignments = [], userId) => INTERNAL_ROLES.find(role => assignments.some(a => (
  a.user_id === userId && a.status === 'active' && a.platform_role === role
))) || 'none';

export const assignmentAuthorized = (assignment, memberships, userId) => {
  if (assignment.user_id !== userId || assignment.status !== 'active' || !assignment.hotel || !roleOrder.includes(assignment.role)
    || (assignment.platform_role && assignment.platform_role !== 'none')) return false;
  const organizationId = assignment.hotel.organization_id;
  // The only compatibility path: an explicitly unincorporated hotel and independent grant.
  if (!organizationId) return !assignment.organization_user_id;
  return memberships.some(m => m.organization_id === organizationId && m.user_id === userId
    && m.status === 'active' && m.organization?.status === 'active'
    && (!assignment.organization_user_id || (m.id === assignment.organization_user_id
      && m.role === 'org_admin' && !assignment.organization_grant_revoked)));
};

export const selectEffectiveAssignments = (assignments, memberships, userId) => {
  const result = new Map();
  for (const assignment of assignments.filter(a => assignmentAuthorized(a, memberships, userId))) {
    const previous = result.get(assignment.hotel_id);
    if (!previous || roleOrder.indexOf(assignment.role) < roleOrder.indexOf(previous.role)) result.set(assignment.hotel_id, assignment);
  }
  return [...result.values()];
};

export const assertHotelSelection = (assignments, hotelId) => {
  const assignment = assignments.find(a => a.hotel_id === hotelId);
  if (!assignment) { const error = new Error('Hotel not authorized'); error.status = 403; throw error; }
  return assignment;
};
