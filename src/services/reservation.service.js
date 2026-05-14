import {
  createGuest,
  findGuestByPhone,
  getOrCreateLocalTestHotel,
  getSupabase,
  updateGuestLanguage
} from './supabase.service.js';
import { logger } from '../utils/logger.js';
import { detectGuestLanguage } from './language.service.js';
import { randomBytes } from 'node:crypto';

const cleanText = (value) => {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizePhoneIfNeeded = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  const withoutWhatsappPrefix = phone.replace(/^whatsapp:/i, '').trim();
  const cleaned = withoutWhatsappPrefix.replace(/[^\d+]/g, '');

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('+')) {
    return `+${cleaned.replace(/[^\d]/g, '')}`;
  }

  return cleaned.replace(/[^\d]/g, '');
};

export const extractReservationAccessToken = (message) => {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const match = message.match(/\b(STX-[A-Z0-9]{6,10})\b/i);
  return match?.[1]?.toUpperCase() || null;
};

const randomTokenSuffix = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);

  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
};

export const generateReservationAccessToken = () => `STX-${randomTokenSuffix()}`;

const getWhatsAppNumberForLinks = () => {
  const rawNumber = process.env.TWILIO_WHATSAPP_FROM || '';
  return rawNumber.replace(/^whatsapp:/i, '').replace(/[^\d]/g, '');
};

export const generateReservationWhatsAppLink = (reservation) => {
  const whatsappNumber = getWhatsAppNumberForLinks();

  if (!whatsappNumber) {
    logger.warn('Cannot generate reservation WhatsApp link without TWILIO_WHATSAPP_FROM');
    return null;
  }

  const text = cleanText(reservation?.reservation_access_token)
    || `Hello, I have a reservation under ${cleanText(reservation?.guest_name || reservation?.guestName) || 'my name'}`;

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
};

const isMissingReservationAccessTokenColumn = (error) => (
  error?.message?.includes('reservation_access_token')
  || error?.details?.includes('reservation_access_token')
  || error?.hint?.includes('reservation_access_token')
);

const findReservationByPmsId = async ({ pmsProvider, pmsReservationId }) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('reservations')
    .select('*')
    .eq('pms_provider', pmsProvider)
    .eq('pms_reservation_id', pmsReservationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const isTokenAvailable = async (token, existingReservationId = null) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('reservations')
    .select('id')
    .eq('reservation_access_token', token)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingReservationAccessTokenColumn(error)) {
      logger.warn('reservation_access_token column missing while checking token uniqueness');
      return true;
    }

    throw error;
  }

  return !data || data.id === existingReservationId;
};

const generateUniqueReservationAccessToken = async (existingReservationId = null) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = generateReservationAccessToken();

    if (await isTokenAvailable(token, existingReservationId)) {
      return token;
    }
  }

  throw new Error('Unable to generate unique reservation access token');
};

const getReservationRecord = ({ data, hotelId, guestId, guestPhone, accessToken, whatsappLink }) => ({
  hotel_id: hotelId,
  guest_id: guestId,
  pms_provider: cleanText(data.pms_provider) || 'mock',
  pms_reservation_id: cleanText(data.pms_reservation_id),
  guest_name: cleanText(data.guest_name),
  guest_email: cleanText(data.guest_email),
  guest_phone: guestPhone,
  arrival_date: cleanText(data.arrival_date),
  departure_date: cleanText(data.departure_date),
  room_type: cleanText(data.room_type),
  rate_plan: cleanText(data.rate_plan),
  board_basis: cleanText(data.board_basis),
  status: cleanText(data.status) || 'confirmed',
  reservation_access_token: accessToken,
  whatsapp_link: whatsappLink,
  updated_at: new Date().toISOString()
});

