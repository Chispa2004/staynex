import { syncAllSheets } from './google-sheets.service.js';
import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const safeRows = async (query, tableName = 'table') => {
  const { data, error } = await query;

  if (error) {
    const missing = error.message?.includes(tableName)
      || error.details?.includes(tableName)
      || error.hint?.includes(tableName);

    if (missing) {
      return [];
    }

    throw error;
  }

  return data || [];
};

const toNumber = (value) => Number(value || 0);
const boolLabel = (value) => value ? 'Yes' : 'No';
const dateValue = (value) => value ? new Date(value).toISOString() : '';

const byHotel = (rows, key = 'hotel_id') => rows.reduce((acc, row) => {
  if (row[key]) {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
  }
  return acc;
}, {});

const sumByHotel = (rows, key) => rows.reduce((acc, row) => {
  if (row.hotel_id) {
    acc[row.hotel_id] = (acc[row.hotel_id] || 0) + toNumber(row[key]);
  }
  return acc;
}, {});

const latestByHotel = (rows, fields = ['updated_at', 'created_at']) => rows.reduce((acc, row) => {
  if (!row.hotel_id) return acc;
  const value = fields.map((field) => row[field]).find(Boolean);
  if (!value) return acc;
  if (!acc[row.hotel_id] || new Date(value).getTime() > new Date(acc[row.hotel_id]).getTime()) {
    acc[row.hotel_id] = value;
  }
  return acc;
}, {});

const mapById = (rows) => rows.reduce((acc, row) => {
  acc[row.id] = row;
  return acc;
}, {});

const latestConnectionByHotel = (connections) => connections.reduce((acc, connection) => {
  if (!connection.hotel_id) return acc;
  const current = acc[connection.hotel_id];
  if (!current || new Date(connection.updated_at || 0).getTime() > new Date(current.updated_at || 0).getTime()) {
    acc[connection.hotel_id] = connection;
  }
  return acc;
}, {});

const normalizeRevenue = (booking) => ({
  revenue: toNumber(booking.estimated_revenue || booking.metadata?.estimated_revenue),
  staynexCommission: toNumber(booking.platform_commission_amount || booking.metadata?.platform_commission_amount || booking.commission_estimate),
  providerPayout: toNumber(booking.provider_payout_amount || booking.metadata?.provider_payout_amount)
});

const isPartnerBooking = (booking) => (
  booking.revenue_owner === 'staynex'
  || booking.revenue_type === 'partner_marketplace'
  || booking.metadata?.revenue_owner === 'staynex'
  || booking.metadata?.revenue_type === 'partner_marketplace'
  || Boolean(booking.provider_id)
);

const buildHealth = ({ hotel, pmsConnection, whatsappReady, reservations, users }) => {
  let score = 20;
  if (pmsConnection?.enabled) score += 25;
  if (whatsappReady) score += 20;
  if (reservations > 0) score += 15;
  if (users > 0) score += 10;
  if (hotel.updated_at) score += 10;
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs setup';
  if (score >= 35) return 'Attention';
  return 'Inactive';
};

