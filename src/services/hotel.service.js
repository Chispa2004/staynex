import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const DEMO_HOTEL_SLUG = 'staynex-demo';

const isMissingHotelIdentitySchema = (error) => (
  error?.message?.includes('hotel_users')
  || error?.message?.includes('slug')
  || error?.details?.includes('hotel_users')
  || error?.details?.includes('slug')
  || error?.hint?.includes('hotel_users')
  || error?.hint?.includes('slug')
);

const firstHotelFallback = async () => {
  const client = getSupabase();
  const { data, error } = await client
    .from('hotels')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const createDemoHotel = async () => {
  const client = getSupabase();
  const demoRecord = {
    name: 'Staynex Demo Hotel',
    brand_name: 'Staynex',
    slug: DEMO_HOTEL_SLUG,
    whatsapp_number: 'local-test',
    timezone: 'Europe/Madrid',
    default_language: 'es',
    check_in_time: '15:00',
    check_out_time: '11:00',
    description: 'Hotel demo de Staynex para pruebas operativas.'
  };

  const { data, error } = await client
    .from('hotels')
    .insert(demoRecord)
    .select('*')
    .single();

  if (!error) {
    return data;
  }

  if (!isMissingHotelIdentitySchema(error)) {
    throw error;
  }

  const { data: legacyData, error: legacyError } = await client
    .from('hotels')
    .insert({
      name: demoRecord.name,
      whatsapp_number: demoRecord.whatsapp_number
    })
    .select('*')
    .single();

  if (legacyError) {
    throw legacyError;
  }

  return legacyData;
};

export const getHotelById = async (hotelId) => {
  if (!hotelId) {
    return null;
  }

  const client = getSupabase();
  const { data, error } = await client
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

const getHotelBySlug = async (slug) => {
  const client = getSupabase();
  const { data, error } = await client
    .from('hotels')
    .select('*')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingHotelIdentitySchema(error)) {
      logger.warn('Hotel identity schema missing; using first hotel fallback');
      return firstHotelFallback();
    }

    throw error;
  }

  return data;
};

export const getDefaultHotel = async () => {
  if (process.env.DEFAULT_HOTEL_ID) {
    const configuredHotel = await getHotelById(process.env.DEFAULT_HOTEL_ID);

    if (configuredHotel) {
      return configuredHotel;
    }

    logger.warn('DEFAULT_HOTEL_ID did not match a hotel; falling back to demo hotel', {
      defaultHotelId: process.env.DEFAULT_HOTEL_ID
    });
  }

  const demoHotel = await getHotelBySlug(DEMO_HOTEL_SLUG);

  if (demoHotel) {
    return demoHotel;
  }

  const fallbackHotel = await firstHotelFallback();

  return fallbackHotel || await createDemoHotel();
};

export const getHotelForAuthUser = async (userId) => {
  if (!userId) {
    return {
      hotel: await getDefaultHotel(),
      role: 'admin',
      fallback: true
    };
  }

  const client = getSupabase();
  const { data: access, error } = await client
    .from('hotel_users')
    .select('hotel_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingHotelIdentitySchema(error)) {
      logger.warn('hotel_users table missing; using demo hotel fallback', { userId });

      return {
        hotel: await getDefaultHotel(),
        role: 'admin',
        fallback: true
      };
    }

    throw error;
  }

  if (!access?.hotel_id) {
    return {
      hotel: await getDefaultHotel(),
      role: 'admin',
      fallback: true
    };
  }

  const hotel = await getHotelById(access.hotel_id);

  return {
    hotel: hotel || await getDefaultHotel(),
    role: access.role || 'admin',
    fallback: !hotel
  };
};

export const getHotelProfileForPrompt = async (hotelId) => {
  const hotel = hotelId ? await getHotelById(hotelId) : await getDefaultHotel();

  if (!hotel) {
    return null;
  }

  return {
    id: hotel.id,
    name: hotel.name,
    brand_name: hotel.brand_name,
    slug: hotel.slug,
    address: hotel.address,
    phone: hotel.phone,
    whatsapp_number: hotel.whatsapp_number,
    timezone: hotel.timezone || 'Europe/Madrid',
    default_language: hotel.default_language || 'es',
    check_in_time: hotel.check_in_time,
    check_out_time: hotel.check_out_time,
    description: hotel.description
  };
};
