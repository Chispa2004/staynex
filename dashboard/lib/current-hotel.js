import { getSupabaseAdmin } from './supabase';

const DEMO_HOTEL_SLUG = 'staynex-demo';

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
  let userId = null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);

    if (!error) {
      userId = data.user?.id || null;
    } else {
      console.warn('Current hotel auth lookup failed', error.message);
    }
  }

  if (userId) {
    const { data: access, error: accessError } = await supabase
      .from('hotel_users')
      .select('hotel_id, role')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (accessError && !isMissingHotelIdentitySchema(accessError)) {
      throw accessError;
    }

    if (access?.hotel_id) {
      const hotel = await getHotelById(supabase, access.hotel_id);

      if (hotel) {
        return {
          supabase,
          hotel,
          role: access.role || 'admin',
          fallback: false
        };
      }
    }
  }

  return {
    supabase,
    hotel: await getDefaultHotel(supabase),
    role: 'admin',
    fallback: true
  };
};
