const TECHNICAL_SIGNAL_LABELS = [
  'OpenAI retries',
  'Twilio failures',
  'schema cache',
  'repair mode',
  'loop detection',
  'provider queue',
  'dead letter'
];

const nowIso = () => new Date().toISOString();
const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const hoursAgoIso = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const percent = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('System health data unavailable', error.message);
    }

    return fallback;
  }

  return data || fallback;
};

const uniqueById = (rows = []) => Array.from(new Map(rows.map((row) => [row.id, row])).values());

const isOpenTicket = (ticket = {}) => !['closed', 'completed', 'resolved'].includes(String(ticket.status || '').toLowerCase());
const isHumanTakeover = (state = {}) => ['human_takeover', 'ai_paused', 'escalation_lock'].includes(state.conversation_ai_mode);
const isDemoRow = (row = {}) => Boolean(
  row.demo
  || row.is_demo
  || row.metadata?.demo
  || row.metadata?.simulation
  || row.metadata?.source === 'simulation'
  || row.metadata?.source === 'demo'
  || String(row.source || '').includes('demo')
  || String(row.source || '').includes('simulation')
);
const isDemoHotel = (hotel = {}) => Boolean(
  isDemoRow(hotel)
  || ['enterprise_demo', 'pro_demo', 'demo'].includes(hotel.subscription_plan)
  || String(hotel.slug || '').includes('demo')
  || String(hotel.name || '').toLowerCase().includes('demo')
  || String(hotel.name || '').toLowerCase().includes('simulation')
);
const isProviderFailure = (booking = {}) => (
  booking.status === 'failed_provider_email'
  || booking.lead_status === 'failed'
  || booking.metadata?.provider_email_status === 'failed'
);
const isProviderPending = (booking = {}) => (
  ['guest_interested', 'awaiting_guest_details', 'awaiting_guest_confirmation', 'provider_request_sent', 'pending', 'reviewing'].includes(booking.status)
  || ['pending', 'draft'].includes(booking.lead_status || booking.metadata?.provider_email_status)
);

const statusTone = (status) => {
  if (status === 'healthy') return 'emerald';
  if (status === 'warning') return 'amber';
  if (status === 'critical') return 'red';
  return 'slate';
};

const getProviderEmailStatus = (booking = {}) => (
  booking.lead_status
  || booking.metadata?.provider_email_retry_status
  || booking.metadata?.provider_email_status
  || booking.metadata?.lead_status
  || 'pending'
);

const getProviderRetryCount = (booking = {}) => toNumber(
  booking.metadata?.provider_email_retry_count
  ?? booking.metadata?.provider_email_auto_retry_attempts
  ?? booking.metadata?.provider_email_attempts
  ?? 0
);

const getProviderLastRetryAt = (booking = {}) => (
  booking.metadata?.provider_email_last_retry_at
  || booking.metadata?.provider_email_retry_requested_at
  || booking.updated_at
  || booking.created_at
  || null
);

const getProviderName = (booking = {}) => (
  booking.provider_source
  || booking.partner_name
  || booking.metadata?.provider_source
  || booking.metadata?.provider_name
  || 'Unknown provider'
);

const worstStatus = (statuses = []) => {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('missing')) return 'warning';
  return 'healthy';
};

