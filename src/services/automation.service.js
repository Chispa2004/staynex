import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const addDays = (dateValue, days) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const buildEventPayload = (reservation) => ({
  reservation_id: reservation.id,
  guest_name: reservation.guest_name,
  guest_email: reservation.guest_email,
  guest_phone: reservation.guest_phone,
  arrival_date: reservation.arrival_date,
  departure_date: reservation.departure_date,
  whatsapp_link: reservation.whatsapp_link
});

const buildAutomationEvents = (reservation) => {
  const payload = buildEventPayload(reservation);
  const events = [
    {
      reservation_id: reservation.id,
      event_type: 'booking_confirmation',
      scheduled_for: new Date().toISOString(),
      channel: 'email',
      status: 'scheduled',
      payload
    }
  ];

  const preArrivalSevenDays = addDays(reservation.arrival_date, -7);
  const preArrivalOneDay = addDays(reservation.arrival_date, -1);
  const postStayReview = addDays(reservation.departure_date, 1);
  const postStayDiscount = addDays(reservation.departure_date, 14);

  if (preArrivalSevenDays) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'pre_arrival_7_days',
      scheduled_for: preArrivalSevenDays,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (preArrivalOneDay) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'pre_arrival_1_day',
      scheduled_for: preArrivalOneDay,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (postStayReview) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'post_stay_review',
      scheduled_for: postStayReview,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (postStayDiscount) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'post_stay_discount',
      scheduled_for: postStayDiscount,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  return events;
};

export const scheduleReservationAutomations = async (reservation) => {
  const client = getSupabase();
  const events = buildAutomationEvents(reservation);

  const { error: deleteError } = await client
    .from('automation_events')
    .delete()
    .eq('reservation_id', reservation.id);

  if (deleteError) {
    throw deleteError;
  }

  if (events.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('automation_events')
    .insert(events)
    .select('*');

  if (error) {
    throw error;
  }

  const sortedEvents = (data || []).sort((a, b) => (
    new Date(a.scheduled_for || a.created_at).getTime()
    - new Date(b.scheduled_for || b.created_at).getTime()
  ));

  logger.info('Reservation automation events scheduled', {
    reservationId: reservation.id,
    totalEvents: sortedEvents.length
  });

  return sortedEvents;
};
