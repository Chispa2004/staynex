const STATUS_MAP = {
  CONFIRMADA: 'confirmed',
  CONFIRMADO: 'confirmed',
  ACTIVA: 'in_house',
  ALOJADO: 'in_house',
  CHECKED_IN: 'in_house',
  CANCELADA: 'cancelled',
  CANCELADO: 'cancelled',
  NO_SHOW: 'no_show',
  SALIDA: 'checked_out',
  CHECKED_OUT: 'checked_out'
};

const ROOM_STATUS_MAP = {
  limpia: 'clean',
  sucia: 'dirty',
  retenida: 'blocked',
  fuera_servicio: 'out_of_order',
  pickup: 'pickup',
  bloqueada: 'blocked',
  ocupada: 'occupied',
  libre: 'vacant'
};

const HOUSEKEEPING_STATUS_MAP = {
  limpia: 'clean',
  sucia: 'dirty',
  pickup: 'pickup',
  retenida: 'unknown',
  fuera_servicio: 'unknown',
  bloqueada: 'unknown',
  ocupada: 'unknown',
  libre: 'unknown'
};

const MAINTENANCE_STATUS_MAP = {
  fuera_servicio: 'out_of_order',
  retenida: 'maintenance',
  bloqueada: 'maintenance'
};

const normalizeString = (value, fallback = null) => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const ddmmyyyy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const collectWarnings = (checks = []) => checks.filter(Boolean);

export const normalizeUbikosReservation = (raw = {}) => {
  const reservationId = normalizeString(raw.reservation_id || raw.id || raw.reserva_id || raw.codigo);
  const guestName = normalizeString(raw.guest_name || raw.titular || raw.cliente || raw.name);
  const arrivalDate = normalizeDate(raw.arrival_date || raw.entrada || raw.check_in);
  const departureDate = normalizeDate(raw.departure_date || raw.salida || raw.check_out);
  const status = STATUS_MAP[String(raw.status || raw.estado || '').trim().toUpperCase()] || normalizeString(raw.status || raw.estado, 'unknown');

  return {
    reservation_id: reservationId,
    locator: normalizeString(raw.locator || raw.localizador || raw.reference || reservationId),
    status,
    guest_name: guestName,
    guest_phone: normalizeString(raw.guest_phone || raw.phone || raw.telefono),
    guest_email: normalizeString(raw.guest_email || raw.email || raw.correo),
    room_number: normalizeString(raw.room_number || raw.habitacion),
    room_type: normalizeString(raw.room_type || raw.tipo_habitacion || raw.tipo),
    arrival_date: arrivalDate,
    departure_date: departureDate,
    adults: toNumber(raw.adults || raw.adultos, 0),
    children: toNumber(raw.children || raw.ninos || raw.children_count, 0),
    board_basis: normalizeString(raw.board_basis || raw.regimen),
    agency: normalizeString(raw.agency || raw.agencia),
    channel: normalizeString(raw.channel || raw.canal || raw.agency || raw.agencia),
    balance_due: toNumber(raw.balance_due || raw.pendiente || raw.saldo_pendiente, 0),
    currency: normalizeString(raw.currency || raw.moneda, 'EUR'),
    notes: normalizeString(raw.notes || raw.observaciones),
    raw_payload: raw,
    warnings: collectWarnings([
      !reservationId ? 'reservation_id_missing' : null,
      !guestName ? 'guest_name_missing' : null,
      !arrivalDate ? 'arrival_date_missing' : null,
      !departureDate ? 'departure_date_missing' : null,
      !normalizeString(raw.room_number || raw.habitacion) ? 'room_number_missing' : null
    ])
  };
};

export const normalizeUbikosGuest = (raw = {}) => {
  const guestId = normalizeString(raw.guest_id || raw.id || raw.cliente_id || raw.document_id || raw.name || raw.nombre);
  const name = normalizeString(raw.name || raw.nombre || raw.guest_name || raw.titular);

  return {
    guest_id: guestId,
    name,
    phone: normalizeString(raw.phone || raw.telefono || raw.whatsapp),
    email: normalizeString(raw.email || raw.correo),
    language: normalizeString(raw.language || raw.idioma),
    nationality: normalizeString(raw.nationality || raw.nacionalidad || raw.country),
    preferences: Array.isArray(raw.preferences || raw.preferencias) ? (raw.preferences || raw.preferencias) : [],
    notes: normalizeString(raw.notes || raw.observaciones),
    vip: Boolean(raw.vip || raw.is_vip),
    blacklist_flag: Boolean(raw.blacklist_flag || raw.blacklist || raw.lista_negra),
    raw_payload: raw,
    warnings: collectWarnings([
      !guestId ? 'guest_id_missing' : null,
      !name ? 'guest_name_missing' : null,
      !normalizeString(raw.language || raw.idioma) ? 'guest_language_missing' : null
    ])
  };
};