const buildHotelStatusCards = ({
  hotel = {},
  pmsConnections = [],
  tickets = [],
  conversations = [],
  conversationStates = [],
  bookings = [],
  scheduledMessages = [],
  qrRooms = [],
  reservations = [],
  aiLogs = []
}) => {
  const demoEnvironment = isDemoHotel(hotel);
  const enabledPms = pmsConnections.find((item) => item.enabled);
  const realTickets = tickets.filter((ticket) => !isDemoRow(ticket));
  const demoTickets = tickets.filter(isDemoRow);
  const openTickets = realTickets.filter(isOpenTicket);
  const urgentTickets = openTickets.filter((ticket) => ticket.priority === 'urgent');
  const activeConversations = conversations.filter((item) => ['active', 'open', 'needs_human'].includes(item.status || 'active'));
  const humanTakeovers = conversationStates.filter(isHumanTakeover);
  const pendingProviderBookings = bookings.filter(isProviderPending);
  const providerFailures = bookings.filter(isProviderFailure);
  const automationFailures = scheduledMessages.filter((item) => item.status === 'failed');
  const activeQrRooms = qrRooms.filter((room) => room.active !== false && room.qr_enabled !== false);
  const missingDocumentReservations = reservations.filter((reservation) => {
    const metadata = reservation.metadata || {};
    return reservation.arrival_date === new Date().toISOString().slice(0, 10)
      && !reservation.document_number
      && !metadata.document_number
      && !metadata.passport_number;
  });
  const folioWarnings = scheduledMessages.filter((item) => (
    item.automation_type === 'pre_checkout_folio_reminder'
    && item.metadata?.folio_warnings?.length
  ));
  const aiActive = aiLogs.length > 0 || activeConversations.length === 0;

  return [
    {
      id: 'pms',
      label: 'PMS Connected',
      status: enabledPms && !enabledPms.last_sync_error ? 'healthy' : enabledPms ? 'warning' : 'warning',
      value: enabledPms ? enabledPms.provider : 'Not connected',
      description: enabledPms ? 'Reservation data is available for hotel operations.' : 'PMS data is limited until a connector is active.'
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp Online',
      status: hotel.whatsapp_number ? 'healthy' : 'warning',
      value: hotel.whatsapp_number ? 'Configured' : 'Needs setup',
      description: hotel.whatsapp_number ? 'Guest messaging is ready.' : 'WhatsApp setup is incomplete.'
    },
    {
      id: 'ai',
      label: 'AI Active',
      status: aiActive ? 'healthy' : 'warning',
      value: aiActive ? 'Active' : 'Needs activity',
      description: 'Staynex AI is available for guest conversations.'
    },
    {
      id: 'tickets',
      label: 'Open Tickets',
      status: urgentTickets.length ? 'critical' : openTickets.length ? 'warning' : 'healthy',
      value: demoTickets.length ? `${openTickets.length} real` : openTickets.length,
      badge: demoTickets.length || demoEnvironment ? 'Demo separated' : null,
      description: urgentTickets.length
        ? `${urgentTickets.length} active urgent tickets need attention.`
        : openTickets.length
          ? `${openTickets.length} real operational tickets are unresolved.`
          : demoTickets.length
            ? 'No real operational tickets. Demo tickets are separated from live health.'
            : 'No unresolved tickets.'
    },
    {
      id: 'provider_bookings',
      label: 'Provider Bookings',
      status: providerFailures.length ? 'warning' : pendingProviderBookings.length ? 'warning' : 'healthy',
      value: pendingProviderBookings.length,
      description: providerFailures.length ? 'Some provider requests need follow-up.' : pendingProviderBookings.length ? 'Provider requests are waiting for confirmation.' : 'No pending provider bookings.'
    },
    {
      id: 'automations',
      label: 'Automations Healthy',
      status: automationFailures.length ? 'warning' : 'healthy',
      value: automationFailures.length ? `${automationFailures.length} need review` : 'Healthy',
      description: automationFailures.length ? 'Some scheduled guest messages need review.' : 'Scheduled automations are not showing hotel-impacting issues.'
    },
    {
      id: 'conversations',
      label: 'Conversations',
      status: humanTakeovers.length || activeConversations.length > 3 ? 'warning' : 'healthy',
      value: activeConversations.length,
      description: humanTakeovers.length ? `${humanTakeovers.length} conversations are handled by reception.` : 'Conversation workload is manageable.'
    },
    {
      id: 'qr_rooms',
      label: 'QR Rooms Active',
      status: activeQrRooms.length ? 'healthy' : 'warning',
      value: activeQrRooms.length,
      description: activeQrRooms.length ? 'Room QR links are available.' : 'No active QR rooms are visible.'
    },
    {
      id: 'reception',
      label: 'Reception Module',
      status: missingDocumentReservations.length ? 'warning' : 'healthy',
      value: missingDocumentReservations.length ? `${missingDocumentReservations.length} arrivals need data` : 'Healthy',
      description: missingDocumentReservations.length ? 'Some arrivals may need document follow-up.' : 'Pre check-in view is ready.'
    },
    {
      id: 'folio',
      label: 'Checkout Folio',
      status: folioWarnings.length ? 'warning' : 'healthy',
      value: folioWarnings.length ? `${folioWarnings.length} warnings` : 'Healthy',
      description: folioWarnings.length ? 'Some folio previews need reception review.' : 'No folio issues are visible.'
    }
  ];
};