export const loadPlatformSheetsData = async (supabase = getSupabase()) => {
  const [
    hotels,
    reservations,
    experienceBookings,
    automations,
    automationRuns,
    pmsConnections,
    conversations,
    aiLogs,
    tickets,
    hotelUsers,
    roomStatusRows,
    occupancyRows,
    guestStayContexts,
    scheduledMessages
  ] = await Promise.all([
    safeRows(supabase.from('hotels').select('*').order('created_at', { ascending: false }), 'hotels'),
    safeRows(supabase.from('reservations').select('*').order('created_at', { ascending: false }).limit(5000), 'reservations'),
    safeRows(supabase.from('experience_booking_requests').select('*').order('created_at', { ascending: false }).limit(5000), 'experience_booking_requests'),
    safeRows(supabase.from('automations').select('*').order('created_at', { ascending: false }).limit(1000), 'automations'),
    safeRows(supabase.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(5000), 'automation_runs'),
    safeRows(supabase.from('hotel_pms_connections').select('*').order('updated_at', { ascending: false }), 'hotel_pms_connections'),
    safeRows(supabase.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(5000), 'conversations'),
    safeRows(supabase.from('ai_logs').select('*').order('created_at', { ascending: false }).limit(5000), 'ai_logs'),
    safeRows(supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(2000), 'tickets'),
    safeRows(supabase.from('hotel_users').select('*'), 'hotel_users'),
    safeRows(supabase.from('room_status_snapshots').select('*'), 'room_status_snapshots'),
    safeRows(supabase.from('hotel_occupancy_snapshots').select('*').order('created_at', { ascending: false }).limit(1000), 'hotel_occupancy_snapshots'),
    safeRows(supabase.from('guest_stay_context').select('*').order('last_updated_at', { ascending: false }).limit(5000), 'guest_stay_context'),
    safeRows(supabase.from('scheduled_messages').select('*').order('created_at', { ascending: false }).limit(5000), 'scheduled_messages')
  ]);

  return {
    hotels,
    reservations,
    experienceBookings,
    automations,
    automationRuns,
    pmsConnections,
    conversations,
    aiLogs,
    tickets,
    hotelUsers,
    roomStatusRows,
    occupancyRows,
    guestStayContexts,
    scheduledMessages
  };
};

const rowsWithHeader = (header, rows) => [header, ...rows];

export const buildHotelsSheetRows = (data) => {
  const usersByHotel = byHotel(data.hotelUsers);
  const reservationsByHotel = byHotel(data.reservations);
  const conversationsByHotel = byHotel(data.conversations);
  const bookingsByHotel = byHotel(data.experienceBookings);
  const pmsByHotel = latestConnectionByHotel(data.pmsConnections);
  const partnerBookings = data.experienceBookings.filter(isPartnerBooking);
  const partnerRevenueByHotel = sumByHotel(partnerBookings, 'estimated_revenue');
  const staynexCommissionByHotel = partnerBookings.reduce((acc, booking) => {
    if (!booking.hotel_id) return acc;
    acc[booking.hotel_id] = (acc[booking.hotel_id] || 0) + normalizeRevenue(booking).staynexCommission;
    return acc;
  }, {});
  const automationRevenueByHotel = sumByHotel(data.automationRuns, 'revenue_generated');
  const lastActivity = [
    latestByHotel(data.conversations, ['last_message_at', 'created_at']),
    latestByHotel(data.reservations),
    latestByHotel(data.experienceBookings),
    latestByHotel(data.aiLogs),
    latestByHotel(data.tickets)
  ].reduce((acc, source) => {
    Object.entries(source).forEach(([hotelId, value]) => {
      if (!acc[hotelId] || new Date(value).getTime() > new Date(acc[hotelId]).getTime()) {
        acc[hotelId] = value;
      }
    });
    return acc;
  }, {});

  return rowsWithHeader([
    'Hotel ID',
    'Hotel Name',
    'Country',
    'Plan',
    'PMS Connected',
    'WhatsApp Ready',
    'Users',
    'Reservations',
    'AI Conversations',
    'Bookings',
    'Revenue',
    'Partner Revenue',
    'Staynex Commission',
    'Automation Revenue',
    'Health',
    'Last Activity',
    'Created At'
  ], data.hotels.map((hotel) => {
    const pmsConnection = pmsByHotel[hotel.id];
    const revenue = toNumber(partnerRevenueByHotel[hotel.id]) + toNumber(automationRevenueByHotel[hotel.id]);
    const whatsappReady = Boolean(hotel.whatsapp_number);
    return [
      hotel.id,
      hotel.name || '',
      hotel.country || hotel.destination_country || hotel.metadata?.country || '',
      hotel.subscription_plan || hotel.plan || '',
      boolLabel(Boolean(pmsConnection?.enabled)),
      boolLabel(whatsappReady),
      usersByHotel[hotel.id] || 0,
      reservationsByHotel[hotel.id] || 0,
      conversationsByHotel[hotel.id] || 0,
      bookingsByHotel[hotel.id] || 0,
      revenue,
      partnerRevenueByHotel[hotel.id] || 0,
      staynexCommissionByHotel[hotel.id] || 0,
      automationRevenueByHotel[hotel.id] || 0,
      buildHealth({
        hotel,
        pmsConnection,
        whatsappReady,
        reservations: reservationsByHotel[hotel.id] || 0,
        users: usersByHotel[hotel.id] || 0
      }),
      dateValue(lastActivity[hotel.id]),
      dateValue(hotel.created_at)
    ];
  }));
};

