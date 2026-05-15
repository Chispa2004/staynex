const text = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const dateOnly = (value) => {
  const normalized = text(value);

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 10);
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const personName = (person = {}) => {
  const explicitName = text(person.name || person.fullName);

  if (explicitName) {
    return explicitName;
  }

  return [person.firstName, person.middleInitial, person.lastName]
    .map(text)
    .filter(Boolean)
    .join(' ') || null;
};

const normalizeStatus = (status) => {
  const normalized = text(status)?.toLowerCase();

  if (!normalized) {
    return 'confirmed';
  }

  if (['canceled', 'cancelled', 'no_show', 'noshow'].includes(normalized)) {
    return 'cancelled';
  }

  if (['checkedout', 'checked_out', 'departed'].includes(normalized)) {
    return 'completed';
  }

  if (['inhouse', 'in_house'].includes(normalized)) {
    return 'in_house';
  }

  return normalized;
};

const inferBoardBasis = (reservation) => (
  text(reservation.boardBasis)
  || text(reservation.board_basis)
  || text(reservation.catering)
  || text(reservation.ratePlan?.boardBasis)
  || text(reservation.ratePlan?.mealPlan)
  || text(reservation.ratePlan?.name)?.match(/breakfast|desayuno|halbpension|half board|full board/i)?.[0]
  || null
);

const guestFromReservation = (reservation) => (
  reservation.primaryGuest
  || reservation.mainGuest
  || reservation.guest
  || reservation.booker
  || {}
);

export const normalizeApaleoReservation = (reservation = {}) => {
  const guest = guestFromReservation(reservation);
  const booker = reservation.booker || {};
  const guestName = personName(guest) || personName(booker);
  const pmsReservationId = text(firstDefined(
    reservation.id,
    reservation.reservationId,
    reservation.code,
    reservation.externalId
  ));

  if (!pmsReservationId) {
    return null;
  }

  return {
    pms_provider: 'apaleo',
    pms_reservation_id: pmsReservationId,
    guest_name: guestName,
    guest_email: text(firstDefined(guest.email, booker.email)),
    guest_phone: text(firstDefined(guest.phone, guest.telephone, booker.phone, booker.telephone)),
    arrival_date: dateOnly(firstDefined(reservation.arrival, reservation.arrivalDate)),
    departure_date: dateOnly(firstDefined(reservation.departure, reservation.departureDate)),
    room_type: text(firstDefined(
      reservation.unitGroup?.name,
      reservation.unitGroup?.code,
      reservation.unitGroupId,
      reservation.roomType
    )),
    rate_plan: text(firstDefined(
      reservation.ratePlan?.name,
      reservation.ratePlan?.code,
      reservation.ratePlanId
    )),
    board_basis: inferBoardBasis(reservation),
    status: normalizeStatus(reservation.status),
    adults: Number.isFinite(Number(reservation.adults)) ? Number(reservation.adults) : null,
    children: Number.isFinite(Number(reservation.children)) ? Number(reservation.children) : null,
    notes: text(firstDefined(reservation.comment, reservation.bookerComment, reservation.notes)),
    source: 'apaleo'
  };
};

export const normalizeApaleoReservations = (reservations = []) => reservations
  .map(normalizeApaleoReservation)
  .filter(Boolean);
