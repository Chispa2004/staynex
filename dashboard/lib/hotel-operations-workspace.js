import { getConversationAiModeForGate, isHumanControlledConversationForGate } from '../../shared/pilot/ai-safety.js';

const HOTEL_MOVEMENT_EXCLUDED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'no_show',
  'no-show',
  'void'
]);

const COMPLETED_TICKET_STATUSES = new Set([
  'completed',
  'closed',
  'resolved',
  'cancelled',
  'canceled'
]);

const ATTENTION_CONVERSATION_MODES = new Set([
  'human_takeover',
  'ai_paused',
  'escalation_lock'
]);

const ATTENTION_ESCALATION_LEVELS = new Set([
  'reception_required',
  'manager_required',
  'urgent'
]);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

export const isReservationExcludedFromHotelMovement = (reservation = {}) => (
  HOTEL_MOVEMENT_EXCLUDED_STATUSES.has(normalizeStatus(reservation.status))
);

const getGuestDisplayName = (guest = {}) => (
  guest?.name
  || guest?.full_name
  || guest?.guest_name
  || null
);

const buildGuestById = (guests = []) => new Map(
  guests
    .filter((guest) => guest?.id)
    .map((guest) => [guest.id, guest])
);

const getReservationGuestName = (reservation = {}, guestById = new Map()) => (
  reservation.guest_name
  || getGuestDisplayName(guestById.get(reservation.guest_id))
  || null
);

const ticketCategoryDepartments = {
  complaint: 'Recepción',
  emergency: 'Mantenimiento',
  guest_request: 'Recepción',
  hotel_info: 'Recepción',
  housekeeping: 'Pisos',
  maintenance: 'Mantenimiento',
  reception: 'Recepción',
  restaurant: 'Recepción',
  room_service: 'Pisos',
  spa: 'Recepción',
  transport: 'Recepción'
};

export const getTicketDepartmentLabel = (category) => (
  ticketCategoryDepartments[normalizeStatus(category)] || 'Por asignar'
);

const ticketPriorityScores = {
  urgent: 90,
  high: 70,
  normal: 40,
  low: 20
};

const getTicketScore = (ticket = {}) => (
  (ticketPriorityScores[normalizeStatus(ticket.priority)] || 30)
  + (normalizeStatus(ticket.status) === 'open' ? 10 : 0)
);

const getConversationMode = (state = {}) => (
  normalizeStatus(
    state?.state_metadata?.conversation_ai_mode
    || state?.conversation_ai_mode
    || state?.ai_mode
  )
);

const conversationNeedsAttention = (state = {}) => (
  ATTENTION_CONVERSATION_MODES.has(getConversationMode(state))
  || ATTENTION_ESCALATION_LEVELS.has(normalizeStatus(state?.escalation_level))
  || normalizeStatus(state?.sentiment) === 'negative'
  || normalizeStatus(state?.current_intent).startsWith('complaint_')
);

const getDateValue = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const sortNewest = (items = [], field = 'created_at') => [...items].sort(
  (left, right) => getDateValue(right[field]) - getDateValue(left[field])
);

const sortTicketsForAttention = (items = []) => [...items].sort((left, right) => {
  const scoreDelta = getTicketScore(right) - getTicketScore(left);
  if (scoreDelta !== 0) return scoreDelta;
  return getDateValue(right.created_at) - getDateValue(left.created_at);
});

const buildTicketAttentionItems = ({ tickets = [], guestById = new Map() } = {}) => sortTicketsForAttention(
  tickets.filter((ticket) => !COMPLETED_TICKET_STATUSES.has(normalizeStatus(ticket.status)))
).map((ticket) => ({
  id: `ticket:${ticket.id}`,
  type: 'ticket',
  title: ticket.title || 'Ticket sin título',
  guest: getGuestDisplayName(guestById.get(ticket.guest_id)) || null,
  room: ticket.room_number || guestById.get(ticket.guest_id)?.current_room || null,
  area: getTicketDepartmentLabel(ticket.category),
  status: ticket.status || 'open',
  priority: ticket.priority || null,
  createdAt: ticket.created_at || null,
  href: ticket.id ? `/dashboard/tickets/${ticket.id}` : '/dashboard/tickets',
  actionLabel: 'Abrir ticket'
}));

