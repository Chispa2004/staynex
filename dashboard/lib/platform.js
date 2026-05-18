import { getCurrentHotelForRequest } from './current-hotel';
import { writeEnterpriseAuditLog } from './enterprise-audit';
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
  role = null,
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

  await writeEnterpriseAuditLog({
    supabase,
    actor,
    actorRole: role,
    actorPlatformRole: platformRole,
    hotelId,
    action,
    entityType: 'platform_event',
    metadata: {
      ...metadata,
      target_user_id: targetUserId,
      target_email: targetEmail
    }
  });
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

const getHealthStatus = (score = 0) => {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs setup';
  if (score >= 35) return 'Attention';
  return 'Inactive';
};

const buildHealthScore = ({ hotel, stats, pmsConnection, onboarding }) => {
  let score = 12;
  if (onboarding?.onboarding_completed) score += 20;
  if (pmsConnection?.enabled) score += 18;
  if (hotel.whatsapp_number) score += 12;
  if (stats.reservations > 0) score += 10;
  if (stats.activeUsers > 0) score += 10;
  if (stats.experiences > 0) score += 8;
  if (stats.localKnowledge > 0 || stats.knowledgeBase > 0) score += 8;
  if (stats.conversations > 0) score += 6;
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
    experiences,
    experienceBookings,
    localKnowledge,
    knowledgeEntries
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
    safeRows(supabase.from('hotel_experiences').select('*'), 'hotel_experiences'),
    safeRows(supabase.from('experience_booking_requests').select('*'), 'experience_booking_requests'),
    safeRows(supabase.from('local_knowledge_items').select('*'), 'local_knowledge_items'),
    safeRows(supabase.from('hotel_knowledge').select('*'), 'hotel_knowledge')
  ]);

  const usersByHotel = byHotel(users);
  const activeUsersByHotel = users.reduce((acc, row) => {
    if (row.hotel_id && row.status === 'active') acc[row.hotel_id] = (acc[row.hotel_id] || 0) + 1;
    return acc;
  }, {});
  const conversationsByHotel = byHotel(conversations);
  const activeConversationsByHotel = conversations.reduce((acc, row) => {
    if (row.hotel_id && ['active', 'needs_human', 'open'].includes(row.status || 'active')) {
      acc[row.hotel_id] = (acc[row.hotel_id] || 0) + 1;
    }
    return acc;
  }, {});
  const reservationsByHotel = byHotel(reservations);
  const aiLogsByHotel = byHotel(aiLogs);
  const aiHandledByHotel = aiLogs.reduce((acc, row) => {
    if (row.hotel_id && (row.ai_resolution_estimate || row.openai_concierge_used || row.response_text || row.generated_response)) {
      acc[row.hotel_id] = (acc[row.hotel_id] || 0) + 1;
    }
    return acc;
  }, {});
  const ticketsByHotel = byHotel(tickets);
  const openTicketsByHotel = tickets.reduce((acc, ticket) => {
    if (ticket.hotel_id && !['closed', 'completed', 'resolved'].includes(ticket.status)) {
      acc[ticket.hotel_id] = (acc[ticket.hotel_id] || 0) + 1;
    }
    return acc;
  }, {});
  const urgentTicketsByHotel = tickets.reduce((acc, ticket) => {
    if (ticket.hotel_id && ticket.priority === 'urgent' && ['open', 'in_progress'].includes(ticket.status)) {
      acc[ticket.hotel_id] = (acc[ticket.hotel_id] || 0) + 1;
    }
    return acc;
  }, {});
  const revenueByHotel = sumByHotel(conversions.filter((row) => row.status === 'accepted'), 'estimated_amount');
  const offerRevenueByHotel = sumByHotel(offers.filter((row) => row.status === 'accepted' && !row.metadata?.experience_intelligence), 'suggested_price');
  const experienceOfferRevenueByHotel = sumByHotel(offers.filter((row) => row.status === 'accepted' && row.metadata?.experience_intelligence), 'suggested_price');
  const experienceBookingRevenueByHotel = sumByHotel(
    experienceBookings.filter((row) => ['confirmed', 'completed'].includes(row.status)),
    'estimated_revenue'
  );
  const experienceRevenueByHotel = Object.keys({
    ...experienceOfferRevenueByHotel,
    ...experienceBookingRevenueByHotel
  }).reduce((acc, hotelId) => ({
    ...acc,
    [hotelId]: Number(experienceOfferRevenueByHotel[hotelId] || 0) + Number(experienceBookingRevenueByHotel[hotelId] || 0)
  }), {});
  const offersByHotel = byHotel(offers);
  const acceptedOffers = offers.filter((row) => row.status === 'accepted');
  const acceptedOffersByHotel = byHotel(acceptedOffers);
  const experienceBookingsByHotel = byHotel(experienceBookings);
  const partnerBookings = experienceBookings.filter((row) => (
    row.revenue_owner === 'staynex'
    || row.revenue_type === 'partner_marketplace'
    || row.metadata?.revenue_owner === 'staynex'
    || row.metadata?.revenue_type === 'partner_marketplace'
    || row.provider_id
  ));
  const partnerBookingsByHotel = byHotel(partnerBookings);
  const partnerRevenueByHotel = sumByHotel(partnerBookings, 'estimated_revenue');
  const partnerCommissionByHotel = partnerBookings.reduce((acc, row) => {
    if (!row.hotel_id) return acc;
    acc[row.hotel_id] = (acc[row.hotel_id] || 0) + Number(row.platform_commission_amount || row.metadata?.platform_commission_amount || row.commission_estimate || 0);
    return acc;
  }, {});
  const localKnowledgeByHotel = byHotel(localKnowledge);
  const knowledgeEntriesByHotel = byHotel(knowledgeEntries);
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
    latestByHotel(offers),
    latestByHotel(experienceBookings),
    latestByHotel(localKnowledge)
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
      activeConversations: activeConversationsByHotel[hotel.id] || 0,
      aiLogs: aiLogsByHotel[hotel.id] || 0,
      aiHandled: aiHandledByHotel[hotel.id] || 0,
      tickets: ticketsByHotel[hotel.id] || 0,
      openTickets: openTicketsByHotel[hotel.id] || 0,
      urgentTickets: urgentTicketsByHotel[hotel.id] || 0,
      reservations: reservationsByHotel[hotel.id] || 0,
      revenue: revenueByHotel[hotel.id] || 0,
      offerRevenue: offerRevenueByHotel[hotel.id] || 0,
      experienceRevenue: experienceRevenueByHotel[hotel.id] || 0,
      offers: offersByHotel[hotel.id] || 0,
      acceptedOffers: acceptedOffersByHotel[hotel.id] || 0,
      offerConversionRate: offersByHotel[hotel.id] ? Math.round(((acceptedOffersByHotel[hotel.id] || 0) / offersByHotel[hotel.id]) * 100) : 0,
      experienceBookings: experienceBookingsByHotel[hotel.id] || 0,
      partnerBookings: partnerBookingsByHotel[hotel.id] || 0,
      partnerRevenue: partnerRevenueByHotel[hotel.id] || 0,
      partnerCommission: partnerCommissionByHotel[hotel.id] || 0,
      experiences: experiences.filter((item) => item.hotel_id === hotel.id).length,
      localKnowledge: localKnowledgeByHotel[hotel.id] || 0,
      knowledgeBase: knowledgeEntriesByHotel[hotel.id] || 0,
      whatsappConfigured: Boolean(hotel.whatsapp_number)
    };
    const healthScore = buildHealthScore({ hotel, stats, pmsConnection, onboarding });

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
      healthScore,
      healthStatus: getHealthStatus(healthScore),
      lastActivityAt: lastActivityByHotel[hotel.id] || hotel.updated_at || hotel.created_at
    };
  });

  const totalRevenue = conversions
    .filter((row) => row.status === 'accepted')
    .reduce((total, row) => total + Number(row.estimated_amount || 0), 0);
  const totalExperienceRevenue = acceptedOffers
    .filter((row) => row.metadata?.experience_intelligence)
    .reduce((total, row) => total + Number(row.suggested_price || 0), 0);
  const totalOfferRevenue = acceptedOffers
    .filter((row) => !row.metadata?.experience_intelligence)
    .reduce((total, row) => total + Number(row.suggested_price || 0), 0);
  const totalExperienceBookingRevenue = experienceBookings
    .filter((row) => ['confirmed', 'completed'].includes(row.status))
    .reduce((total, row) => total + Number(row.estimated_revenue || 0), 0);
  const totalPartnerLeads = partnerBookings.length;
  const totalPartnerBookings = partnerBookings.filter((row) => ['confirmed', 'completed'].includes(row.status)).length;
  const totalPartnerRevenue = partnerBookings.reduce((total, row) => total + Number(row.estimated_revenue || 0), 0);
  const totalPartnerCommission = partnerBookings.reduce((total, row) => total + Number(row.platform_commission_amount || row.metadata?.platform_commission_amount || row.commission_estimate || 0), 0);
  const totalProviderPayout = partnerBookings.reduce((total, row) => total + Number(row.provider_payout_amount || row.metadata?.provider_payout_amount || 0), 0);
  const pendingProviderEmails = partnerBookings.filter((row) => ['pending', 'draft'].includes(row.lead_status || row.metadata?.provider_email_status)).length;
  const failedProviderEmails = partnerBookings.filter((row) => (row.lead_status || row.metadata?.provider_email_status) === 'failed').length;
  const hotelsById = hotelRows.reduce((acc, hotel) => ({
    ...acc,
    [hotel.id]: hotel
  }), {});
  const partnerMarketplaceSqlReady = experienceBookings.length === 0
    || experienceBookings.some((row) => (
      Object.prototype.hasOwnProperty.call(row, 'revenue_owner')
      || Object.prototype.hasOwnProperty.call(row, 'revenue_type')
      || Object.prototype.hasOwnProperty.call(row, 'platform_commission_amount')
    ));
  const partnerProviderRows = Object.values(partnerBookings.reduce((acc, row) => {
    const providerKey = row.provider_id || row.partner_id || row.provider_source || row.metadata?.provider_source || 'unknown';
    const key = `${providerKey}:${row.hotel_id || 'unknown_hotel'}`;
    const emailStatus = row.lead_status || row.metadata?.provider_email_status || 'pending';
    const current = acc[key] || {
      key,
      provider: row.provider_source || row.partner_name || row.metadata?.provider_source || 'Unknown provider',
      hotelId: row.hotel_id || null,
      hotelSource: hotelsById[row.hotel_id]?.name || 'Unknown hotel',
      bookings: 0,
      leads: 0,
      revenue: 0,
      staynexCommission: 0,
      providerPayout: 0,
      pendingEmails: 0,
      failedEmails: 0,
      status: 'active'
    };
    current.leads += 1;
    if (['confirmed', 'completed'].includes(row.status)) current.bookings += 1;
    current.revenue += Number(row.estimated_revenue || 0);
    current.staynexCommission += Number(row.platform_commission_amount || row.metadata?.platform_commission_amount || row.commission_estimate || 0);
    current.providerPayout += Number(row.provider_payout_amount || row.metadata?.provider_payout_amount || 0);
    if (['pending', 'draft'].includes(emailStatus)) current.pendingEmails += 1;
    if (emailStatus === 'failed') current.failedEmails += 1;
    current.status = current.failedEmails > 0
      ? 'email_failed'
      : current.pendingEmails > 0
        ? 'pending_email'
        : current.bookings > 0
          ? 'converted'
          : 'lead_sent';
    acc[key] = current;
    return acc;
  }, {})).sort((a, b) => b.staynexCommission - a.staynexCommission);
  const topPartnerProvider = partnerProviderRows[0]?.provider || 'No partner data';
  const topPartnerHotel = hotelRows
    .map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      revenue: hotel.stats.partnerRevenue || 0,
      commission: hotel.stats.partnerCommission || 0
    }))
    .sort((a, b) => b.commission - a.commission)[0] || null;
  const totalOffers = offers.length;
  const aiHandled = aiLogs.filter((row) => row.ai_resolution_estimate || row.openai_concierge_used).length;

  return {
    hotels: hotelRows,
    metrics: {
      totalHotels: hotels.length,
      activeHotels: hotelRows.filter((hotel) => (hotel.stats.conversations > 0 || hotel.stats.reservations > 0 || hotel.pms?.enabled)).length,
      hotelsNeedingAttention: hotelRows.filter((hotel) => hotel.healthScore < 60 || hotel.stats.urgentTickets > 0 || hotel.pms?.lastSyncError).length,
      totalReservations: reservations.length,
      totalConversations: conversations.length,
      totalAiConversations: aiLogs.length,
      totalExperienceBookings: experienceBookings.length,
      aiHandledPercent: aiLogs.length ? Math.round((aiHandled / aiLogs.length) * 100) : 0,
      totalAiRevenue: totalRevenue + totalOfferRevenue + totalExperienceRevenue + totalExperienceBookingRevenue,
      totalUpsellRevenue: totalRevenue,
      totalOfferRevenue,
      totalExperienceRevenue,
      totalExperienceBookingRevenue,
      totalPartnerLeads,
      totalPartnerBookings,
      totalPartnerRevenue,
      totalPartnerCommission,
      totalProviderPayout,
      pendingProviderEmails,
      failedProviderEmails,
      topPartnerProvider,
      topPartnerHotel: topPartnerHotel?.name || 'No hotel source',
      partnerConversionRate: totalPartnerLeads ? Math.round((totalPartnerBookings / totalPartnerLeads) * 100) : 0,
      partnerMarketplaceSqlReady,
      totalActiveUsers: users.filter((row) => row.status === 'active').length,
      pmsConnectedHotels: hotelRows.filter((hotel) => hotel.pms?.enabled).length,
      whatsappConfiguredHotels: hotelRows.filter((hotel) => hotel.stats.whatsappConfigured).length,
      totalLocalKnowledge: localKnowledge.length,
      totalExperiences: experiences.length,
      acceptedOffers: acceptedOffers.length,
      offerConversionRate: totalOffers ? Math.round((acceptedOffers.length / totalOffers) * 100) : 0
    },
    revenue: {
      topHotels: hotelRows
        .map((hotel) => ({
          id: hotel.id,
          name: hotel.name,
          revenue: hotel.stats.revenue + hotel.stats.offerRevenue + hotel.stats.experienceRevenue
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
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
      partnerMarketplace: partnerProviderRows.slice(0, 10)
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
      experiences,
      experienceBookings,
      localKnowledge,
      knowledgeEntries
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
    experienceBookings,
    localKnowledge,
    knowledgeEntries,
    auditLogs,
    dataRetentionAuditLogs
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
    safeRows(supabase.from('experience_booking_requests').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(50), 'experience_booking_requests'),
    safeRows(supabase.from('local_knowledge_items').select('*').eq('hotel_id', hotelId).order('priority', { ascending: false }).limit(50), 'local_knowledge_items'),
    safeRows(supabase.from('hotel_knowledge').select('*').eq('hotel_id', hotelId).order('updated_at', { ascending: false }).limit(50), 'hotel_knowledge'),
    safeRows(supabase.from('platform_audit_logs').select('*').eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(25), 'platform_audit_logs'),
    safeRows(supabase.from('data_retention_audit_logs').select('*').eq('hotel_id', hotelId).order('run_at', { ascending: false }).limit(10), 'data_retention_audit_logs')
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
    experienceBookings,
    localKnowledge,
    knowledgeEntries,
    auditLogs,
    dataRetentionAuditLogs,
    planLimits: PLAN_LIMITS[hotel.subscription_plan] || PLAN_LIMITS.starter
  };
};