const buildHotelWarnings = (cards = [], { conversationStates = [], bookings = [], tickets = [], reservations = [] } = {}) => {
  const warningCards = cards.filter((card) => card.status !== 'healthy');
  const reviewRisk = conversationStates.filter((state) => ['angry', 'frustrated'].includes(state.sentiment) || state.escalation_level === 'urgent');
  const pendingCheckins = reservations.filter((reservation) => (
    reservation.arrival_date === new Date().toISOString().slice(0, 10)
    && !['checked_in', 'in_house'].includes(String(reservation.status || '').toLowerCase())
  ));

  return [
    ...warningCards.map((card) => ({
      id: card.id,
      severity: card.status === 'critical' ? 'critical' : 'warning',
      message: card.description,
      label: card.label
    })),
    reviewRisk.length ? {
      id: 'review_risk',
      severity: 'warning',
      label: 'Guest review risk detected',
      message: `${reviewRisk.length} conversations may need careful follow-up.`
    } : null,
    pendingCheckins.length ? {
      id: 'pending_checkins',
      severity: 'info',
      label: 'Pending check-ins',
      message: `${pendingCheckins.length} arrivals still need operational review.`
    } : null,
    bookings.filter(isProviderFailure).length ? {
      id: 'provider_follow_up',
      severity: 'warning',
      label: 'Provider booking follow-up',
      message: 'Some experience requests need manual follow-up.'
    } : null,
    tickets.filter((ticket) => !isDemoRow(ticket) && ticket.priority === 'urgent' && isOpenTicket(ticket)).length ? {
      id: 'urgent_tickets',
      severity: 'critical',
      label: 'Urgent tickets unresolved',
      message: 'Urgent operational tickets are still open.'
    } : null
  ].filter(Boolean);
};

export const buildHotelOperationalHealthSnapshot = ({
  hotel = {},
  pmsConnections = [],
  tickets = [],
  conversations = [],
  conversationStates = [],
  bookings = [],
  scheduledMessages = [],
  qrRooms = [],
  reservations = [],
  aiLogs = []
} = {}) => {
  const demoEnvironment = isDemoHotel(hotel);
  const realTickets = tickets.filter((ticket) => !isDemoRow(ticket));
  const demoTickets = tickets.filter(isDemoRow);
  const statusCards = buildHotelStatusCards({
    hotel,
    pmsConnections,
    tickets,
    conversations,
    conversationStates,
    bookings,
    scheduledMessages,
    qrRooms,
    reservations,
    aiLogs
  });
  const warnings = buildHotelWarnings(statusCards, {
    conversationStates,
    bookings,
    tickets,
    reservations
  });
  const overallStatus = worstStatus(statusCards.map((card) => card.status));
  const score = Math.max(0, Math.min(100, Math.round(
    statusCards.reduce((total, card) => total + (card.status === 'healthy' ? 10 : card.status === 'warning' ? 5 : 0), 0)
  )));

  return {
    scope: 'hotel_operational_health',
    generatedAt: nowIso(),
    overallStatus,
    healthScore: score,
    summary: warnings.length
      ? `${warnings.length} operational item${warnings.length === 1 ? '' : 's'} need attention.`
      : 'All hotel systems operational.',
    statusCards: statusCards.map((card) => ({
      ...card,
      tone: statusTone(card.status)
    })),
    warnings,
    safeForHotel: true,
    environment: {
      isDemo: demoEnvironment || demoTickets.length > 0,
      label: demoEnvironment || demoTickets.length > 0 ? 'Demo environment' : 'Live workspace'
    },
    metrics: {
      realOperationalTickets: realTickets.filter(isOpenTicket).length,
      demoTickets: demoTickets.length
    }
  };
};