const buildConversationAttentionItems = ({
  conversations = [],
  conversationStates = [],
  guestById = new Map()
} = {}) => {
  const stateByConversationId = new Map(
    conversationStates
      .filter((state) => state?.conversation_id)
      .map((state) => [state.conversation_id, state])
  );

  return sortNewest(conversations, 'last_message_at')
    .map((conversation) => {
      const state = stateByConversationId.get(conversation.id);
      if (!state || !conversationNeedsAttention(state)) {
        return null;
      }

      const guest = guestById.get(conversation.guest_id);
      const mode = getConversationMode(state);

      return {
        id: `conversation:${conversation.id}`,
        type: 'conversation',
        title: normalizeStatus(state.current_intent).startsWith('complaint_')
          ? 'Conversación con queja'
          : 'Conversación necesita atención',
        guest: getGuestDisplayName(guest),
        room: guest?.current_room || null,
        area: mode === 'human_takeover' ? 'Recepción' : 'Por asignar',
        status: mode || state.escalation_level || conversation.status || 'active',
        priority: state.escalation_level || null,
        createdAt: conversation.last_message_at || conversation.created_at || state.updated_at || null,
        href: `/dashboard/inbox?conversationId=${conversation.id}`,
        actionLabel: 'Abrir conversación'
      };
    })
    .filter(Boolean);
};

const getAttentionItemScore = (item = {}) => {
  const priorityScore = ticketPriorityScores[normalizeStatus(item.priority)] || 0;
  const status = normalizeStatus(item.status);
  const statusScore = ATTENTION_CONVERSATION_MODES.has(status) ? 120 : ATTENTION_ESCALATION_LEVELS.has(status) ? 100 : 0;

  return priorityScore + statusScore;
};

const sortAttentionItems = (items = []) => [...items].sort((left, right) => {
  const scoreDelta = getAttentionItemScore(right) - getAttentionItemScore(left);
  if (scoreDelta !== 0) return scoreDelta;
  return getDateValue(right.createdAt) - getDateValue(left.createdAt);
});

const buildMovementItems = ({ reservations = [], guestById = new Map(), dateField }) => sortNewest(
  reservations.filter((reservation) => !isReservationExcludedFromHotelMovement(reservation)),
  dateField
).map((reservation) => ({
  id: reservation.id,
  guest: getReservationGuestName(reservation, guestById),
  room: reservation.room_number || null,
  status: reservation.status || 'scheduled',
  date: reservation[dateField] || null,
  pmsReservationId: reservation.pms_reservation_id || null,
  href: '/dashboard/reservations'
}));

export const buildHotelOperationsWorkspace = ({
  reservationsToday = [],
  reservationsAvailable = true,
  tickets = [],
  conversations = [],
  conversationStates = [],
  guests = [],
  todayDate,
  activeConversationsCount = null,
  openTicketsCount = null
} = {}) => {
  const guestById = buildGuestById(guests);
  const visibleReservations = reservationsToday.filter((reservation) => (
    !isReservationExcludedFromHotelMovement(reservation)
  ));
  const arrivals = buildMovementItems({
    reservations: visibleReservations.filter((reservation) => reservation.arrival_date === todayDate),
    guestById,
    dateField: 'arrival_date'
  });
  const departures = buildMovementItems({
    reservations: visibleReservations.filter((reservation) => reservation.departure_date === todayDate),
    guestById,
    dateField: 'departure_date'
  });
  const ticketAttentionItems = buildTicketAttentionItems({ tickets, guestById });
  const conversationAttentionItems = buildConversationAttentionItems({
    conversations,
    conversationStates,
    guestById
  });

  return {
    counters: {
      arrivalsToday: reservationsAvailable ? arrivals.length : null,
      departuresToday: reservationsAvailable ? departures.length : null,
      activeConversations: activeConversationsCount ?? conversations.filter((item) => item.status === 'active').length,
      openTickets: openTicketsCount ?? ticketAttentionItems.length
    },
    needsAttention: sortAttentionItems([
      ...ticketAttentionItems,
      ...conversationAttentionItems
    ]).slice(0, 8),
    movement: {
      todayDate,
      arrivals: arrivals.slice(0, 6),
      departures: departures.slice(0, 6),
      available: reservationsAvailable,
      source: 'reservations'
    },
    definitions: {
      conversations: 'active_conversations',
      tickets: 'open_or_in_progress_tickets',
      movement: 'reservations_today_excluding_cancelled_no_show'
    }
  };
};