export const normalizeUbikosRoom = (raw = {}) => {
  const roomNumber = normalizeString(raw.room_number || raw.habitacion || raw.number);
  const rawStatus = normalizeString(raw.status || raw.estado, 'unknown');
  const mappedStatus = ROOM_STATUS_MAP[rawStatus] || rawStatus;
  const housekeepingStatus = HOUSEKEEPING_STATUS_MAP[rawStatus] || normalizeString(raw.housekeeping_status || raw.limpieza, 'unknown');
  const maintenanceStatus = MAINTENANCE_STATUS_MAP[rawStatus] || normalizeString(raw.maintenance_status || raw.mantenimiento, 'ok');

  return {
    room_number: roomNumber,
    room_type: normalizeString(raw.room_type || raw.tipo_habitacion || raw.tipo),
    status: mappedStatus,
    housekeeping_status: housekeepingStatus,
    maintenance_status: maintenanceStatus,
    blocked: Boolean(raw.blocked || raw.bloqueada || mappedStatus === 'blocked'),
    occupied: Boolean(raw.occupied || raw.ocupada || mappedStatus === 'occupied'),
    guest_name: normalizeString(raw.guest_name || raw.huesped || raw.cliente),
    current_reservation_id: normalizeString(raw.current_reservation_id || raw.reservation_id || raw.reserva_id),
    incidents: Array.isArray(raw.incidents || raw.incidencias) ? (raw.incidents || raw.incidencias) : [],
    raw_payload: raw,
    warnings: collectWarnings([
      !roomNumber ? 'room_number_missing' : null,
      mappedStatus === 'unknown' ? 'room_status_unknown' : null
    ])
  };
};

export const normalizeUbikosFolio = (raw = {}) => {
  const charges = Array.isArray(raw.charges || raw.cargos) ? (raw.charges || raw.cargos) : [];
  const payments = Array.isArray(raw.payments || raw.pagos) ? (raw.payments || raw.pagos) : [];
  const normalizedCharges = charges.map((item) => ({
    description: normalizeString(item.description || item.concepto || item.name, 'Charge'),
    category: normalizeString(item.category || item.tipo, 'other'),
    amount: toNumber(item.amount || item.importe, 0),
    date: normalizeDate(item.date || item.fecha),
    status: normalizeString(item.status || item.estado, 'posted')
  }));
  const normalizedPayments = payments.map((item) => ({
    description: normalizeString(item.description || item.concepto || item.name, 'Payment'),
    amount: toNumber(item.amount || item.importe, 0),
    date: normalizeDate(item.date || item.fecha),
    method: normalizeString(item.method || item.metodo, 'unknown')
  }));
  const totalCharges = raw.total_charges ?? raw.totalCharges ?? normalizedCharges.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = raw.total_paid ?? raw.totalPaid ?? normalizedPayments.reduce((sum, item) => sum + item.amount, 0);

  return {
    reservation_id: normalizeString(raw.reservation_id || raw.reserva_id),
    currency: normalizeString(raw.currency || raw.moneda, 'EUR'),
    total_charges: Number(toNumber(totalCharges).toFixed(2)),
    total_paid: Number(toNumber(totalPaid).toFixed(2)),
    balance_due: Number(toNumber(raw.balance_due ?? raw.pendiente ?? (toNumber(totalCharges) - toNumber(totalPaid))).toFixed(2)),
    charges: normalizedCharges,
    payments: normalizedPayments,
    warnings: collectWarnings([
      ...(raw.warnings || []),
      !normalizeString(raw.reservation_id || raw.reserva_id) ? 'reservation_id_missing' : null,
      !normalizedCharges.length ? 'folio_charges_missing' : null
    ]),
    raw_payload: raw
  };
};

export const normalizeUbikosHotelStatus = (raw = {}) => ({
  total_rooms: toNumber(raw.total_rooms || raw.habitaciones_totales, 0),
  available_rooms: toNumber(raw.available_rooms || raw.disponibles, 0),
  occupied_rooms: toNumber(raw.occupied_rooms || raw.ocupadas, 0),
  arrivals_pending: toNumber(raw.arrivals_pending || raw.entradas_pendientes, 0),
  departures_pending: toNumber(raw.departures_pending || raw.salidas_pendientes, 0),
  roomnights: toNumber(raw.roomnights || raw.estancias, 0),
  occupancy_percent: toNumber(raw.occupancy_percent || raw.ocupacion, 0),
  raw_payload: raw
});
