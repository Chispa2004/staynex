const ACTIVE_STATUSES = new Set(['confirmed', 'checked_in', 'in_house', 'inhouse', 'arrived', 'active']);
const CHECKED_OUT_STATUSES = new Set(['checked_out', 'completed', 'departed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const NO_SHOW_STATUSES = new Set(['no_show', 'noshow']);

const todayKey = () => new Date().toISOString().slice(0, 10);

const normalizeText = (value) => String(value || '').trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const digitsOnly = (value) => normalizeText(value).replace(/\D/g, '');

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Reception data unavailable', error.message);
    }

    return fallback;
  }

  return data || fallback;
};

const safeMaybeSingle = async (query, fallback = null) => {
  const { data, error } = await query;

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Reception detail unavailable', error.message);
    }

    return fallback;
  }

  return data || fallback;
};

export const maskDocumentNumber = (value) => {
  const text = normalizeText(value);
  if (!text) return null;

  if (text.length <= 4) {
    return `${'*'.repeat(Math.max(0, text.length - 1))}${text.slice(-1)}`;
  }

  return `${text.slice(0, 2)}${'*'.repeat(Math.max(3, text.length - 5))}${text.slice(-3)}`;
};

const findDocumentNumber = ({ reservation = {}, guest = {}, stayContext = {} } = {}) => {
  const metadata = reservation.metadata || {};
  const guestMetadata = guest.metadata || {};
  const rawPayload = stayContext.raw_payload || metadata.raw_payload || {};

  return reservation.document_number
    || reservation.passport_number
    || reservation.dni
    || metadata.document_number
    || metadata.passport_number
    || metadata.dni
    || guest.document_number
    || guest.passport_number
    || guest.dni
    || guestMetadata.document_number
    || guestMetadata.passport_number
    || guestMetadata.dni
    || rawPayload.document_number
    || rawPayload.passport_number
    || rawPayload.document?.number
    || null;
};

const getGuestName = ({ reservation = {}, guest = {} } = {}) => (
  reservation.guest_name
  || reservation.guestName
  || guest.full_name
  || guest.name
  || guest.display_name
  || guest.phone_number
  || 'Guest'
);

const getGuestPhone = ({ reservation = {}, guest = {} } = {}) => (
  reservation.guest_phone
  || reservation.phone
  || guest.phone_number
  || guest.phone
  || null
);

const getGuestEmail = ({ reservation = {}, guest = {} } = {}) => (
  reservation.guest_email
  || reservation.email
  || guest.email
  || null
);

const getRoomNumber = ({ reservation = {}, guest = {}, stayContext = {} } = {}) => (
  reservation.room_number
  || reservation.room
  || guest.current_room
  || stayContext.room_number
  || null
);

const getStatus = (reservation = {}) => normalizeLower(reservation.status || 'confirmed');

export const getReceptionReservationStatus = (reservation = {}, nowKey = todayKey()) => {
  const status = getStatus(reservation);

  if (CANCELLED_STATUSES.has(status)) return 'cancelled';
  if (NO_SHOW_STATUSES.has(status)) return 'no_show';
  if (CHECKED_OUT_STATUSES.has(status)) return 'checked_out';

  const arrival = reservation.arrival_date;
  const departure = reservation.departure_date;

  if (departure === nowKey && !CHECKED_OUT_STATUSES.has(status)) {
    return 'checkout_today';
  }

  if (arrival === nowKey && !['checked_in', 'in_house', 'inhouse', 'arrived'].includes(status)) {
    return 'arriving_today';
  }

  if (arrival && departure && arrival <= nowKey && departure > nowKey) {
    return 'in_house';
  }

  if (departure && departure < nowKey) {
    return 'checked_out';
  }

  return 'upcoming';
};