export const buildReservationsSheetRows = (data) => {
  const hotelsById = mapById(data.hotels);
  const contextByReservation = data.guestStayContexts.reduce((acc, context) => {
    if (context.reservation_id) acc[context.reservation_id] = context;
    return acc;
  }, {});

  return rowsWithHeader([
    'Reservation ID',
    'Hotel',
    'Guest',
    'Room',
    'Arrival',
    'Departure',
    'Status',
    'Language',
    'Country',
    'VIP Score',
    'Revenue Potential',
    'Stay Phase',
    'Created At'
  ], data.reservations.map((reservation) => {
    const context = contextByReservation[reservation.id] || {};
    return [
      reservation.id,
      hotelsById[reservation.hotel_id]?.name || reservation.hotel_id || '',
      reservation.guest_name || reservation.metadata?.guest_name || '',
      reservation.room_number || reservation.current_room || context.room_number || '',
      reservation.arrival_date || reservation.checkin_date || context.arrival_date || '',
      reservation.departure_date || reservation.checkout_date || context.departure_date || '',
      reservation.status || '',
      reservation.language || context.language || '',
      reservation.country || context.country || '',
      context.vip_score || '',
      context.revenue_potential || '',
      context.stay_phase || '',
      dateValue(reservation.created_at)
    ];
  }));
};

export const buildExperienceBookingsRows = (data) => {
  const hotelsById = mapById(data.hotels);

  return rowsWithHeader([
    'Booking ID',
    'Hotel',
    'Guest',
    'Experience',
    'Provider',
    'Status',
    'Revenue',
    'Staynex Commission',
    'Provider Payout',
    'Lead Status',
    'Created At'
  ], data.experienceBookings.map((booking) => {
    const revenue = normalizeRevenue(booking);
    return [
      booking.id,
      hotelsById[booking.hotel_id]?.name || booking.hotel_id || '',
      booking.guest_name || booking.metadata?.guest_name || '',
      booking.experience_title || booking.provider_experience_title || booking.metadata?.provider_experience_title || '',
      booking.provider_source || booking.partner_name || booking.metadata?.provider_source || '',
      booking.status || '',
      revenue.revenue,
      revenue.staynexCommission,
      revenue.providerPayout,
      booking.lead_status || booking.metadata?.provider_email_status || '',
      dateValue(booking.created_at)
    ];
  }));
};

export const buildPartnerRevenueRows = (data) => {
  const hotelsById = mapById(data.hotels);
  const grouped = data.experienceBookings.filter(isPartnerBooking).reduce((acc, booking) => {
    const provider = booking.provider_source || booking.partner_name || booking.metadata?.provider_source || 'Unknown provider';
    const hotel = hotelsById[booking.hotel_id]?.name || 'Unknown hotel';
    const key = `${provider}:${hotel}`;
    const revenue = normalizeRevenue(booking);
    const current = acc[key] || {
      provider,
      hotel,
      leads: 0,
      bookings: 0,
      grossRevenue: 0,
      staynexCommission: 0,
      providerPayout: 0,
      failedEmails: 0,
      sentEmails: 0
    };
    current.leads += 1;
    if (['confirmed', 'completed'].includes(booking.status)) current.bookings += 1;
    current.grossRevenue += revenue.revenue;
    current.staynexCommission += revenue.staynexCommission;
    current.providerPayout += revenue.providerPayout;
    if ((booking.lead_status || booking.metadata?.provider_email_status) === 'failed') current.failedEmails += 1;
    if ((booking.lead_status || booking.metadata?.provider_email_status) === 'sent') current.sentEmails += 1;
    acc[key] = current;
    return acc;
  }, {});

  return rowsWithHeader([
    'Provider',
    'Hotel',
    'Bookings',
    'Gross Revenue',
    'Staynex Commission',
    'Provider Payout',
    'Conversion Rate',
    'Email Status'
  ], Object.values(grouped).map((row) => [
    row.provider,
    row.hotel,
    row.bookings,
    row.grossRevenue,
    row.staynexCommission,
    row.providerPayout,
    row.leads ? `${Math.round((row.bookings / row.leads) * 100)}%` : '0%',
    row.failedEmails ? 'failed' : row.sentEmails ? 'sent' : 'pending'
  ]));
};