// These bounded reads are separate from the visible samples. Missing columns,
// server row caps and query errors never become a demonstrated zero.
export const CONVERSATION_DASHBOARD_LIMIT = 1000;
const dashboardSources = {
  conversations: ['conversations', 'id,hotel_id,guest_id,status,last_message_at,created_at', 'last_message_at'],
  states: ['conversation_ai_state', 'id,hotel_id,conversation_id,escalation_level,state_metadata,updated_at', 'updated_at'],
  tickets: ['tickets', 'id,hotel_id,conversation_id,status,created_at', 'created_at'],
  offers: ['ai_offers', 'id,hotel_id,conversation_id,metadata,created_at', 'created_at'],
  logs: ['ai_logs', 'id,hotel_id,conversation_id,message_id,ticket_id,ticket_created,generated_response,needs_human,ai_provider,ai_model,detected_intent,automation_triggered,created_at', 'created_at'],
  messages: ['messages', 'id,hotel_id,conversation_id,sender_type,content,metadata,created_at', 'created_at'],
  claims: ['twilio_inbound_message_claims', 'id,hotel_id,message_id,message_sid,first_received_at', 'first_received_at'],
  guests: ['guests', 'id,hotel_id,name,current_room,created_at', 'created_at']
};

export const loadConversationDashboardSources = async (supabase, hotelId) => {
  if (!hotelId) throw new Error('Authorized hotel required');
  return Object.fromEntries(await Promise.all(Object.entries(dashboardSources).map(async ([key, [table, select, order]]) => {
    try {
      const { data, count, error } = await supabase.from(table).select(select, { count: 'exact' })
        .eq('hotel_id', hotelId).order(order, { ascending: false, nullsFirst: true })
        .order('id', { ascending: false }).limit(CONVERSATION_DASHBOARD_LIMIT);
      if (error || !Array.isArray(data)) return [key, { rows: [], complete: false, reason: 'Fuente no disponible' }];
      const complete = Number.isInteger(count) && count === data.length && new Set(data.map(row => row.id)).size === data.length;
      return [key, { rows: data, complete, reason: complete ? null : 'Cobertura incompleta' }];
    } catch {
      return [key, { rows: [], complete: false, reason: 'Fuente no disponible' }];
    }
  })));
};

const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

// Compare calendar days in the hotel's validated zone, including 23/25-hour days.
export const hotelCalendarDay = (value, timezone) => {
  if (!timezone || timestamp(value) === null) return null;
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  } catch { return null; }
};

const synthetic = row => {
  const metadata = row?.metadata || row?.state_metadata || {};
  return metadata.demo === true || metadata.checkin_demo === true || metadata.simulation === true
    || Boolean(metadata.fixture) || /^(demo|mock|simulation)$/i.test(row?.ai_provider || '')
    || /^(demo|mock|simulation|checkin_demo)(?:[_-]|$)/i.test(metadata.source || '');
};
const excludedLog = log => log.automation_triggered === true
  || /^(automation|translation|preview|system)(?:[_:-]|$)/i.test(log.detected_intent || '')
  || /^(system|translation)$/i.test(log.ai_provider || '')
  || /preview|local-test|simulation/i.test(log.ai_model || '');

const reviewReason = state => ({
  reception_required: 'Derivación a recepción',
  manager_required: 'Derivación a dirección',
  urgent: 'Derivación registrada'
}[state?.escalation_level] || 'Derivación registrada');

