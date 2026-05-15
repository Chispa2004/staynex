import { getSupabaseAdmin } from './supabase';
import { getPermissionsForRole } from './permissions';

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
  is_default: Boolean(row.is_default),
  invited_at: row.invited_at || null,
  accepted_at: row.accepted_at || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null
});

const chooseHotelAssignment = (assignments, requestedHotelId) => {
  if (!assignments.length) {
    return null;
  }

  if (requestedHotelId) {
    const requested = assignments.find((assignment) => assignment.hotel_id === requestedHotelId);

    if (requested) {
      return requested;
    }
  }

  return assignments.find((assignment) => assignment.is_default) || assignments[0];
};

const getAssignmentsForUser = async ({ supabase, userId, email }) => {
  if (!userId && !email) {
    return [];
  }

  const filters = [];

  if (userId) {
    filters.push(`user_id.eq.${userId}`);
  }

  if (email) {
    filters.push(`email.ilike.${email}`);
  }

  const { data, error } = await supabase
    .from('hotel_users')
    .select('*, hotel:hotels(*)')
    .or(filters.join(','))
    .in('status', ['active'])
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingHotelIdentitySchema(error)) {
      return null;
    }

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

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);

    if (!error) {
      userId = data.user?.id || null;
      email = data.user?.email || null;
    } else {
      console.warn('Current hotel auth lookup failed', error.message);
    }
  }

  if (userId) {
    const assignments = await getAssignmentsForUser({ supabase, userId, email });

    if (Array.isArray(assignments) && assignments.length > 0) {
      const selectedAssignment = chooseHotelAssignment(assignments, requestedHotelId);
      const hotel = selectedAssignment?.hotel || await getHotelById(supabase, selectedAssignment?.hotel_id);

      if (hotel) {
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
          ...selectedAssignment,
          user_id: selectedAssignment.user_id || userId
        });
        const availableHotels = assignments
          .filter((assignment) => assignment.hotel)
          .map((assignment) => ({
            hotel: assignment.hotel,
            hotelUser: normalizeHotelUser(assignment),
            role: assignment.role || 'receptionist',
            isDefault: Boolean(assignment.is_default)
          }));

        return {
          supabase,
          hotel,
          hotelUser,
          role: hotelUser.role,
          permissions: getPermissionsForRole(hotelUser.role),
          availableHotels,
          fallback: false,
          user: { id: userId, email }
        };
      }
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
    availableHotels: fallbackHotel ? [{ hotel: fallbackHotel, role, isDefault: true }] : [],
    fallback: true,
    user: userId || email ? { id: userId, email } : null
  };
};
