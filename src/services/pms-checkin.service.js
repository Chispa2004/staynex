const DAY_MS = 86400000;

export const dateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export const daysBetweenDates = (from, to) => {
  const startKey = dateKey(from);
  const endKey = dateKey(to);

  if (!startKey || !endKey) {
    return null;
  }

  return Math.round((new Date(`${endKey}T12:00:00.000Z`).getTime() - new Date(`${startKey}T12:00:00.000Z`).getTime()) / DAY_MS);
};

export const determineStayPhase = (reservation = {}, now = new Date()) => {
  const status = String(reservation.status || '').toLowerCase();
  const today = dateKey(now);
  const arrival = dateKey(reservation.arrival_date || reservation.arrivalDate);
  const departure = dateKey(reservation.departure_date || reservation.departureDate);

  if (['completed', 'checked_out', 'checkedout', 'departed', 'cancelled', 'canceled'].includes(status)) {
    return 'checked_out';
  }

  if (status === 'in_house' || status === 'checked_in') {
    if (departure && daysBetweenDates(today, departure) <= 1) {
      return 'pre_checkout';
    }

    return 'in_house';
  }

  if (arrival && departure && today >= arrival && today < departure) {
    if (daysBetweenDates(today, departure) <= 1) {
      return 'pre_checkout';
    }

    return 'in_house';
  }

  if (departure && today >= departure) {
    return 'checked_out';
  }

  return 'pre_arrival';
};

export const updateStayPhase = (reservation = {}, now = new Date()) => determineStayPhase(reservation, now);

export const detectCheckinEvents = (reservation = {}, previousContext = null, now = new Date()) => {
  const nextPhase = determineStayPhase(reservation, now);
  const previousPhase = previousContext?.stay_phase || previousContext?.stayPhase || null;
  const events = [];

  if (nextPhase === 'in_house' && previousPhase !== 'in_house') {
    events.push({
      event_type: 'guest_checked_in',
      confidence: previousPhase ? 0.86 : 0.68,
      reason: previousPhase ? 'stay_phase_transition' : 'reservation_status_or_dates'
    });
  }

  if (nextPhase === 'checked_out' && previousPhase && previousPhase !== 'checked_out') {
    events.push({
      event_type: 'guest_checked_out',
      confidence: 0.86,
      reason: 'stay_phase_transition'
    });
  }

  return events;
};

export const detectCheckoutTomorrow = (reservation = {}, now = new Date()) => {
  const today = dateKey(now);
  const departure = dateKey(reservation.departure_date || reservation.departureDate);
  const daysToDeparture = daysBetweenDates(today, departure);

  return {
    matches: daysToDeparture === 1,
    daysToDeparture,
    event_type: 'checkout_tomorrow',
    confidence: daysToDeparture === 1 ? 0.92 : 0
  };
};