export const buildConversationDashboard = ({ hotelId, timezone, now = new Date().toISOString(), sources = {}, activeCount = null } = {}) => {
  const rows = key => (sources[key]?.rows || []).filter(row => hotelId && row.hotel_id === hotelId && row.id);
  const complete = (...keys) => keys.every(key => sources[key]?.complete === true
    && rows(key).length === sources[key].rows.length);
  const unavailable = (...keys) => keys.some(key => sources[key]?.reason === 'Fuente no disponible' || !sources[key])
    ? 'Fuente no disponible' : 'Cobertura incompleta';
  const metric = (value, detail) => ({ value, detail });
  const conversations = new Map(rows('conversations').map(row => [row.id, row]));
  const guests = new Map(rows('guests').map(row => [row.id, row]));
  const messages = new Map(rows('messages').filter(row => conversations.has(row.conversation_id)).map(row => [row.id, row]));
  const claims = new Set(rows('claims').filter(row => row.message_sid && messages.get(row.message_id)?.sender_type === 'guest').map(row => row.message_id));
  const states = new Map();
  for (const row of sortNewest(rows('states'), 'updated_at')) {
    if (conversations.has(row.conversation_id) && !states.has(row.conversation_id)) states.set(row.conversation_id, row);
  }
  const validInput = log => {
    const message = messages.get(log.message_id);
    return message?.sender_type === 'guest' && message.conversation_id === log.conversation_id
      && !message.metadata?.system_event && conversations.has(log.conversation_id);
  };
  const originFor = (log, message = messages.get(log.message_id)) => synthetic(log) || synthetic(message)
    ? 'simulated' : validInput(log) && claims.has(log.message_id) ? 'traced' : 'unknown';
  const logs = rows('logs').filter(log => conversations.has(log.conversation_id) && !excludedLog(log));
  const responseLogs = logs.filter(log => typeof log.generated_response === 'string' && log.generated_response.trim() && validInput(log));
  const firstResponses = new Map();
  const firstTracedResponses = new Map();
  let invalidResponseDate = false;
  for (const log of responseLogs) {
    if (timestamp(log.created_at) === null || timestamp(messages.get(log.message_id)?.created_at) === null
      || timestamp(messages.get(log.message_id)?.created_at) > timestamp(log.created_at)) { invalidResponseDate = true; continue; }
    const previous = firstResponses.get(log.message_id);
    if (!previous || timestamp(log.created_at) < timestamp(previous.created_at)) firstResponses.set(log.message_id, log);
    if (originFor(log) === 'traced') {
      const traced = firstTracedResponses.get(log.message_id);
      if (!traced || timestamp(log.created_at) < timestamp(traced.created_at)) firstTracedResponses.set(log.message_id, log);
    }
  }
  const today = hotelCalendarDay(now, timezone);
  const responseComplete = complete('logs', 'messages', 'claims', 'conversations') && !invalidResponseDate;
  const brokenResponseLink = logs.some(log => typeof log.generated_response === 'string' && log.generated_response.trim()
    && !validInput(log) && !synthetic(log) && (!messages.has(log.message_id) || messages.get(log.message_id)?.sender_type === 'guest'));
  const tracedResponses = [...firstTracedResponses.values()];
  const tickets = rows('tickets').filter(ticket => conversations.has(ticket.conversation_id));
  const openTickets = tickets.filter(ticket => ['open', 'in_progress'].includes(ticket.status));
  const currentHuman = [...states.values()].filter(state => isHumanControlledConversationForGate(state));
  const latestLogs = new Map();
  for (const log of sortNewest(logs)) {
    if (validInput(log) && !latestLogs.has(log.conversation_id)) latestLogs.set(log.conversation_id, log);
  }
  const review = [];
  for (const conversation of conversations.values()) {
    const state = states.get(conversation.id);
    const log = latestLogs.get(conversation.id);
    const human = isHumanControlledConversationForGate(state);
    const resumedAt = timestamp(state?.state_metadata?.human_takeover?.resumed_at);
    const logAt = timestamp(log?.created_at);
    const currentStateSignal = ATTENTION_ESCALATION_LEVELS.has(state?.escalation_level)
      && resumedAt === null && log?.needs_human !== false;
    const priorSignal = log?.needs_human === true || currentStateSignal;
    if (!human && !priorSignal) continue;
    // An escalation flag does not establish current human control or urgency.
    const uncertain = !human && (resumedAt !== null || logAt === null || log?.needs_human !== true
      || !complete('logs', 'messages') || (timestamp(conversation.last_message_at) ?? Infinity) > logAt);
    const guest = guests.get(conversation.guest_id);
    const relevant = messages.get(log?.message_id);
    const stateOrigin = synthetic(state) ? 'simulated' : 'unknown';
    review.push({
      id: conversation.id, guest: getGuestDisplayName(guest), room: guest?.current_room || null,
      title: relevant?.content?.slice(0, 600) || 'Mensaje no disponible',
      reasons: [...new Set([human ? 'Control humano actual' : null, priorSignal ? reviewReason(state) : null].filter(Boolean))],
      status: human ? getConversationAiModeForGate(state) : uncertain ? 'Vigencia por confirmar' : 'Derivación registrada',
      priority: human && state?.escalation_level === 'urgent' ? 'urgent' : null,
      createdAt: conversation.last_message_at || null,
      linkedTickets: openTickets.filter(ticket => ticket.conversation_id === conversation.id).length,
      origin: log ? originFor(log) : stateOrigin,
      href: `/dashboard/inbox?conversationId=${encodeURIComponent(conversation.id)}`, actionLabel: 'Abrir conversación'
    });
  }
  const activity = new Map();
  const addEvent = (id, type, log, createdAt, href) => {
    if (timestamp(createdAt) === null || activity.has(id)) return;
    const conversation = conversations.get(log.conversation_id);
    activity.set(id, { id, type, createdAt, guest: getGuestDisplayName(guests.get(conversation?.guest_id)),
      origin: originFor(log), status: 'Registrado', href: href || `/dashboard/inbox?conversationId=${encodeURIComponent(log.conversation_id)}` });
  };
  // Full historical coverage is required to call an event the first response.
  if (responseComplete) for (const log of firstResponses.values()) addEvent(`response:${log.message_id}`, 'Respuesta registrada', log, log.created_at);
  for (const log of [...logs].sort((a, b) => getDateValue(a.created_at) - getDateValue(b.created_at))) {
    if (!validInput(log)) continue;
    if (log.needs_human === true) addEvent(`referral:${log.message_id}`, 'Derivación registrada', log, log.created_at);
    const ticket = tickets.find(item => item.id === log.ticket_id && item.conversation_id === log.conversation_id);
    if (log.ticket_created === true && ticket) addEvent(`ticket:${ticket.id}`, 'Ticket creado por IA', log, ticket.created_at, `/dashboard/tickets/${encodeURIComponent(ticket.id)}`);
  }
  for (const offer of rows('offers')) {
    const conversation = conversations.get(offer.conversation_id);
    if (!conversation || timestamp(offer.created_at) === null) continue;
    activity.set(`offer:${offer.id}`, { id: `offer:${offer.id}`, type: 'Propuesta registrada', createdAt: offer.created_at,
      guest: getGuestDisplayName(guests.get(conversation.guest_id)), origin: synthetic(offer) ? 'simulated' : 'unknown',
      status: 'Registrado', href: `/dashboard/inbox?conversationId=${encodeURIComponent(conversation.id)}` });
  }
  const coverage = complete('logs', 'messages', 'claims', 'conversations', 'states', 'tickets', 'guests', 'offers');
  return {
    counters: {
      activeConversations: metric(Number.isInteger(activeCount) ? activeCount : null, Number.isInteger(activeCount) ? 'Estado activo · hotel' : 'Fuente no disponible'),
      humanControl: metric(complete('states', 'conversations') ? currentHuman.length : null, complete('states', 'conversations') ? 'Control actual · hotel' : unavailable('states', 'conversations')),
      registeredResponsesToday: metric(today && responseComplete && !brokenResponseLink ? tracedResponses.filter(log => hotelCalendarDay(log.created_at, timezone) === today).length : null,
        !today ? 'Zona horaria no disponible' : brokenResponseLink || invalidResponseDate ? 'Vínculo o fecha insuficiente' : !responseComplete ? unavailable('logs', 'messages', 'claims', 'conversations') : 'Hoy · entradas trazables'),
      linkedOpenTickets: metric(complete('tickets', 'conversations') ? openTickets.length : null, complete('tickets', 'conversations') ? 'Abiertos/en curso · vinculados' : unavailable('tickets', 'conversations'))
    },
    review: sortAttentionItems(review).slice(0, 8),
    activity: [...activity.values()].sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt)).slice(0, 12),
    coverage: coverage ? 'complete' : 'incomplete',
    scope: 'Los estados incluyen todos los registros del hotel. La tarjeta IA excluye simulados y origen no confirmado.'
  };
};