const normalizeFolioFromScheduledMessage = (message = null) => {
  if (!message) {
    return {
      available: false,
      outstandingBalance: null,
      currency: null,
      dataQuality: 'unavailable',
      warnings: ['folio_not_available_from_pms'],
      lineItems: [],
      lastUpdatedAt: null,
      previewMessage: null
    };
  }

  const metadata = message.metadata || {};

  return {
    available: true,
    outstandingBalance: Number(metadata.outstanding_balance || 0),
    currency: metadata.folio_currency || metadata.currency || null,
    dataQuality: metadata.folio_data_quality || 'unknown',
    warnings: metadata.folio_warnings || [],
    lineItems: metadata.line_items || metadata.folio_line_items || [],
    lastUpdatedAt: metadata.folio_last_updated_at || message.updated_at || message.created_at || null,
    previewMessage: message.message_preview || null,
    scheduledMessageId: message.id
  };
};

export const calculateCheckinReadiness = ({
  reservation = {},
  guest = {},
  stayContext = {},
  roomStatus = null,
  openTickets = [],
  folio = null
} = {}) => {
  const status = getStatus(reservation);
  const roomNumber = getRoomNumber({ reservation, guest, stayContext });
  const documentNumber = findDocumentNumber({ reservation, guest, stayContext });
  const phone = getGuestPhone({ reservation, guest });
  const email = getGuestEmail({ reservation, guest });
  const metadata = reservation.metadata || {};
  const guestMetadata = guest.metadata || {};
  const unresolvedIssues = openTickets.filter((ticket) => !['completed', 'closed', 'resolved'].includes(normalizeLower(ticket.status)));
  const roomReady = roomStatus
    ? ['clean', 'inspected'].includes(normalizeLower(roomStatus.housekeeping_status))
      && !['maintenance', 'out_of_order'].includes(normalizeLower(roomStatus.maintenance_status))
    : null;
  const paymentClear = folio?.available
    ? Number(folio.outstandingBalance || 0) <= 0
    : null;
  const checks = [
    {
      id: 'reservation_confirmed',
      label: 'Reservation confirmed',
      status: ACTIVE_STATUSES.has(status) || status === 'confirmed' ? 'ok' : 'attention',
      weight: 14
    },
    {
      id: 'room_assigned',
      label: 'Room assigned',
      status: roomNumber ? 'ok' : 'missing',
      weight: 12
    },
    {
      id: 'room_ready',
      label: 'Room ready',
      status: roomReady === null ? 'unknown' : roomReady ? 'ok' : 'attention',
      weight: 12
    },
    {
      id: 'document_received',
      label: 'Document received',
      status: documentNumber ? 'ok' : 'missing',
      weight: 10
    },
    {
      id: 'phone_valid',
      label: 'Phone valid',
      status: digitsOnly(phone).length >= 8 ? 'ok' : 'missing',
      weight: 12
    },
    {
      id: 'email_valid',
      label: 'Email valid',
      status: /.+@.+\..+/.test(normalizeText(email)) ? 'ok' : 'missing',
      weight: 8
    },
    {
      id: 'payment_clear',
      label: 'Payment clear',
      status: paymentClear === null ? 'unknown' : paymentClear ? 'ok' : 'attention',
      weight: 12
    },
    {
      id: 'arrival_time_known',
      label: 'Arrival time known',
      status: reservation.estimated_arrival_time || reservation.arrival_time || metadata.estimated_arrival_time ? 'ok' : 'unknown',
      weight: 7
    },
    {
      id: 'whatsapp_consent',
      label: 'WhatsApp consent / opt-out',
      status: guest.opt_out || guestMetadata.opt_out || metadata.guest_opt_out ? 'attention' : 'ok',
      weight: 6
    },
    {
      id: 'no_unresolved_issues',
      label: 'No unresolved issues',
      status: unresolvedIssues.length ? 'attention' : 'ok',
      weight: 7
    }
  ];
  const score = Math.round(checks.reduce((total, check) => (
    total + (check.status === 'ok' ? check.weight : check.status === 'unknown' ? check.weight * 0.45 : 0)
  ), 0));
  const blocked = CANCELLED_STATUSES.has(status)
    || NO_SHOW_STATUSES.has(status)
    || roomStatus?.maintenance_status === 'out_of_order'
    || unresolvedIssues.some((ticket) => ticket.priority === 'urgent');
  const missing = checks.some((check) => check.status === 'missing');
  const attention = checks.some((check) => check.status === 'attention');
  const readinessStatus = blocked
    ? 'blocked'
    : score >= 85 && !attention && !missing
      ? 'ready'
      : missing
        ? 'missing_data'
        : 'needs_attention';

  return {
    score: Math.max(0, Math.min(100, score)),
    status: readinessStatus,
    checks,
    alerts: checks
      .filter((check) => ['missing', 'attention'].includes(check.status))
      .map((check) => check.label)
      .slice(0, 4)
  };
};

