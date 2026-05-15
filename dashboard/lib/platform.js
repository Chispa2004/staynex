import { getCurrentHotelForRequest } from './current-hotel';
import { canAccessPlatform } from './permissions';

export const PLAN_LABELS = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  enterprise_demo: 'Enterprise demo',
  pro_demo: 'Pro demo',
  workspace_trial: 'Workspace trial'
};

export const PLAN_LIMITS = {
  starter: { hotels: 1, users: 5, conversations: 1000, ai: 'standard' },
  professional: { hotels: 3, users: 25, conversations: 10000, ai: 'advanced' },
  enterprise: { hotels: 'unlimited', users: 'unlimited', conversations: 'custom', ai: 'custom' },
  enterprise_demo: { hotels: 'demo', users: 'demo', conversations: 'demo', ai: 'full demo' },
  pro_demo: { hotels: 'demo', users: 'demo', conversations: 'demo', ai: 'pro demo' },
  workspace_trial: { hotels: 1, users: 5, conversations: 500, ai: 'trial' }
};

export const slugify = (value) => String(value || 'hotel')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'hotel';

export const normalizeOptional = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const isMissingTable = (error, tableName) => (
  error?.message?.includes(tableName)
  || error?.details?.includes(tableName)
  || error?.hint?.includes(tableName)
);

export const safeRows = async (query, tableName = null, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (tableName && isMissingTable(error, tableName)) {
      return fallback;
    }

    throw error;
  }

  return data || fallback;
};

export const safeCount = async (query, tableName = null, fallback = 0) => {
  const { count, error } = await query;

  if (error) {
    if (tableName && isMissingTable(error, tableName)) {
      return fallback;
    }

    throw error;
  }

  return count || fallback;
};

export const getPlatformContext = async (request, { requireAdmin = false } = {}) => {
  const context = await getCurrentHotelForRequest(request);

  if (!canAccessPlatform(context.platformRole, 'platform_console')) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }

  if (requireAdmin && context.platformRole !== 'platform_admin') {
    const error = new Error('Platform admin access required');
    error.status = 403;
    throw error;
  }

  return context;
};

export const writePlatformAuditLog = async ({
  supabase,
  actor,
  platformRole,
  action,
  hotelId = null,
  targetUserId = null,
  targetEmail = null,
  metadata = {}
}) => {
  try {
    await supabase.from('platform_audit_logs').insert({
      actor_user_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_platform_role: platformRole || 'none',
      action,
      hotel_id: hotelId,
      target_user_id: targetUserId,
      target_email: targetEmail,
      metadata
    });
  } catch (error) {
    if (!isMissingTable(error, 'platform_audit_logs')) {
      console.warn('Platform audit log write failed', error.message);
    }
  }
};

const byHotel = (rows, key = 'hotel_id') => rows.reduce((acc, row) => {
  const hotelId = row[key];
  if (!hotelId) return acc;
  acc[hotelId] = (acc[hotelId] || 0) + 1;
  return acc;
}, {});

const sumByHotel = (rows, valueKey, hotelKey = 'hotel_id') => rows.reduce((acc, row) => {
  const hotelId = row[hotelKey];
  if (!hotelId) return acc;
  acc[hotelId] = (acc[hotelId] || 0) + Number(row[valueKey] || 0);
  return acc;
}, {});

const latestByHotel = (rows, hotelKey = 'hotel_id', dateFields = ['updated_at', 'created_at']) => rows.reduce((acc, row) => {
  const hotelId = row[hotelKey];
  if (!hotelId) return acc;
  const value = dateFields.map((field) => row[field]).find(Boolean);
  const current = acc[hotelId];
  if (!current || (value && new Date(value).getTime() > new Date(current).getTime())) {
    acc[hotelId] = value;
  }
  return acc;
}, {});

const buildHealthScore = ({ hotel, stats, pmsConnection, onboarding }) => {
  let score = 20;
  if (onboarding?.onboarding_completed) score += 20;
  if (pmsConnection?.enabled) score += 18;
  if (hotel.whatsapp_number) score += 14;
  if (stats.activeUsers > 0) score += 12;
  if (stats.conversations > 0) score += 8;
  if (stats.urgentTickets === 0) score += 8;

  return Math.max(0, Math.min(100, score));
};

