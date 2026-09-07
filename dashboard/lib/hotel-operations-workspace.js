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