export const createOrUpdateReservation = async (data) => {
  const client = getSupabase();
  const pmsProvider = cleanText(data.pms_provider) || 'mock';
  const pmsReservationId = cleanText(data.pms_reservation_id);
  const hotel = data.hotel_id || data.hotelId
    ? { id: data.hotel_id || data.hotelId }
    : await getOrCreateLocalTestHotel();
  const hotelId = hotel.id;
  const guestPhone = normalizePhoneIfNeeded(data.guest_phone || data.guestPhone);

  let guest = null;

  if (guestPhone) {
    guest = await findGuestByPhone({
      hotelId,
      phoneNumber: guestPhone
    });

    if (!guest) {
      guest = await createGuest({
        hotelId,
        phoneNumber: guestPhone,
        roomNumber: null,
        preferredLanguage: 'es'
      });

      logger.info('Reservation guest created from PMS webhook', {
        guestId: guest.id,
        phone: guestPhone
      });
    }
  }

  const existingReservation = await findReservationByPmsId({
    pmsProvider,
    pmsReservationId
  });
  const accessToken = existingReservation?.reservation_access_token
    || await generateUniqueReservationAccessToken(existingReservation?.id || null);
  const whatsappLink = generateReservationWhatsAppLink({
    guest_name: data.guest_name,
    reservation_access_token: accessToken
  });
  const reservationRecord = getReservationRecord({
    data: {
      ...data,
      pms_provider: pmsProvider,
      pms_reservation_id: pmsReservationId
    },
    hotelId,
    guestId: guest?.id || null,
    guestPhone,
    accessToken,
    whatsappLink
  });

  const { data: reservation, error } = await client
    .from('reservations')
    .upsert(reservationRecord, {
      onConflict: 'pms_provider,pms_reservation_id'
    })
    .select('*')
    .single();

  if (error && isMissingReservationAccessTokenColumn(error)) {
    const { reservation_access_token: _token, ...legacyRecord } = reservationRecord;
    const { data: legacyReservation, error: legacyError } = await client
      .from('reservations')
      .upsert(legacyRecord, {
        onConflict: 'pms_provider,pms_reservation_id'
      })
      .select('*')
      .single();

    if (legacyError) {
      throw legacyError;
    }

    logger.warn('reservation_access_token column missing; reservation stored without token', {
      pmsProvider,
      pmsReservationId
    });

    return {
      reservation: {
        ...legacyReservation,
        reservation_access_token: null
      },
      guest
    };
  }

  if (error) {
    throw error;
  }

  logger.info('Reservation stored from PMS webhook', {
    reservationId: reservation.id,
    pmsProvider: reservation.pms_provider,
    pmsReservationId: reservation.pms_reservation_id,
    reservationAccessToken: reservation.reservation_access_token
  });

  return {
    reservation,
    guest
  };
};

export const findReservationByAccessToken = async (token) => {
  const client = getSupabase();

  const { data, error } = await client
    .from('reservations')
    .select('*')
    .eq('reservation_access_token', token)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingReservationAccessTokenColumn(error)) {
      logger.warn('reservation_access_token column missing while looking up reservation token');
      return null;
    }

    throw error;
  }

  return data;
};

export const getLatestReservationForGuest = async ({ guestId }) => {
  if (!guestId) {
    return null;
  }

  const client = getSupabase();

  const { data, error } = await client
    .from('reservations')
    .select('*')
    .eq('guest_id', guestId)
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const linkReservationToGuest = async ({ reservation, guest, message }) => {
  if (!reservation || !guest) {
    return reservation;
  }

  const client = getSupabase();
  const detectedLanguage = detectGuestLanguage(message, guest.preferred_language || 'es');

  if (detectedLanguage && detectedLanguage !== (guest.preferred_language || 'es')) {
    await updateGuestLanguage({
      guestId: guest.id,
      preferredLanguage: detectedLanguage
    });
  }

  const updates = {
    guest_id: guest.id,
    updated_at: new Date().toISOString()
  };

  if (!reservation.guest_phone && guest.phone_number) {
    updates.guest_phone = guest.phone_number;
  }

  const { data, error } = await client
    .from('reservations')
    .update(updates)
    .eq('id', reservation.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  logger.info('reservation linked', {
    reservationId: data.id,
    guestId: guest.id,
    reservationAccessToken: data.reservation_access_token
  });

  return data;
};

export const getRecentReservations = async ({ limit = 50 } = {}) => {
  const client = getSupabase();

  const { data: reservations, error } = await client
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const reservationIds = (reservations || []).map((reservation) => reservation.id);

  if (reservationIds.length === 0) {
    return [];
  }

  const { data: events, error: eventsError } = await client
    .from('automation_events')
    .select('*')
    .in('reservation_id', reservationIds)
    .order('scheduled_for', { ascending: true });

  if (eventsError) {
    throw eventsError;
  }

  const eventsByReservationId = (events || []).reduce((acc, event) => {
    acc[event.reservation_id] = acc[event.reservation_id] || [];
    acc[event.reservation_id].push(event);
    return acc;
  }, {});

  return reservations.map((reservation) => ({
    ...reservation,
    automation_events: eventsByReservationId[reservation.id] || []
  }));
};
