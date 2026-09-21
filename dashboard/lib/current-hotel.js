import { getSupabaseAdmin } from './supabase';
import { canAccessPlatform, getPermissionsForPlatformRole, getPermissionsForRole } from './permissions';
import {
  getUserHotelAssignments,
  normalizeAuthEmail,
  resolvePendingInvitationsForUser
} from './user-invitations';

const DEMO_HOTEL_SLUG = 'staynex-demo';
const ACTIVE_HOTEL_COOKIE = 'staynex_active_hotel_id';

const isMissingHotelIdentitySchema = (error) => (
  error?.message?.includes('hotel_users')
  || error?.message?.includes('slug')
  || error?.details?.includes('hotel_users')
  || error?.details?.includes('slug')
  || error?.hint?.includes('hotel_users')
  || error?.hint?.includes('slug')
);

const getBearerToken = (request) => {
  const header = request?.headers?.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const getRequestedWorkspacePath = (request) => (
  request?.headers?.get('x-staynex-workspace-path') || ''
);

const isHotelWorkspacePath = (pathname = '') => (
  pathname === '/dashboard'
  || pathname.startsWith('/dashboard/')
  || pathname === '/settings'
);

const getRequestedHotelId = (request) => {
  const headerHotelId = request?.headers?.get('x-staynex-hotel-id');

  if (headerHotelId) {
    return headerHotelId;
  }

  try {
    const url = request?.url ? new URL(request.url) : null;
    const queryHotelId = url?.searchParams.get('hotelId')
      || url?.searchParams.get('hotel')
      || url?.searchParams.get('workspace')
      || url?.searchParams.get('tenant');

    if (queryHotelId) {
      return queryHotelId;
    }
  } catch {
    // Ignore malformed request URLs and continue with cookie fallback.
  }

  return request?.cookies?.get?.(ACTIVE_HOTEL_COOKIE)?.value || null;
};

const getHotelById = async (supabase, hotelId) => {
  if (!hotelId) {
    return null;
  }

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq('id', hotelId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const normalizeHotelUser = (row) => ({
  id: row.id,
  hotel_id: row.hotel_id,
  user_id: row.user_id || null,
  email: row.email || null,
  role: row.role || 'receptionist',
  status: row.status || 'active',
  platform_role: row.platform_role || 'none',
  multi_property_access: Boolean(row.multi_property_access),
  preferred_dashboard_language: row.preferred_dashboard_language || 'es',
  preferred_translation_language: row.preferred_translation_language || row.preferred_dashboard_language || 'es',
  is_default: Boolean(row.is_default),
  invited_at: row.invited_at || null,
  accepted_at: row.accepted_at || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null
});

const chooseHotelAssignment = (assignments, requestedHotelId, { allowRequested = true } = {}) => {
  if (!assignments.length) {
    return null;
  }

  if (allowRequested && requestedHotelId) {
    const requested = assignments.find((assignment) => assignment.hotel_id === requestedHotelId);

    if (requested) {
      return requested;
    }
  }

  if (requestedHotelId) return null;
  return assignments.find((assignment) => assignment.is_default) || assignments[0];
};

const resolveTenantAccess = (assignments = []) => {
  const platformAssignment = ['super_admin','platform_admin','internal_only','support'].map(role => assignments.find(assignment => assignment.platform_role === role)).find(Boolean);
  const platformRole = platformAssignment?.platform_role || 'none';
  const multiPropertyAccess = assignments.some((assignment) => Boolean(assignment.multi_property_access));
  const canSwitchWorkspaces = canAccessPlatform(platformRole, 'workspace_switch') || multiPropertyAccess || new Set(assignments.map(a => a.hotel_id)).size > 1;
  const canCreateWorkspaces = canAccessPlatform(platformRole, 'workspace_create');

  return {
    platformRole,
    platformPermissions: getPermissionsForPlatformRole(platformRole),
    multiPropertyAccess,
    canSwitchWorkspaces,
    canCreateWorkspaces
  };
};

const getAllHotelWorkspaces = async (supabase) => {
  const hotels = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('hotels').select('*').order('name').order('id').range(offset, offset + 499);
    if (error) throw error;
    hotels.push(...(data || []));
    if ((data || []).length < 500) return hotels;
  }
};

const buildWorkspaceSelectionRequiredContext = async ({
  supabase,
  assignments,
  tenantAccess,
  userId,
  email
}) => ({
  supabase,
  hotel: null,
  hotelUser: null,
  role: 'blocked',
  permissions: [],
  platformRole: tenantAccess.platformRole,
  platformPermissions: tenantAccess.platformPermissions,
  multiPropertyAccess: tenantAccess.multiPropertyAccess,
  canSwitchWorkspaces: tenantAccess.canSwitchWorkspaces,
  canCreateWorkspaces: tenantAccess.canCreateWorkspaces,
  availableHotels: (await getAllHotelWorkspaces(supabase)).map((workspaceHotel) => {
    const assignment = assignments.find((item) => item.hotel_id === workspaceHotel.id);
      return {
        hotel: workspaceHotel,
        hotelUser: assignment ? normalizeHotelUser(assignment) : null,
        role: assignment?.role || 'blocked',
        isDefault: Boolean(assignment?.is_default)
      };
  }),
  fallback: false,
  accessDenied: true,
  accessDeniedReason: 'workspace_required',
  user: { id: userId, email }
});

const buildAccessDeniedContext = ({
  supabase,
  reason = 'unauthorized',
  userId = null,
  email = null,
  tenantAccess = null
} = {}) => {
  const platformRole = tenantAccess?.platformRole || 'none';

  return {
    supabase,
    hotel: null,
    hotelUser: null,
    role: 'blocked',
    permissions: [],
    platformRole,
    platformPermissions: tenantAccess?.platformPermissions || getPermissionsForPlatformRole(platformRole),
    multiPropertyAccess: Boolean(tenantAccess?.multiPropertyAccess),
    canSwitchWorkspaces: Boolean(tenantAccess?.canSwitchWorkspaces),
    canCreateWorkspaces: Boolean(tenantAccess?.canCreateWorkspaces),
    availableHotels: [],
    fallback: false,
    accessDenied: true,
    accessDeniedReason: reason,
    user: userId || email ? { id: userId, email } : null
  };
};

export const getDefaultHotel = async (supabase = getSupabaseAdmin()) => {
  const { data: demoHotel, error: demoError } = await supabase
    .from('hotels')
    .select('*')
    .eq('slug', DEMO_HOTEL_SLUG)
    .limit(1)
    .maybeSingle();

  if (!demoError && demoHotel) {
    return demoHotel;
  }

  if (demoError && !isMissingHotelIdentitySchema(demoError)) {
    throw demoError;
  }

  const { data: firstHotel, error: firstHotelError } = await supabase
    .from('hotels')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstHotelError) {
    throw firstHotelError;
  }

  return firstHotel;
};

export const getCurrentHotelForRequest = async (request) => {
  const supabase = getSupabaseAdmin();
  const token = getBearerToken(request);
  const requestedHotelId = getRequestedHotelId(request);
  const requestedWorkspacePath = getRequestedWorkspacePath(request);
  let userId = null;
  let email = null;
  let authUser = null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);

    if (!error) {
      authUser = data.user || null;
      userId = authUser?.id || null;
      email = normalizeAuthEmail(authUser?.email);
    } else {
      console.warn('Current hotel auth lookup failed', error.message);
      return buildAccessDeniedContext({
        supabase,
        reason: 'invalid_session'
      });
    }
  }

  if (!userId) {
    return buildAccessDeniedContext({
      supabase,
      reason: token ? 'invalid_session' : 'missing_session'
    });
  }

  if (userId) {
    try {
      await resolvePendingInvitationsForUser({ supabase, user: authUser });
    } catch (error) {
      if (!isMissingHotelIdentitySchema(error)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Pending invitation resolution skipped', error.message);
        }
      }
    }

    let assignments = [];

    try {
      assignments = await getUserHotelAssignments({
        supabase,
        userId,
        email,
        statuses: ['active']
      });
      if (process.env.NODE_ENV !== 'production') {
        console.info('hotel assignments found', {
          count: assignments?.length || 0,
          requestedHotelId: requestedHotelId || null
        });
      }
    } catch (error) {
      // The organization migration is a deployment prerequisite. Schema errors fail closed.
      throw error;
    }

    if (Array.isArray(assignments) && assignments.length > 0) {
      const tenantAccess = resolveTenantAccess(assignments);
      if (
        tenantAccess.canSwitchWorkspaces
        && tenantAccess.platformRole !== 'none'
        && !requestedHotelId
        && isHotelWorkspacePath(requestedWorkspacePath)
      ) {
        return buildWorkspaceSelectionRequiredContext({
          supabase,
          assignments,
          tenantAccess,
          userId,
          email
        });
      }

      const canUseRequestedHotel = true;
      const selectedAssignment = chooseHotelAssignment(assignments, requestedHotelId, {
        allowRequested: canUseRequestedHotel
      });
      let hotel = selectedAssignment?.hotel || await getHotelById(supabase, selectedAssignment?.hotel_id);

      if (tenantAccess.canSwitchWorkspaces && tenantAccess.platformRole !== 'none' && requestedHotelId) {
        const requestedHotel = await getHotelById(supabase, requestedHotelId);

        hotel = requestedHotel;
      }

      if (hotel) {
        // Internal access has its own policy; never borrow another hotel's role.
        const internal = tenantAccess.platformRole !== 'none';
        const selectedAssignmentForHotel = internal ? {
          hotel_id: hotel.id, user_id: userId, email, status: 'active',
          role: tenantAccess.platformRole === 'support' ? 'analyst' : 'admin'
        } : assignments.find((assignment) => assignment.hotel_id === hotel.id);
        if (!selectedAssignmentForHotel) {
          return buildAccessDeniedContext({
            supabase,
            reason: 'hotel_assignment_missing',
            userId,
            email,
            tenantAccess
          });
        }

        if (selectedAssignment?.user_id === null) {
          await supabase
            .from('hotel_users')
            .update({
              user_id: userId,
              accepted_at: selectedAssignment.accepted_at || new Date().toISOString(),
              status: 'active'
            })
            .eq('id', selectedAssignment.id);
        }

        const hotelUser = normalizeHotelUser({
          ...selectedAssignmentForHotel,
          hotel_id: hotel.id,
          user_id: selectedAssignmentForHotel?.user_id || userId,
          email: selectedAssignmentForHotel?.email || email,
          role: selectedAssignmentForHotel?.role || 'blocked',
          status: selectedAssignmentForHotel?.status || 'active',
          platform_role: tenantAccess.platformRole,
          multi_property_access: tenantAccess.multiPropertyAccess
        });
        let organization = selectedAssignmentForHotel.organization || null;
        if (internal && hotel.organization_id) {
          const result = await supabase.from('organizations').select('id,name,kind,status').eq('id', hotel.organization_id).maybeSingle();
          if (result.error) throw result.error;
          organization = result.data;
        }
        const availableHotels = tenantAccess.canSwitchWorkspaces
          ? (
            tenantAccess.platformRole !== 'none'
              ? (await getAllHotelWorkspaces(supabase)).map((workspaceHotel) => {
                const assignment = assignments.find((item) => item.hotel_id === workspaceHotel.id);
                return {
                  hotel: workspaceHotel,
                  hotelUser: assignment ? normalizeHotelUser(assignment) : null,
                  role: assignment?.role || 'blocked',
                  isDefault: Boolean(assignment?.is_default)
                };
              })
              : assignments
                .filter((assignment) => assignment.hotel)
                .map((assignment) => ({
                  hotel: assignment.hotel,
                  hotelUser: normalizeHotelUser(assignment),
                  role: assignment.role || 'receptionist',
                  isDefault: Boolean(assignment.is_default)
                }))
          )
          : [{
            hotel,
            hotelUser,
            role: hotelUser.role,
            isDefault: true
          }];

        return {
          supabase,
          hotel,
          organization,
          hotelUser,
          role: hotelUser.role,
          permissions: getPermissionsForRole(hotelUser.role),
          platformRole: tenantAccess.platformRole,
          platformPermissions: tenantAccess.platformPermissions,
          multiPropertyAccess: tenantAccess.multiPropertyAccess,
          canSwitchWorkspaces: tenantAccess.canSwitchWorkspaces,
          canCreateWorkspaces: tenantAccess.canCreateWorkspaces,
          availableHotels,
          fallback: false,
          user: { id: userId, email }
        };
      }

      return buildAccessDeniedContext({
        supabase,
        reason: requestedHotelId ? 'hotel_not_authorized' : 'hotel_not_found',
        userId,
        email,
        tenantAccess
      });
    }

    if (Array.isArray(assignments) && assignments.length === 0) {
      const allAssignments = await getUserHotelAssignments({
        supabase,
        userId,
        email,
        statuses: null,
        includeHotels: false
      }).catch((error) => {
        if (isMissingHotelIdentitySchema(error)) {
          return null;
        }

        throw error;
      });

      if (Array.isArray(allAssignments) && allAssignments.length > 0) {
        const disabled = allAssignments.every((assignment) => assignment.status === 'disabled');
        const invited = allAssignments.some((assignment) => assignment.status === 'invited');

        return {
          supabase,
          hotel: null,
          hotelUser: null,
          role: 'blocked',
          permissions: [],
          availableHotels: [],
          fallback: false,
          accessDenied: true,
          accessDeniedReason: disabled
            ? 'disabled'
            : invited
              ? 'invitation_pending'
              : 'no_active_assignment',
          user: { id: userId, email }
        };
      }

      return {
        supabase,
        hotel: null,
        hotelUser: null,
        role: 'blocked',
        permissions: [],
        availableHotels: [],
        fallback: false,
        accessDenied: true,
        accessDeniedReason: 'no_active_assignment',
        user: { id: userId, email }
      };
    }


  }

  return buildAccessDeniedContext({
    supabase,
    reason: 'authorization_context_unresolved',
    userId,
    email
  });
};