export const buildAutomationRows = (data) => {
  const hotelsById = mapById(data.hotels);
  const runsByAutomation = data.automationRuns.reduce((acc, run) => {
    const key = run.automation_id || `${run.hotel_id}:${run.automation_type}`;
    const current = acc[key] || { runs: 0, converted: 0, revenue: 0, lastRun: null };
    current.runs += 1;
    if (run.converted) current.converted += 1;
    current.revenue += toNumber(run.revenue_generated);
    const runDate = run.updated_at || run.created_at;
    if (runDate && (!current.lastRun || new Date(runDate).getTime() > new Date(current.lastRun).getTime())) {
      current.lastRun = runDate;
    }
    acc[key] = current;
    return acc;
  }, {});

  return rowsWithHeader([
    'Automation',
    'Hotel',
    'Status',
    'Trigger',
    'Audience',
    'Revenue Generated',
    'Conversion',
    'Cooldown',
    'Last Run'
  ], data.automations.map((automation) => {
    const runKey = automation.id || `${automation.hotel_id}:${automation.type}`;
    const runStats = runsByAutomation[runKey] || runsByAutomation[`${automation.hotel_id}:${automation.type}`] || {};
    return [
      automation.name || automation.type || '',
      hotelsById[automation.hotel_id]?.name || automation.hotel_id || '',
      automation.active ? 'active' : 'inactive',
      automation.trigger_type || '',
      automation.audience_type || '',
      runStats.revenue || 0,
      runStats.runs ? `${Math.round((toNumber(runStats.converted) / runStats.runs) * 100)}%` : '0%',
      automation.cooldown_minutes || '',
      dateValue(runStats.lastRun)
    ];
  }));
};

export const buildPmsStatusRows = (data) => {
  const pmsByHotel = latestConnectionByHotel(data.pmsConnections);
  const roomStatusByHotel = byHotel(data.roomStatusRows);
  const occupancyByHotel = data.occupancyRows.reduce((acc, row) => {
    if (!acc[row.hotel_id]) acc[row.hotel_id] = row;
    return acc;
  }, {});
  const guestContextByHotel = byHotel(data.guestStayContexts);
  const reservationsByHotel = byHotel(data.reservations);

  return rowsWithHeader([
    'Hotel',
    'PMS Connected',
    'Last Sync',
    'Reservations Synced',
    'Occupancy Available',
    'Room Status Available',
    'Operational Context Health'
  ], data.hotels.map((hotel) => {
    const pmsConnection = pmsByHotel[hotel.id];
    const operationalHealth = roomStatusByHotel[hotel.id] || occupancyByHotel[hotel.id] || guestContextByHotel[hotel.id]
      ? 'active'
      : 'fallback';
    return [
      hotel.name || hotel.id,
      boolLabel(Boolean(pmsConnection?.enabled)),
      dateValue(pmsConnection?.last_sync_at || pmsConnection?.updated_at),
      reservationsByHotel[hotel.id] || 0,
      boolLabel(Boolean(occupancyByHotel[hotel.id])),
      boolLabel(Boolean(roomStatusByHotel[hotel.id])),
      operationalHealth
    ];
  }));
};

