import {
  createGuest,
  findGuestByPhone,
  getOrCreateLocalTestHotel,
  getSupabase
} from './supabase.service.js';
import { logger } from '../utils/logger.js';

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

  const guestName = cleanText(reservation?.guest_name || reservation?.guestName) || 'my name';
  const text = `Hello, I have a reservation under ${guestName}`;

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
};

const getReservationRecord = ({ data, hotelId, guestId, guestPhone, whatsappLink }) => ({
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
  whatsapp_link: whatsappLink,
  updated_at: new Date().toISOString()
});

export const createOrUpdateReservation = async (data) => {
  const client = getSupabase();
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

  const whatsappLink = generateReservationWhatsAppLink({
    guest_name: data.guest_name
  });
  const reservationRecord = getReservationRecord({
    data,
    hotelId,
    guestId: guest?.id || null,
    guestPhone,
    whatsappLink
  });

  const { data: reservation, error } = await client
    .from('reservations')
    .upsert(reservationRecord, {
      onConflict: 'pms_provider,pms_reservation_id'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  logger.info('Reservation stored from PMS webhook', {
    reservationId: reservation.id,
    pmsProvider: reservation.pms_provider,
    pmsReservationId: reservation.pms_reservation_id
  });

  return {
    reservation,
    guest
  };
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