export const getPlatformOverview = async (supabase) => {
  const [
    hotels,
    users,
    conversations,
    aiLogs,
    tickets,
    reservations,
    pmsConnections,
    onboardingStates,
    conversions,
    offers,
    experiences
  ] = await Promise.all([
    safeRows(supabase.from('hotels').select('*').order('created_at', { ascending: false })),
    safeRows(supabase.from('hotel_users').select('*'), 'hotel_users'),
    safeRows(supabase.from('conversations').select('*'), 'conversations'),
    safeRows(supabase.from('ai_logs').select('*'), 'ai_logs'),
    safeRows(supabase.from('tickets').select('*'), 'tickets'),
    safeRows(supabase.from('reservations').select('*'), 'reservations'),
    safeRows(supabase.from('hotel_pms_connections').select('*'), 'hotel_pms_connections'),
    safeRows(supabase.from('hotel_onboarding_state').select('*'), 'hotel_onboarding_state'),
    safeRows(supabase.from('upsell_conversions').select('*'), 'upsell_conversions'),
    safeRows(supabase.from('ai_offers').select('*'), 'ai_offers'),
    safeRows(supabase.from('hotel_experiences').select('*'), 'hotel_experiences')
  ]);

  const usersByHotel = byHotel(users);
  const activeUsersByHotel = users.reduce((acc, row) => {
    if (row.hotel_id && row.status === 'active') acc[row.hotel_id] = (acc[row.hotel_id] || 0) + 1;
    return acc;
  }, {});
  const conversationsByHotel = byHotel(conversations);
  const reservationsByHotel = byHotel(reservations);
  const aiLogsByHotel = byHotel(aiLogs);
  const ticketsByHotel = byHotel(tickets);
  const urgentTicketsByHotel = tickets.reduce((acc, ticket) => {
    if (ticket.hotel_id && ticket.priority === 'urgent' && ['open', 'in_progress'].includes(ticket.status)) {
      acc[ticket.hotel_id] = (acc[ticket.hotel_id] || 0) + 1;
    }
    return acc;
  }, {});
  const revenueByHotel = sumByHotel(conversions.filter((row) => row.status === 'accepted'), 'estimated_amount');
  const experienceRevenueByHotel = sumByHotel(offers.filter((row) => row.status === 'accepted' && row.metadata?.experience_intelligence), 'suggested_price');
  const offersByHotel = byHotel(offers);
  const acceptedOffers = offers.filter((row) => row.status === 'accepted');
  const pmsByHotel = pmsConnections.reduce((acc, connection) => {
    if (!connection.hotel_id) return acc;
    const current = acc[connection.hotel_id];
    if (!current || new Date(connection.updated_at || 0).getTime() > new Date(current.updated_at || 0).getTime()) {
      acc[connection.hotel_id] = connection;
    }
    return acc;
  }, {});
  const onboardingByHotel = onboardingStates.reduce((acc, state) => {
    acc[state.hotel_id] = state;
    return acc;
  }, {});
  const lastActivityByHotel = [
    latestByHotel(conversations, 'hotel_id', ['last_message_at', 'created_at']),
    latestByHotel(aiLogs),
    latestByHotel(tickets),
    latestByHotel(reservations),
    latestByHotel(conversions),
    latestByHotel(offers)
  ].reduce((acc, source) => {
    Object.entries(source).forEach(([hotelId, value]) => {
      if (!acc[hotelId] || new Date(value).getTime() > new Date(acc[hotelId]).getTime()) {
        acc[hotelId] = value;
      }
    });
    return acc;
  }, {});

  const hotelRows = hotels.map((hotel) => {
    const pmsConnection = pmsByHotel[hotel.id] || null;
    const onboarding = onboardingByHotel[hotel.id] || null;
    const stats = {
      users: usersByHotel[hotel.id] || 0,
      activeUsers: activeUsersByHotel[hotel.id] || 0,
      conversations: conversationsByHotel[hotel.id] || 0,
      aiLogs: aiLogsByHotel[hotel.id] || 0,
      tickets: ticketsByHotel[hotel.id] || 0,
      urgentTickets: urgentTicketsByHotel[hotel.id] || 0,
      reservations: reservationsByHotel[hotel.id] || 0,
      revenue: revenueByHotel[hotel.id] || 0,
      experienceRevenue: experienceRevenueByHotel[hotel.id] || 0,
      offers: offersByHotel[hotel.id] || 0,
      experiences: experiences.filter((item) => item.hotel_id === hotel.id).length
    };

    return {
      ...hotel,
      plan_label: PLAN_LABELS[hotel.subscription_plan] || hotel.subscription_plan || 'No plan',
      pms: pmsConnection ? {
        provider: pmsConnection.provider,
        enabled: pmsConnection.enabled,
        syncStatus: pmsConnection.sync_status,
        lastSyncAt: pmsConnection.last_sync_at,
        lastSyncError: pmsConnection.last_sync_error,
        webhookEnabled: pmsConnection.webhook_enabled,
        webhookStatus: pmsConnection.webhook_status,
        lastWebhookAt: pmsConnection.last_webhook_at
      } : null,
      onboarding: onboarding ? {
        completed: Boolean(onboarding.onboarding_completed),
        currentStep: onboarding.current_step,
        completedSteps: onboarding.completed_steps || [],
        percent: Math.min(100, Math.round(((onboarding.completed_steps || []).length / 8) * 100))
      } : {
        completed: false,
        currentStep: 'hotel_setup',
        completedSteps: [],
        percent: 0
      },
      stats,
      healthScore: buildHealthScore({ hotel, stats, pmsConnection, onboarding }),
      lastActivityAt: lastActivityByHotel[hotel.id] || hotel.updated_at || hotel.created_at
    };
  });

  const totalRevenue = conversions
    .filter((row) => row.status === 'accepted')
    .reduce((total, row) => total + Number(row.estimated_amount || 0), 0);
  const totalExperienceRevenue = acceptedOffers
    .filter((row) => row.metadata?.experience_intelligence)
    .reduce((total, row) => total + Number(row.suggested_price || 0), 0);
  const totalOffers = offers.length;
  const aiHandled = aiLogs.filter((row) => row.ai_resolution_estimate || row.openai_concierge_used).length;

  return {
    hotels: hotelRows,
    metrics: {
      totalHotels: hotels.length,
      activeHotels: hotelRows.filter((hotel) => (hotel.stats.conversations > 0 || hotel.stats.reservations > 0 || hotel.pms?.enabled)).length,
      totalConversations: conversations.length,
      aiHandledPercent: aiLogs.length ? Math.round((aiHandled / aiLogs.length) * 100) : 0,
      totalAiRevenue: totalRevenue + totalExperienceRevenue,
      totalUpsellRevenue: totalRevenue,
      totalExperienceRevenue,
      totalActiveUsers: users.filter((row) => row.status === 'active').length,
      pmsConnectedHotels: hotelRows.filter((hotel) => hotel.pms?.enabled).length,
      acceptedOffers: acceptedOffers.length,
      offerConversionRate: totalOffers ? Math.round((acceptedOffers.length / totalOffers) * 100) : 0
    },
    revenue: {
      topHotels: hotelRows
        .map((hotel) => ({
          id: hotel.id,
          name: hotel.name,
          revenue: hotel.stats.revenue + hotel.stats.experienceRevenue
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      topUpsells: Object.entries(conversions.reduce((acc, row) => {
        const key = row.upsell_type || 'unknown';
        acc[key] = (acc[key] || 0) + Number(row.estimated_amount || 0);
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
      topExperiences: Object.entries(offers
        .filter((row) => row.metadata?.experience_intelligence)
        .reduce((acc, row) => {
          const key = row.metadata?.hotel_experience_title || row.offer_type || 'experience';
          acc[key] = (acc[key] || 0) + Number(row.suggested_price || 0);
          return acc;
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6)
    },
    raw: {
      users,
      conversations,
      aiLogs,
      tickets,
      reservations,
      pmsConnections,
      onboardingStates,
      conversions,
      offers,
      experiences
    }
  };
};

export const getHotelPlatformDetail = async (supabase, hotelId) => {
  const overview = await getPlatformOverview(supabase);
  const hotel = overview.hotels.find((item) => item.id === hotelId);

  if (!hotel) {
    const error = new Error('Hotel not found');
    error.status = 404;
    throw error;
  }

  const [
    users,
    pmsConnections,
    reservations,
    conversations,
    aiLogs,
    tickets,
    conversions,
    offers,
    experiences,
    auditLogs
  ] = await Promise.all([
    safeRows(supabase.from('hotel_users').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }), 'hotel_users'),
    safeRows(supabase.from('hotel_pms_connections').select('*').eq('hotel_id', hotelId).order('updated_at', { ascending: false }), 'hotel_pms_connections'),
    safeRows(supabase.from('reservations').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(25), 'reservations'),
    safeRows(supabase.from('conversations').select('*').eq('hotel_id', hotelId).order('last_message_at', { ascending: false }).limit(25), 'conversations'),
    safeRows(supabase.from('ai_logs').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(25), 'ai_logs'),
    safeRows(supabase.from('tickets').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(25), 'tickets'),
    safeRows(supabase.from('upsell_conversions').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(50), 'upsell_conversions'),
    safeRows(supabase.from('ai_offers').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(50), 'ai_offers'),
    safeRows(supabase.from('hotel_experiences').select('*').eq('hotel_id', hotelId).order('priority', { ascending: false }).limit(50), 'hotel_experiences'),
    safeRows(supabase.from('platform_audit_logs').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(25), 'platform_audit_logs')
  ]);

  return {
    hotel,
    users,
    pmsConnections,
    reservations,
    conversations,
    aiLogs,
    tickets,
    conversions,
    offers,
    experiences,
    auditLogs,
    planLimits: PLAN_LIMITS[hotel.subscription_plan] || PLAN_LIMITS.starter
  };
};