export const buildWhatsAppStatusRows = (data) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const conversationsToday = data.conversations.filter((conversation) => new Date(conversation.last_message_at || conversation.created_at || 0) >= today);
  const aiLogsToday = data.aiLogs.filter((log) => new Date(log.created_at || 0) >= today);
  const scheduledToday = data.scheduledMessages.filter((message) => new Date(message.created_at || message.scheduled_for || 0) >= today);
  const messagesByHotel = byHotel(conversationsToday);
  const aiHandledByHotel = byHotel(aiLogsToday.filter((log) => log.openai_concierge_used || log.ai_resolution_estimate || log.response_text));
  const escalatedByHotel = byHotel(aiLogsToday.filter((log) => log.needs_human || log.human_reason));
  const automationMessagesByHotel = byHotel(scheduledToday);
  const lastActivity = latestByHotel(data.conversations, ['last_message_at', 'created_at']);

  return rowsWithHeader([
    'Hotel',
    'WhatsApp Ready',
    'Messages Today',
    'AI Handled',
    'Escalated',
    'Automation Messages',
    'Last Activity'
  ], data.hotels.map((hotel) => [
    hotel.name || hotel.id,
    boolLabel(Boolean(hotel.whatsapp_number)),
    messagesByHotel[hotel.id] || 0,
    aiHandledByHotel[hotel.id] || 0,
    escalatedByHotel[hotel.id] || 0,
    automationMessagesByHotel[hotel.id] || 0,
    dateValue(lastActivity[hotel.id])
  ]));
};

export const buildAlertsRows = (data) => {
  const hotelsById = mapById(data.hotels);
  const pmsAlerts = data.pmsConnections
    .filter((connection) => connection.last_sync_error || connection.webhook_status === 'failed')
    .map((connection) => [
      dateValue(connection.updated_at || connection.last_sync_at),
      hotelsById[connection.hotel_id]?.name || connection.hotel_id || '',
      'pms',
      'high',
      connection.last_sync_error || connection.last_webhook_error || 'PMS connection requires attention',
      'No'
    ]);
  const ticketAlerts = data.tickets
    .filter((ticket) => ticket.priority === 'urgent' && !['closed', 'resolved', 'completed'].includes(ticket.status))
    .slice(0, 100)
    .map((ticket) => [
      dateValue(ticket.created_at),
      hotelsById[ticket.hotel_id]?.name || ticket.hotel_id || '',
      'ticket',
      'urgent',
      ticket.title || `${ticket.category || 'Ticket'} requires attention`,
      'No'
    ]);
  const emailAlerts = data.experienceBookings
    .filter((booking) => (booking.lead_status || booking.metadata?.provider_email_status) === 'failed')
    .map((booking) => [
      dateValue(booking.updated_at || booking.created_at),
      hotelsById[booking.hotel_id]?.name || booking.hotel_id || '',
      'provider_email',
      'medium',
      `Provider email failed for ${booking.experience_title || booking.provider_experience_title || 'experience booking'}`,
      'No'
    ]);

  return rowsWithHeader([
    'Timestamp',
    'Hotel',
    'Type',
    'Severity',
    'Message',
    'Resolved'
  ], [...pmsAlerts, ...ticketAlerts, ...emailAlerts].sort((a, b) => new Date(b[0] || 0) - new Date(a[0] || 0)));
};

export const buildPlatformSheetsRows = (data) => ({
  hotels: buildHotelsSheetRows(data),
  reservations: buildReservationsSheetRows(data),
  experienceBookings: buildExperienceBookingsRows(data),
  partnerRevenue: buildPartnerRevenueRows(data),
  automations: buildAutomationRows(data),
  pmsStatus: buildPmsStatusRows(data),
  whatsAppStatus: buildWhatsAppStatusRows(data),
  alerts: buildAlertsRows(data)
});

export const syncPlatformGoogleSheets = async ({ supabase = getSupabase(), sheets = null, spreadsheetId = null } = {}) => {
  logger.info('google_sheets_sync_started');

  try {
    const data = await loadPlatformSheetsData(supabase);
    const rowsByTab = buildPlatformSheetsRows(data);
    const tabs = await syncAllSheets(rowsByTab, {
      ...(sheets ? { sheets } : {}),
      ...(spreadsheetId ? { spreadsheetId } : {})
    });
    const totalRows = tabs.reduce((total, tab) => total + tab.rowsSynced, 0);

    logger.info('google_sheets_sync_completed', {
      tabs: tabs.length,
      totalRows
    });

    return {
      ok: true,
      syncedAt: new Date().toISOString(),
      totalRows,
      tabs
    };
  } catch (error) {
    logger.error('google_sheets_sync_failed', {
      message: error.message,
      stack: error.stack
    });

    throw error;
  }
};
