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

const getRequestedHotelId = (request) => (
  request?.headers?.get('x-staynex-hotel-id')
  || request?.cookies?.get?.(ACTIVE_HOTEL_COOKIE)?.value
  || null
);

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

  return assignments.find((assignment) => assignment.is_default) || assignments[0];
};

const resolveTenantAccess = (assignments = []) => {
  const platformAssignment = assignments.find((assignment) => (
    assignment.platform_role && assignment.platform_role !== 'none'
  ));
  const platformRole = platformAssignment?.platform_role || 'none';
  const multiPropertyAccess = assignments.some((assignment) => Boolean(assignment.multi_property_access));
  const canSwitchWorkspaces = canAccessPlatform(platformRole, 'workspace_switch') || multiPropertyAccess;
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
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

const getLegacyAssignmentForUser = async ({ supabase, userId }) => {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('hotel_users')
    .select('hotel_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error && !isMissingHotelIdentitySchema(error)) {
    throw error;
  }

  return data || null;
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
    }
  }

  if (userId) {
    try {
      await resolvePendingInvitationsForUser({ supabase, user: authUser });
    } catch (error) {
      if (!isMissingHotelIdentitySchema(error)) {
        throw error;
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
      assignments = isMissingHotelIdentitySchema(error) ? null : (() => { throw error; })();
    }

    if (Array.isArray(assignments) && assignments.length > 0) {
      const tenantAccess = resolveTenantAccess(assignments);
      const canUseRequestedHotel = tenantAccess.canSwitchWorkspaces;
      const selectedAssignment = chooseHotelAssignment(assignments, requestedHotelId, {
        allowRequested: canUseRequestedHotel
      });
      let hotel = selectedAssignment?.hotel || await getHotelById(supabase, selectedAssignment?.hotel_id);

      if (tenantAccess.canSwitchWorkspaces && tenantAccess.platformRole !== 'none' && requestedHotelId) {
        hotel = await getHotelById(supabase, requestedHotelId) || hotel;
      }

      if (hotel) {
        const selectedAssignmentForHotel = assignments.find((assignment) => assignment.hotel_id === hotel.id) || selectedAssignment;
        if (selectedAssignment.user_id === null) {
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
          role: selectedAssignmentForHotel?.role || 'owner',
          status: selectedAssignmentForHotel?.status || 'active',
          platform_role: tenantAccess.platformRole,
          multi_property_access: tenantAccess.multiPropertyAccess
        });
        const availableHotels = tenantAccess.canSwitchWorkspaces
          ? (
            tenantAccess.platformRole !== 'none'
              ? (await getAllHotelWorkspaces(supabase)).map((workspaceHotel) => {
                const assignment = assignments.find((item) => item.hotel_id === workspaceHotel.id);
                return {
                  hotel: workspaceHotel,
                  hotelUser: assignment ? normalizeHotelUser(assignment) : null,
                  role: assignment?.role || 'owner',
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

    if (assignments === null) {
      const legacyAccess = await getLegacyAssignmentForUser({ supabase, userId });

      if (legacyAccess?.hotel_id) {
        const hotel = await getHotelById(supabase, legacyAccess.hotel_id);
        const role = legacyAccess.role || 'admin';

        if (hotel) {
          return {
            supabase,
            hotel,
            hotelUser: {
              hotel_id: hotel.id,
              user_id: userId,
              email,
              role,
              status: 'active',
              is_default: true
            },
            role,
            permissions: getPermissionsForRole(role),
            platformRole: 'none',
            platformPermissions: [],
            multiPropertyAccess: false,
            canSwitchWorkspaces: false,
            canCreateWorkspaces: false,
            availableHotels: [{ hotel, role, isDefault: true }],
            fallback: false,
            user: { id: userId, email }
          };
        }
      }
    }
  }

  const fallbackHotel = await getDefaultHotel(supabase);
  const role = 'owner';

  return {
    supabase,
    hotel: fallbackHotel,
    hotelUser: null,
    role,
    permissions: getPermissionsForRole(role),
    platformRole: 'none',
    platformPermissions: [],
    multiPropertyAccess: false,
    canSwitchWorkspaces: false,
    canCreateWorkspaces: false,
    availableHotels: fallbackHotel ? [{ hotel: fallbackHotel, role, isDefault: true }] : [],
    fallback: true,
    user: userId || email ? { id: userId, email } : null
  };
};