export const getHotelOperationalHealth = async ({ supabase, hotelId, hotel }) => {
  const today = startOfTodayIso();
  const [
    pmsConnections,
    tickets,
    conversations,
    conversationStates,
    bookings,
    scheduledMessages,
    qrRooms,
    reservations,
    aiLogs
  ] = await Promise.all([
    safeRows(supabase.from('hotel_pms_connections').select('*').eq('hotel_id', hotelId).order('updated_at', { ascending: false }).limit(10)),
    safeRows(supabase.from('tickets').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(250)),
    safeRows(supabase.from('conversations').select('*').eq('hotel_id', hotelId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(250)),
    safeRows(supabase.from('conversation_ai_state').select('*').eq('hotel_id', hotelId).order('updated_at', { ascending: false }).limit(250)),
    safeRows(supabase.from('experience_booking_requests').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(250)),
    safeRows(supabase.from('scheduled_messages').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(250)),
    safeRows(supabase.from('hotel_rooms').select('*').eq('hotel_id', hotelId).limit(500)),
    safeRows(supabase.from('reservations').select('*').eq('hotel_id', hotelId).gte('departure_date', new Date().toISOString().slice(0, 10)).limit(500)),
    safeRows(supabase.from('ai_logs').select('*').eq('hotel_id', hotelId).gte('created_at', today).limit(250))
  ]);

  return buildHotelOperationalHealthSnapshot({
    hotel,
    pmsConnections,
    tickets,
    conversations,
    conversationStates,
    bookings,
    scheduledMessages,
    qrRooms,
    reservations,
    aiLogs
  });
};

const serviceHealth = ({ id, label, status, value, description }) => ({
  id,
  label,
  status,
  tone: statusTone(status),
  value,
  description
});

export const buildPlatformMonitoringSnapshot = ({
  hotels = [],
  pmsConnections = [],
  tickets = [],
  conversations = [],
  conversationStates = [],
  bookings = [],
  scheduledMessages = [],
  aiLogs = [],
  platformAuditLogs = []
} = {}) => {
  const recentAiLogs = aiLogs.filter((log) => !log.created_at || log.created_at >= hoursAgoIso(24));
  const fallbackLogs = recentAiLogs.filter((log) => log.openai_concierge_fallback || log.automation_fallback || log.provider_booking_detected && !log.provider_booking_created);
  const lowConfidenceLogs = recentAiLogs.filter((log) => Number(log.confidence_score || log.confidence || 1) < 0.65);
  const providerFailures = bookings.filter(isProviderFailure);
  const providerRetryQueue = bookings.filter((booking) => ['pending_retry', 'retry', 'queued'].includes(getProviderEmailStatus(booking)));
  const providerSent = bookings.filter((booking) => (
    booking.status === 'provider_request_sent'
    || booking.lead_status === 'sent'
    || booking.metadata?.provider_email_status === 'sent'
    || booking.metadata?.provider_email_sent
  ));
  const providerPending = bookings.filter((booking) => isProviderPending(booking) && !isProviderFailure(booking));
  const providerResponsePending = bookings.filter((booking) => (
    booking.status === 'provider_request_sent'
    || booking.metadata?.provider_response_status === 'pending'
  ));
  const providerRetryAttempts = bookings.reduce((total, booking) => total + getProviderRetryCount(booking), 0);
  const pmsFailures = pmsConnections.filter((connection) => connection.last_sync_error || connection.sync_status === 'failed');
  const twilioFailures = scheduledMessages.filter((message) => message.status === 'failed' && message.channel === 'whatsapp');
  const automationFailures = scheduledMessages.filter((message) => ['failed', 'retry'].includes(message.status));
  const automationSkipped = scheduledMessages.filter((message) => ['skipped', 'blocked'].includes(message.status));
  const demoTickets = tickets.filter(isDemoRow);
  const realOpenTickets = tickets.filter((ticket) => !isDemoRow(ticket) && isOpenTicket(ticket));
  const humanTakeovers = conversationStates.filter(isHumanTakeover);
  const repairModeActivations = conversationStates.filter((state) => state.state_metadata?.repair_mode || state.state_metadata?.conversation_loop_detected);
  const providerFlowFailures = aiLogs.filter((log) => log.provider_booking_detected && !log.provider_booking_created && log.booking_block_reason);
  const translationFailures = aiLogs.filter((log) => log.translation_provider === 'mock_fallback' || log.translation_error);
  const webhookIssues = pmsConnections.filter((connection) => connection.webhook_enabled && connection.webhook_status && connection.webhook_status !== 'healthy');
  const webhookSources = [
    ...pmsConnections.filter((connection) => connection.webhook_enabled).map((connection) => ({
      id: connection.id,
      source: connection.provider || 'PMS',
      hotelId: connection.hotel_id,
      status: connection.webhook_status || 'unknown',
      lastReceivedAt: connection.last_webhook_at || connection.updated_at || null,
      lastSuccessfulDeliveryAt: connection.last_webhook_success_at || connection.last_webhook_at || null,
      failedCount: toNumber(connection.webhook_failed_count || connection.metadata?.webhook_failed_count),
      retryCount: toNumber(connection.webhook_retry_count || connection.metadata?.webhook_retry_count),
      uptimeEstimate: connection.webhook_status === 'healthy' ? 99 : connection.webhook_status ? 82 : 0
    })),
    {
      id: 'whatsapp-webhook',
      source: 'WhatsApp',
      hotelId: null,
      status: twilioFailures.length ? 'warning' : 'healthy',
      lastReceivedAt: conversations[0]?.last_message_at || conversations[0]?.updated_at || null,
      lastSuccessfulDeliveryAt: scheduledMessages.find((message) => message.status === 'sent')?.updated_at || null,
      failedCount: twilioFailures.length,
      retryCount: scheduledMessages.filter((message) => message.channel === 'whatsapp' && message.status === 'retry').length,
      uptimeEstimate: twilioFailures.length ? 90 : 99
    }
  ];
  const hotelsWithWarnings = hotels.filter((hotel) => (
    !hotel.whatsapp_number
    || pmsConnections.some((connection) => connection.hotel_id === hotel.id && (connection.last_sync_error || connection.sync_status === 'failed'))
    || tickets.some((ticket) => ticket.hotel_id === hotel.id && ticket.priority === 'urgent' && isOpenTicket(ticket))
  ));
  const openTickets = tickets.filter(isOpenTicket);
  const urgentTickets = realOpenTickets.filter((ticket) => ticket.priority === 'urgent');
  const activeHotels = new Set([
    ...conversations.map((row) => row.hotel_id),
    ...aiLogs.map((row) => row.hotel_id),
    ...pmsConnections.filter((row) => row.enabled).map((row) => row.hotel_id)
  ].filter(Boolean));
  const escalationRate = conversations.length ? Math.round((humanTakeovers.length / Math.max(1, conversations.length)) * 100) : 0;
  const averageConfidence = recentAiLogs.length
    ? Math.round((recentAiLogs.reduce((total, log) => total + Number(log.confidence_score || log.confidence || 0), 0) / recentAiLogs.length) * 100)
    : 0;
  const safeRecoveryEvents = fallbackLogs.length + repairModeActivations.length;
  const clarificationEvents = recentAiLogs.filter((log) => ['clarification_needed', 'clarification', 'unknown_clarify'].includes(log.detected_intent || log.intent || log.response_strategy)).length;
  const recoverySuccessRate = safeRecoveryEvents ? Math.max(0, Math.min(100, 100 - percent(providerFlowFailures.length + lowConfidenceLogs.length, safeRecoveryEvents + lowConfidenceLogs.length))) : 100;
  const conversationsResolvedAutomatically = Math.max(0, conversations.length - humanTakeovers.length - urgentTickets.length);
  const aiAssistanceCompletionRate = percent(conversationsResolvedAutomatically, Math.max(1, conversations.length));
  const providerBookingSuccessRate = percent(providerSent.length, Math.max(1, providerSent.length + providerFailures.length));
  const safeAutomationRate = percent(
    scheduledMessages.filter((message) => ['preview', 'sent', 'scheduled'].includes(message.status)).length,
    Math.max(1, scheduledMessages.length)
  );
  const avgGuestSentiment = conversationStates.filter((state) => ['angry', 'frustrated'].includes(state.sentiment)).length
    ? 'Needs attention'
    : conversationStates.filter((state) => ['happy', 'positive'].includes(state.sentiment)).length
      ? 'Positive'
      : 'Stable';

  const services = [
    serviceHealth({
      id: 'openai',
      label: 'OpenAI health',
      status: recoverySuccessRate < 85 || lowConfidenceLogs.length > 10 ? 'warning' : 'healthy',
      value: `${recoverySuccessRate}% recovery`,
      description: `${safeRecoveryEvents} safe recovery events and ${clarificationEvents} clarification events in the latest sample.`
    }),
    serviceHealth({
      id: 'twilio',
      label: 'Twilio health',
      status: twilioFailures.length ? 'critical' : 'healthy',
      value: twilioFailures.length,
      description: 'Failed WhatsApp scheduled messages.'
    }),
    serviceHealth({
      id: 'pms',
      label: 'PMS connector health',
      status: pmsFailures.length ? 'warning' : 'healthy',
      value: `${pmsConnections.filter((item) => item.enabled).length} enabled`,
      description: `${pmsFailures.length} PMS connections with sync failures.`
    }),
    serviceHealth({
      id: 'resend',
      label: 'Resend health',
      status: providerFailures.length ? 'warning' : 'healthy',
      value: providerFailures.length,
      description: 'Provider email failures from experience booking requests.'
    }),
    serviceHealth({
      id: 'webhooks',
      label: 'Webhook health',
      status: webhookIssues.length ? 'warning' : 'healthy',
      value: webhookIssues.length,
      description: `${webhookSources.filter((source) => source.lastReceivedAt).length} sources have recent webhook activity.`
    }),
    serviceHealth({
      id: 'automation_queue',
      label: 'Automation queue',
      status: automationFailures.length ? 'warning' : 'healthy',
      value: automationFailures.length,
      description: `${automationSkipped.length} blocked or skipped scheduled messages.`
    })
  ];

  const failedEvents = [
    ...providerFailures.map((row) => ({
      id: `provider-${row.id}`,
      type: 'provider_email_failure',
      severity: 'warning',
      hotelId: row.hotel_id,
      entityId: row.id,
      retryable: !row.metadata?.provider_email_sent,
      retryCount: getProviderRetryCount(row),
      retryStatus: getProviderEmailStatus(row),
      lastRetryAt: getProviderLastRetryAt(row),
      provider: getProviderName(row),
      title: 'Provider email failed',
      detail: row.experience_title || row.provider_source || row.id,
      createdAt: row.updated_at || row.created_at
    })),
    ...pmsFailures.map((row) => ({
      id: `pms-${row.id}`,
      type: 'pms_sync_failure',
      severity: 'warning',
      hotelId: row.hotel_id,
      title: 'PMS sync failure',
      detail: row.last_sync_error || row.sync_status || row.provider,
      createdAt: row.updated_at || row.last_sync_at
    })),
    ...twilioFailures.map((row) => ({
      id: `twilio-${row.id}`,
      type: 'twilio_failure',
      severity: 'critical',
      hotelId: row.hotel_id,
      title: 'WhatsApp delivery failed',
      detail: row.automation_type || row.channel,
      createdAt: row.updated_at || row.created_at
    })),
    ...automationFailures.map((row) => ({
      id: `automation-${row.id}`,
      type: 'automation_failure',
      severity: 'warning',
      hotelId: row.hotel_id,
      title: 'Automation message failed or retrying',
      detail: row.automation_type || row.status,
      createdAt: row.updated_at || row.created_at
    }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 30);

  const alerts = [
    pmsFailures.length ? { severity: 'warning', title: 'PMS disconnected or failing', message: `${pmsFailures.length} PMS connection issues detected.` } : null,
    twilioFailures.length ? { severity: 'critical', title: 'WhatsApp offline/failing', message: `${twilioFailures.length} WhatsApp messages failed.` } : null,
    providerFailures.length ? { severity: 'warning', title: 'Provider emails failing', message: `${providerFailures.length} provider booking emails failed.`, action: 'retry_provider_email' } : null,
    providerRetryAttempts > 5 ? { severity: 'warning', title: 'High provider retry rate', message: `${providerRetryAttempts} provider retry attempts are recorded.`, action: 'review_provider_retries' } : null,
    averageConfidence && averageConfidence < 70 ? { severity: 'warning', title: 'AI confidence degradation', message: `Average confidence is ${averageConfidence}%.` } : null,
    escalationRate > 20 ? { severity: 'warning', title: 'High human takeover rate', message: `${escalationRate}% of conversations are in human takeover.` } : null,
    urgentTickets.length > 5 ? { severity: 'warning', title: 'Too many escalations', message: `${urgentTickets.length} urgent tickets are unresolved.` } : null,
    webhookIssues.length ? { severity: 'warning', title: 'Webhook delays/issues', message: `${webhookIssues.length} webhook integrations need review.` } : null
  ].filter(Boolean);

  return {
    scope: 'platform_monitoring_internal',
    generatedAt: nowIso(),
    internalOnly: true,
    globalHealth: {
      status: worstStatus(services.map((service) => service.status)),
      services,
      activeHotels: activeHotels.size,
      totalHotels: hotels.length,
      hotelsWithWarnings: hotelsWithWarnings.length,
      disconnectedPmsHotels: hotels.filter((hotel) => !pmsConnections.some((connection) => connection.hotel_id === hotel.id && connection.enabled)).length,
      whatsappIssueHotels: hotels.filter((hotel) => !hotel.whatsapp_number).length,
      highReviewRiskHotels: [...new Set(conversationStates.filter((state) => ['angry', 'frustrated'].includes(state.sentiment) || state.escalation_level === 'urgent').map((state) => state.hotel_id).filter(Boolean))].length
    },
    aiHealth: {
      safeRecoveryEvents,
      clarificationEvents,
      recoverySuccessRate,
      conversationsResolvedAutomatically,
      aiAssistanceCompletionRate,
      humanTakeoverRate: escalationRate,
      guestSatisfactionEstimate: avgGuestSentiment,
      aiHelpfulnessScore: Math.max(0, Math.min(100, Math.round((averageConfidence + recoverySuccessRate + aiAssistanceCompletionRate) / 3))),
      safeAutomationRate,
      averageConfidence,
      escalationRate,
      providerFlowFailures: providerFlowFailures.length,
      translationFailures: translationFailures.length,
      lowConfidenceEvents: lowConfidenceLogs.length
    },
    automationMonitoring: {
      previewGenerated: scheduledMessages.filter((message) => message.status === 'preview').length,
      sent: scheduledMessages.filter((message) => message.status === 'sent').length,
      blocked: scheduledMessages.filter((message) => ['blocked', 'skipped'].includes(message.status)).length,
      retry: scheduledMessages.filter((message) => message.status === 'retry').length,
      failed: scheduledMessages.filter((message) => message.status === 'failed').length
    },
    queueMonitoring: {
      retryQueue: scheduledMessages.filter((message) => message.status === 'retry').length,
      deadLetterQueue: scheduledMessages.filter((message) => message.status === 'dead_letter').length,
      providerRetryStatus: bookings.filter((booking) => ['retry', 'failed'].includes(booking.lead_status || booking.metadata?.provider_email_status)).length,
      failedScheduledMessages: scheduledMessages.filter((message) => message.status === 'failed').length,
      queueDelays: scheduledMessages.filter((message) => message.status === 'scheduled' && message.scheduled_for && message.scheduled_for < nowIso()).length
    },
    providerMonitoring: {
      successRate: providerBookingSuccessRate,
      totalRequests: bookings.length,
      sent: providerSent.length,
      failed: providerFailures.length,
      pendingConfirmations: providerResponsePending.length,
      pendingRequests: providerPending.length,
      retryQueue: providerRetryQueue.length,
      retryAttempts: providerRetryAttempts,
      averageResponseTimeHours: 0,
      providersWithHighestFailures: Object.values(providerFailures.reduce((acc, booking) => {
        const provider = getProviderName(booking);
        acc[provider] = acc[provider] || { provider, failures: 0, retryAttempts: 0 };
        acc[provider].failures += 1;
        acc[provider].retryAttempts += getProviderRetryCount(booking);
        return acc;
      }, {})).sort((a, b) => b.failures - a.failures).slice(0, 5),
      retryItems: providerFailures.concat(providerRetryQueue).map((booking) => ({
        id: booking.id,
        hotelId: booking.hotel_id,
        provider: getProviderName(booking),
        experience: booking.experience_title || booking.metadata?.experience_title || 'Experience request',
        status: getProviderEmailStatus(booking),
        retryCount: getProviderRetryCount(booking),
        lastRetryAt: getProviderLastRetryAt(booking),
        retryable: !booking.metadata?.provider_email_sent
      })).slice(0, 20)
    },
    webhookMonitoring: {
      sources: webhookSources,
      failedWebhookCount: webhookSources.reduce((total, source) => total + toNumber(source.failedCount), 0),
      retryCount: webhookSources.reduce((total, source) => total + toNumber(source.retryCount), 0),
      lastWebhookReceivedAt: webhookSources
        .map((source) => source.lastReceivedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null,
      uptimeEstimate: Math.round(webhookSources.reduce((total, source) => total + toNumber(source.uptimeEstimate), 0) / Math.max(1, webhookSources.length))
    },
    ticketMonitoring: {
      realOpenTickets: realOpenTickets.length,
      urgentTickets: urgentTickets.length,
      lowPriorityTickets: realOpenTickets.filter((ticket) => ['low', 'normal'].includes(ticket.priority || 'normal')).length,
      demoTickets: demoTickets.length,
      demoDataDetected: demoTickets.length > 0 || hotels.some(isDemoHotel)
    },
    failedEvents,
    alerts,
    recentInternalLogs: platformAuditLogs.slice(0, 20)
  };
};

export const getPlatformMonitoring = async ({ supabase }) => {
  const [
    hotels,
    pmsConnections,
    tickets,
    conversations,
    conversationStates,
    bookings,
    scheduledMessages,
    aiLogs,
    platformAuditLogs
  ] = await Promise.all([
    safeRows(supabase.from('hotels').select('*').order('created_at', { ascending: false }).limit(500)),
    safeRows(supabase.from('hotel_pms_connections').select('*').order('updated_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('conversations').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(1000)),
    safeRows(supabase.from('conversation_ai_state').select('*').order('updated_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('experience_booking_requests').select('*').order('created_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('scheduled_messages').select('*').order('created_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('ai_logs').select('*').order('created_at', { ascending: false }).limit(1000)),
    safeRows(supabase.from('platform_audit_logs').select('*').order('created_at', { ascending: false }).limit(100))
  ]);

  return buildPlatformMonitoringSnapshot({
    hotels,
    pmsConnections,
    tickets,
    conversations,
    conversationStates,
    bookings,
    scheduledMessages,
    aiLogs,
    platformAuditLogs: uniqueById(platformAuditLogs)
  });
};

export const hotelHealthContainsTechnicalInternals = (snapshot = {}) => {
  const text = JSON.stringify(snapshot).toLowerCase();
  return TECHNICAL_SIGNAL_LABELS.some((label) => text.includes(label.toLowerCase()));
};