export const buildReceptionReservation = ({
  reservation = {},
  guest = {},
  stayContext = {},
  roomStatus = null,
  tickets = [],
  conversation = null,
  guestMemory = [],
  experienceBookings = [],
  folioMessage = null,
  nowKey = todayKey()
} = {}) => {
  const folio = normalizeFolioFromScheduledMessage(folioMessage);
  const readiness = calculateCheckinReadiness({
    reservation,
    guest,
    stayContext,
    roomStatus,
    openTickets: tickets,
    folio
  });
  const roomNumber = getRoomNumber({ reservation, guest, stayContext });
  const documentNumber = findDocumentNumber({ reservation, guest, stayContext });
  const adults = Number(reservation.adults ?? stayContext.adults ?? 0);
  const children = Number(reservation.children ?? stayContext.children ?? 0);
  const metadata = reservation.metadata || {};
  const guestMetadata = guest.metadata || {};

  return {
    id: reservation.id,
    hotelId: reservation.hotel_id || stayContext.hotel_id || null,
    guestId: reservation.guest_id || guest.id || null,
    guestName: getGuestName({ reservation, guest }),
    roomNumber,
    roomType: reservation.room_type || stayContext.room_type || roomStatus?.room_type || null,
    arrivalDate: reservation.arrival_date || stayContext.arrival_date || null,
    departureDate: reservation.departure_date || stayContext.departure_date || null,
    estimatedArrivalTime: reservation.estimated_arrival_time || reservation.arrival_time || metadata.estimated_arrival_time || null,
    reservationStatus: getReceptionReservationStatus(reservation, nowKey),
    rawStatus: reservation.status || null,
    phone: getGuestPhone({ reservation, guest }),
    email: getGuestEmail({ reservation, guest }),
    language: reservation.language || stayContext.language || guest.preferred_language || metadata.language || null,
    country: reservation.country || stayContext.country || guest.country || metadata.country || null,
    guestsCount: Math.max(1, adults + children || Number(reservation.guests_count || metadata.guests_count || 1)),
    adults: Number.isFinite(adults) ? adults : null,
    children: Number.isFinite(children) ? children : null,
    bookingChannel: reservation.channel || reservation.source || reservation.pms_provider || null,
    locator: reservation.pms_reservation_id || reservation.reservation_access_token || reservation.locator || reservation.id,
    pmsProvider: reservation.pms_provider || stayContext.raw_payload?.pms_provider || null,
    ratePlan: reservation.rate_plan || stayContext.rate_plan || null,
    boardBasis: reservation.board_basis || null,
    vip: Boolean(guest.vip || guestMetadata.vip || Number(stayContext.vip_score || 0) >= 70),
    vipScore: Number(stayContext.vip_score || guestMetadata.vip_score || 0) || null,
    preferences: [
      ...(Array.isArray(guestMetadata.preferences) ? guestMetadata.preferences : []),
      ...(Array.isArray(metadata.preferences) ? metadata.preferences : [])
    ].slice(0, 6),
    document: documentNumber ? {
      available: true,
      masked: maskDocumentNumber(documentNumber)
    } : {
      available: false,
      masked: null
    },
    readiness,
    roomStatus: roomStatus ? {
      housekeepingStatus: roomStatus.housekeeping_status || 'unknown',
      maintenanceStatus: roomStatus.maintenance_status || 'unknown',
      occupancyStatus: roomStatus.occupancy_status || 'unknown',
      lastUpdatedAt: roomStatus.last_updated_at || null
    } : null,
    checkout: {
      outstandingBalance: folio.outstandingBalance,
      currency: folio.currency,
      folioAvailable: Boolean(folio.available),
      folioDataQuality: folio.dataQuality,
      folioWarnings: folio.warnings,
      folioLastUpdatedAt: folio.lastUpdatedAt,
      folioPreview: folio.previewMessage,
      openCharges: folio.lineItems || [],
      openTickets: tickets.filter((ticket) => !['completed', 'closed', 'resolved'].includes(normalizeLower(ticket.status))).length,
      lateCheckout: Boolean(stayContext.late_checkout_eligible || metadata.late_checkout),
      pendingMessages: conversation?.status === 'active' ? 1 : 0
    },
    connectedData: {
      conversation,
      tickets,
      guestMemory,
      revenueOpportunities: {
        revenuePotential: Number(stayContext.revenue_potential || 0),
        upgradeEligible: Boolean(stayContext.upgrade_eligible),
        lateCheckoutEligible: Boolean(stayContext.late_checkout_eligible),
        transferLikely: Boolean(stayContext.transfer_likely),
        experienceLikely: Boolean(stayContext.experience_likely)
      },
      experienceBookings,
      notes: reservation.notes || metadata.notes || null
    },
    searchText: [
      getGuestName({ reservation, guest }),
      roomNumber,
      getGuestPhone({ reservation, guest }),
      getGuestEmail({ reservation, guest }),
      reservation.pms_reservation_id,
      reservation.reservation_access_token,
      reservation.status,
      documentNumber,
      stayContext.country,
      stayContext.language
    ].filter(Boolean).join(' ').toLowerCase()
  };
};

