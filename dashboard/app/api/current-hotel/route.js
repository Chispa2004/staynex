import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const DEMO_HOTEL_SLUG = 'staynex-demo';

const isMissingHotelIdentitySchema = (error) => (
  error?.message?.includes('hotel_users')
  || error?.message?.includes('slug')
  || error?.details?.includes('hotel_users')
  || error?.details?.includes('slug')
  || error?.hint?.includes('hotel_users')
  || error?.hint?.includes('slug')
);

const jsonError = (message, status = 500) => NextResponse.json({
  hotel: null,
  role: 'admin',
  error: message
}, { status });

const getBearerToken = (request) => {
  const header = request.headers.get('authorization') || '';
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

const getDefaultHotel = async (supabase) => {
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

const getAuthUserId = async (supabase, request) => {
  const token = getBearerToken(request);

  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    console.warn('Current hotel auth lookup failed', error.message);
    return null;
  }

  return data.user?.id || null;
};

export async function GET(request) {
  try {
    const supabase = getSupabaseAdmin();
    const userId = await getAuthUserId(supabase, request);

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
          return NextResponse.json({
            hotel,
            role: access.role || 'admin',
            fallback: false
          });
        }
      }
    }

    const fallbackHotel = await getDefaultHotel(supabase);

    return NextResponse.json({
      hotel: fallbackHotel,
      role: 'admin',
      fallback: true
    });
  } catch (error) {
    console.error('Current hotel API failed', error);
    return jsonError(error.message || 'Current hotel lookup failed');
  }
}