export const filterReceptionReservations = (reservations = [], { query = '', filter = 'all' } = {}) => {
  const normalizedQuery = normalizeLower(query);

  return reservations.filter((reservation) => {
    const matchesQuery = !normalizedQuery || reservation.searchText?.includes(normalizedQuery);

    if (!matchesQuery) {
      return false;
    }

    if (!filter || filter === 'all') {
      return true;
    }

    if (filter === 'needs_attention') {
      return ['needs_attention', 'missing_data', 'blocked'].includes(reservation.readiness?.status);
    }

    if (filter === 'missing_documents') {
      return !reservation.document?.available;
    }

    if (filter === 'pending_payment') {
      return Number(reservation.checkout?.outstandingBalance || 0) > 0;
    }

    return reservation.reservationStatus === filter;
  });
};

const latestByKey = (rows = [], keyFn) => rows.reduce((map, row) => {
  const key = keyFn(row);
  if (key && !map.has(key)) {
    map.set(key, row);
  }
  return map;
}, new Map());

export const searchReservations = async ({
  supabase,
  hotelId,
  query = '',
  filters = {},
  limit = 250
} = {}) => {
  if (!supabase || !hotelId) {
    return [];
  }

  const today = todayKey();
  const reservations = await safeRows(
    supabase
      .from('reservations')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('arrival_date', { ascending: true, nullsFirst: false })
      .limit(limit)
  );
  const guestIds = [...new Set(reservations.map((reservation) => reservation.guest_id).filter(Boolean))];
  const reservationIds = reservations.map((reservation) => reservation.id).filter(Boolean);

  const [
    guests,
    stayContexts,
    conversations,
    tickets,
    roomStatuses,
    guestMemory,
    experienceBookings,
    folioMessages
  ] = await Promise.all([
    guestIds.length
      ? safeRows(supabase.from('guests').select('*').eq('hotel_id', hotelId).in('id', guestIds))
      : [],
    reservationIds.length
      ? safeRows(supabase.from('guest_stay_context').select('*').eq('hotel_id', hotelId).in('reservation_id', reservationIds).order('last_updated_at', { ascending: false }))
      : [],
    guestIds.length
      ? safeRows(supabase.from('conversations').select('id, guest_id, status, last_message_at, created_at').eq('hotel_id', hotelId).in('guest_id', guestIds).order('last_message_at', { ascending: false, nullsFirst: false }))
      : [],
    safeRows(supabase.from('tickets').select('id, guest_id, room_number, category, priority, status, title, created_at').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(500)),
    safeRows(supabase.from('room_status_snapshots').select('*').eq('hotel_id', hotelId).order('last_updated_at', { ascending: false }).limit(500)),
    guestIds.length
      ? safeRows(supabase.from('guest_memory').select('id, guest_id, memory_key, memory_value, memory_type, updated_at').eq('hotel_id', hotelId).in('guest_id', guestIds).order('updated_at', { ascending: false }).limit(500))
      : [],
    guestIds.length
      ? safeRows(supabase.from('experience_booking_requests').select('*').eq('hotel_id', hotelId).in('guest_id', guestIds).order('created_at', { ascending: false }).limit(500))
      : [],
    reservationIds.length
      ? safeRows(supabase.from('scheduled_messages').select('*').eq('hotel_id', hotelId).eq('automation_type', 'pre_checkout_folio_reminder').in('reservation_id', reservationIds).order('created_at', { ascending: false }).limit(500))
      : []
  ]);

  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
  const stayByReservation = latestByKey(stayContexts, (row) => row.reservation_id);
  const roomByNumber = latestByKey(roomStatuses, (row) => row.room_number);
  const conversationByGuest = latestByKey(conversations, (row) => row.guest_id);
  const folioByReservation = latestByKey(folioMessages, (row) => row.reservation_id);
  const ticketsByGuest = tickets.reduce((map, ticket) => {
    if (ticket.guest_id) {
      map.set(ticket.guest_id, [...(map.get(ticket.guest_id) || []), ticket]);
    }
    if (ticket.room_number) {
      map.set(`room:${ticket.room_number}`, [...(map.get(`room:${ticket.room_number}`) || []), ticket]);
    }
    return map;
  }, new Map());
  const memoryByGuest = guestMemory.reduce((map, item) => {
    map.set(item.guest_id, [...(map.get(item.guest_id) || []), item]);
    return map;
  }, new Map());
  const bookingsByGuest = experienceBookings.reduce((map, item) => {
    map.set(item.guest_id, [...(map.get(item.guest_id) || []), item]);
    return map;
  }, new Map());

  const normalized = reservations.map((reservation) => {
    const guest = guestsById.get(reservation.guest_id) || {};
    const stayContext = stayByReservation.get(reservation.id) || {};
    const roomNumber = getRoomNumber({ reservation, guest, stayContext });
    const relatedTickets = [
      ...(ticketsByGuest.get(reservation.guest_id) || []),
      ...(roomNumber ? ticketsByGuest.get(`room:${roomNumber}`) || [] : [])
    ].filter((ticket, index, list) => list.findIndex((item) => item.id === ticket.id) === index);

    return buildReceptionReservation({
      reservation,
      guest,
      stayContext,
      roomStatus: roomNumber ? roomByNumber.get(roomNumber) || null : null,
      tickets: relatedTickets,
      conversation: conversationByGuest.get(reservation.guest_id) || null,
      guestMemory: memoryByGuest.get(reservation.guest_id) || [],
      experienceBookings: bookingsByGuest.get(reservation.guest_id) || [],
      folioMessage: folioByReservation.get(reservation.id) || null,
      nowKey: today
    });
  });

  return filterReceptionReservations(normalized, {
    query,
    filter: filters.status || filters.quickFilter || 'all'
  }).map(({ searchText, ...reservation }) => reservation);
};

export const getReservationDetails = async ({ supabase, hotelId, reservationId } = {}) => {
  if (!supabase || !hotelId || !reservationId) {
    return null;
  }

  const reservation = await safeMaybeSingle(
    supabase.from('reservations').select('*').eq('hotel_id', hotelId).eq('id', reservationId).maybeSingle()
  );

  if (!reservation) {
    return null;
  }

  const details = await searchReservations({
    supabase,
    hotelId,
    query: '',
    filters: {},
    limit: 500
  });

  return details.find((item) => item.id === reservationId) || buildReceptionReservation({ reservation });
};

export const getGuestProfile = async ({ supabase, hotelId, guestId } = {}) => {
  if (!supabase || !hotelId || !guestId) {
    return null;
  }

  return safeMaybeSingle(
    supabase.from('guests').select('*').eq('hotel_id', hotelId).eq('id', guestId).maybeSingle()
  );
};

export const getCheckinReadiness = async ({ supabase, hotelId, reservationId } = {}) => (
  (await getReservationDetails({ supabase, hotelId, reservationId }))?.readiness || null
);

export const getCheckoutReadiness = async ({ supabase, hotelId, reservationId } = {}) => (
  (await getReservationDetails({ supabase, hotelId, reservationId }))?.checkout || null
);
