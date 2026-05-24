import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const startOfTodayIso = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const safeCount = async (query, fallback = 0) => {
  const { count, error } = await query;

  if (error) {
    console.warn('Executive dashboard count unavailable', error.message);
    return fallback;
  }

  return count || fallback;
};

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (!isMissingOptionalTable(error)) {
      console.warn('Executive dashboard rows unavailable', error.message);
    }

    return fallback;
  }

  return data || fallback;
};

const withHotel = (query, hotelId) => (
  hotelId ? query.eq('hotel_id', hotelId) : query
);

const revenueByUpsellType = {
  late_checkout: 40,
  room_upgrade: 120,
  airport_transfer: 60,
  spa: 80,
  romantic_package: 150,
  dinner: 90,
  breakfast_upgrade: 25,
  boat_tour: 95,
  sunset_cruise: 120,
  snorkeling: 65,
  beach_club: 85,
  family_activities: 50,
  water_park: 45,
  romantic_dinner: 110,
  spa_couple: 140,
  wine_tasting: 75,
  yacht_experience: 350,
  private_transfer: 80,
  premium_dining: 150,
  golf: 120,
  cultural_tour: 55,
  gastronomy_tour: 80,
  museum_visit: 30,
  indoor_spa: 80,
  local_experiences: 60
};

const isMissingRevenueTable = (error) => (
  error?.message?.includes('upsell_conversions')
  || error?.details?.includes('upsell_conversions')
  || error?.hint?.includes('upsell_conversions')
);

const isMissingOptionalTable = (error) => (
  isMissingRevenueTable(error)
  || error?.message?.includes('guest_ai_profiles')
  || error?.message?.includes('ai_offers')
  || error?.message?.includes('conversation_ai_state')
  || error?.message?.includes('hotel_onboarding_state')
  || error?.message?.includes('local_knowledge_items')
  || error?.message?.includes('room_status_snapshots')
  || error?.message?.includes('hotel_occupancy_snapshots')
  || error?.message?.includes('guest_stay_context')
  || error?.message?.includes('guest_intelligence_profiles')
  || error?.message?.includes('guest_revenue_predictions')
  || error?.message?.includes('guest_interest_affinities')
  || error?.message?.includes('revenue_ai_events')
  || error?.message?.includes('experience_booking_requests')
  || error?.details?.includes('guest_ai_profiles')
  || error?.details?.includes('ai_offers')
  || error?.details?.includes('conversation_ai_state')
  || error?.details?.includes('hotel_onboarding_state')
  || error?.details?.includes('local_knowledge_items')
  || error?.details?.includes('room_status_snapshots')
  || error?.details?.includes('hotel_occupancy_snapshots')
  || error?.details?.includes('guest_stay_context')
  || error?.details?.includes('guest_intelligence_profiles')
  || error?.details?.includes('guest_revenue_predictions')
  || error?.details?.includes('guest_interest_affinities')
  || error?.details?.includes('revenue_ai_events')
  || error?.details?.includes('experience_booking_requests')
  || error?.hint?.includes('guest_ai_profiles')
  || error?.hint?.includes('ai_offers')
  || error?.hint?.includes('conversation_ai_state')
  || error?.hint?.includes('hotel_onboarding_state')
  || error?.hint?.includes('local_knowledge_items')
  || error?.hint?.includes('room_status_snapshots')
  || error?.hint?.includes('hotel_occupancy_snapshots')
  || error?.hint?.includes('guest_stay_context')
  || error?.hint?.includes('guest_intelligence_profiles')
  || error?.hint?.includes('guest_revenue_predictions')
  || error?.hint?.includes('guest_interest_affinities')
  || error?.hint?.includes('revenue_ai_events')
  || error?.hint?.includes('experience_booking_requests')
);

const formatActivity = ({ type, title, description, createdAt, tone = 'slate', href = null }) => ({
  type,
  title,
  description,
  createdAt,
  tone,
  href
});

const buildActivityFeed = ({
  aiLogs,
  tickets,
  conversations,
  scheduledMessages,
  upsells,
  offers = [],
  guestMemory,
  conversions = []
}) => [
  ...conversations.map((item) => formatActivity({
    type: 'whatsapp',
    title: 'New WhatsApp activity',
    description: item.status ? `Conversation ${item.status}` : 'Guest conversation updated',
    createdAt: item.last_message_at || item.created_at,
    tone: 'emerald',
    href: `/dashboard/inbox?conversationId=${item.id}`
  })),
  ...tickets.map((item) => formatActivity({
    type: 'ticket',
    title: item.title || 'Ticket created',
    description: `${item.category || 'ticket'} - ${item.priority || 'normal'}`,
    createdAt: item.created_at,
    tone: item.priority === 'urgent' ? 'red' : 'amber',
    href: `/dashboard/tickets/${item.id}`
  })),
  ...upsells.map((item) => formatActivity({
    type: 'upsell',
    title: item.title || 'Upsell detected',
    description: `${item.upsell_type || 'opportunity'} - ${Math.round(Number(item.confidence || 0) * 100)}% confidence`,
    createdAt: item.created_at,
    tone: 'violet',
    href: '/dashboard/upsells'
  })),
  ...scheduledMessages.map((item) => formatActivity({
    type: 'automation',
    title: 'Automation scheduled',
    description: item.automation_type || 'scheduled message',
    createdAt: item.created_at || item.scheduled_for,
    tone: 'sky',
    href: '/dashboard/automations'
  })),
  ...offers.map((item) => formatActivity({
    type: 'revenue',
    title: item.metadata?.experience_intelligence
      ? 'Experience opportunity detected'
      : item.status === 'accepted' ? 'AI offer accepted' : item.status === 'sent' ? 'AI offer sent' : 'AI revenue opportunity',
    description: `${item.offer_type} - ${new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency || 'EUR', maximumFractionDigits: 0 }).format(Number(item.suggested_price || 0))}`,
    createdAt: item.updated_at || item.created_at,
    tone: item.status === 'accepted' ? 'emerald' : item.status === 'rejected' ? 'red' : 'violet',
    href: '/dashboard/inbox'
  })),
  ...guestMemory.map((item) => formatActivity({
    type: 'memory',
    title: 'Guest memory detected',
    description: `${item.memory_key}: ${item.memory_value}`,
    createdAt: item.updated_at || item.created_at,
    tone: 'emerald',
    href: '/dashboard/guest-memory'
  })),
  ...conversions.map((item) => formatActivity({
    type: 'revenue',
    title: item.status === 'accepted' ? 'Revenue generated' : item.status === 'sent' ? 'Upsell offer sent' : 'Upsell conversion updated',
    description: `${item.upsell_type} - ${new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency || 'EUR', maximumFractionDigits: 0 }).format(Number(item.estimated_amount || 0))}`,
    createdAt: item.updated_at || item.accepted_at || item.offer_sent_at || item.created_at,
    tone: item.status === 'accepted' ? 'emerald' : item.status === 'rejected' ? 'red' : 'sky',
    href: '/dashboard/upsells'
  })),
  ...aiLogs.map((item) => formatActivity({
    type: 'ai',
    title: item.ticket_created ? 'AI created a ticket' : 'AI response generated',
    description: `${item.detected_intent || 'unknown'} - ${item.detected_language || 'auto'}`,
    createdAt: item.created_at,
    tone: item.emergency ? 'red' : 'slate',
    href: '/dashboard/ai-logs'
  }))
]
  .filter((item) => item.createdAt)
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, 12);

const countBy = (rows, field) => rows.reduce((acc, row) => {
  const key = row[field] || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const topEntries = (counts, limit = 4) => Object.entries(counts)
  .filter(([key]) => key && key !== 'unknown')
  .sort((a, b) => b[1] - a[1])
  .slice(0, limit)
  .map(([label, count]) => ({ label, count }));

const buildGuestSignals = ({
  profiles = [],
  guests = [],
  guestMemory = [],
  upsells = [],
  conversions = [],
  tickets = [],
  conversations = []
}) => {
  const guestsById = new Map(guests.map((guest) => [guest.id, guest]));

  if (profiles.length) {
    return profiles.slice(0, 6).map((profile) => {
      const guest = guestsById.get(profile.guest_id);

      return {
        guestId: profile.guest_id,
        label: guest?.phone_number || profile.guest_id,
        room: guest?.current_room || null,
        score: Math.round(Number(profile.guest_score || 0)),
        revenue: Number(profile.revenue_generated || 0),
        risk: Number(profile.operational_risk_score || 0),
        tags: profile.metadata?.tags || [],
        href: `/dashboard/guest-memory/${profile.guest_id}`
      };
    });
  }

  const guestIds = [...new Set([
    ...guestMemory.map((item) => item.guest_id),
    ...upsells.map((item) => item.guest_id),
    ...conversions.map((item) => item.guest_id),
    ...tickets.map((item) => item.guest_id),
    ...conversations.map((item) => item.guest_id)
  ].filter(Boolean))];

  return guestIds.map((guestId) => {
    const guest = guestsById.get(guestId);
    const memories = guestMemory.filter((item) => item.guest_id === guestId);
    const guestUpsells = upsells.filter((item) => item.guest_id === guestId);
    const guestConversions = conversions.filter((item) => item.guest_id === guestId);
    const guestTickets = tickets.filter((item) => item.guest_id === guestId);
    const acceptedRevenue = guestConversions
      .filter((item) => item.status === 'accepted')
      .reduce((total, item) => total + Number(item.estimated_amount || 0), 0);
    const risk = Math.min(100, guestTickets.filter((item) => item.priority === 'urgent' || item.category === 'complaint' || item.category === 'emergency').length * 28);
    const memoryKeys = new Set(memories.map((item) => item.memory_key));
    const tags = [
      acceptedRevenue >= 150 ? 'high_spender' : null,
      guestUpsells.some((item) => ['room_upgrade', 'late_checkout'].includes(item.upsell_type)) ? 'upgrade_ready' : null,
      memoryKeys.has('traveling_with_partner') || memoryKeys.has('anniversary_trip') ? 'romantic' : null,
      risk >= 50 ? 'needs_attention' : null,
      conversations.filter((item) => item.guest_id === guestId).length > 1 ? 'repeat_guest' : null
    ].filter(Boolean);

    return {
      guestId,
      label: guest?.phone_number || guestId,
      room: guest?.current_room || null,
      score: Math.round(Math.max(0, Math.min(100, 55 + memories.length * 3 + guestUpsells.length * 5 + acceptedRevenue / 10 - risk * 0.3))),
      revenue: acceptedRevenue,
      risk,
      tags,
      href: `/dashboard/guest-memory/${guestId}`
    };
  })
    .sort((a, b) => (b.score + b.revenue / 10 + b.risk) - (a.score + a.revenue / 10 + a.risk))
    .slice(0, 6);
};

const buildInsights = ({ guestMemory, upsells, aiLogs, conversations, scheduledMessages = [] }) => {
  const memoryKeys = new Set(guestMemory.map((item) => item.memory_key));
  const languageCounts = countBy(aiLogs, 'detected_language');
  const topLanguage = Object.entries(languageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'es';
  const lowConfidence = aiLogs.filter((item) => Number(item.confidence_score) < 0.65).length;
  const romanticUpsells = upsells.filter((item) => item.upsell_type === 'romantic_package').length;
  const automationCounts = countBy(scheduledMessages, 'automation_type');
  const topAutomation = Object.entries(automationCounts).sort((a, b) => b[1] - a[1])[0];

  return [
    {
      title: 'Automation opportunity',
      description: topAutomation
        ? `${topAutomation[0].replace(/_/g, ' ')} is the strongest proactive workflow right now.`
        : 'No proactive automations scheduled yet today.',
      tone: topAutomation ? 'emerald' : 'slate'
    },
    {
      title: 'Upgrade-ready guests',
      description: `${upsells.filter((item) => ['room_upgrade', 'late_checkout'].includes(item.upsell_type)).length} guests show signals for paid upgrades.`,
      tone: 'emerald'
    },
    {
      title: 'Romantic stay signals',
      description: romanticUpsells > 0 || memoryKeys.has('anniversary_trip')
        ? `${romanticUpsells || 1} romantic opportunity detected for reception follow-up.`
        : 'No strong romantic package signal yet today.',
      tone: 'violet'
    },
    {
      title: 'Operational risk',
      description: lowConfidence > 0
        ? `${lowConfidence} AI decisions should be reviewed by reception.`
        : 'No low-confidence AI decisions in the latest activity.',
      tone: lowConfidence > 0 ? 'amber' : 'slate'
    },
    {
      title: 'Language trend',
      description: `Predominant detected language is ${String(topLanguage).toUpperCase()} across recent AI logs.`,
      tone: 'sky'
    },
    {
      title: 'Guest demand',
      description: `${conversations.length} recent conversations are feeding operational intelligence.`,
      tone: 'slate'
    }
  ];
};

export async function GET(request) {
  try {
    const { supabase, hotel, fallback, role, permissions = [] } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'dashboard')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const hotelId = hotel?.id || null;
    const today = startOfTodayIso();
    const todayDate = todayKey();

    const [
      conversationsToday,
      openTickets,
      urgentTickets,
      aiResponses,
      upsellsDetected,
      automationsScheduled,
      allTickets,
      recentConversations,
      recentAiLogs,
      recentScheduledMessages,
      recentUpsells,
      recentConversions,
      recentOffers,
      recentConversationStates,
      recentGuestMemory,
      recentGuestProfiles,
      reservationsToday,
      activeGuestsRows,
      pmsConnections,
      onboardingRows,
      localKnowledgeRows,
      roomStatusRows,
      latestOccupancyRows,
      guestStayContextRows,
      guestIntelligenceProfiles,
      guestRevenuePredictions,
      guestInterestAffinities,
      revenueAiEvents,
      experienceBookingRequests
    ] = await Promise.all([
      safeCount(withHotel(
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        hotelId
      ).gte('created_at', today)),
      safeCount(withHotel(
        supabase.from('tickets').select('id', { count: 'exact', head: true }),
        hotelId
      ).in('status', ['open', 'in_progress'])),
      safeCount(withHotel(
        supabase.from('tickets').select('id', { count: 'exact', head: true }),
        hotelId
      ).eq('priority', 'urgent').in('status', ['open', 'in_progress'])),
      safeCount(withHotel(
        supabase.from('ai_logs').select('id', { count: 'exact', head: true }),
        hotelId
      ).gte('created_at', today)),
      safeCount(withHotel(
        supabase.from('ai_upsells').select('id', { count: 'exact', head: true }),
        hotelId
      ).gte('created_at', today)),
      safeCount(withHotel(
        supabase.from('scheduled_messages').select('id', { count: 'exact', head: true }),
        hotelId
      ).eq('status', 'scheduled')),
      safeRows(withHotel(
        supabase.from('tickets').select('id, hotel_id, guest_id, room_number, category, priority, status, title, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('conversations').select('id, status, last_message_at, created_at, guest_id'),
        hotelId
      ).order('last_message_at', { ascending: false, nullsFirst: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('ai_logs').select('id, detected_language, detected_intent, confidence_score, ticket_created, emergency, openai_concierge_used, openai_concierge_fallback, ai_satisfaction_estimate, ai_resolution_estimate, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('scheduled_messages').select('id, automation_type, status, scheduled_for, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(20)),
      safeRows(withHotel(
        supabase.from('ai_upsells').select('id, guest_id, upsell_type, title, confidence, status, accepted, rejected, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('upsell_conversions').select('id, guest_id, upsell_id, upsell_type, status, estimated_amount, currency, offer_sent_at, accepted_at, created_at, updated_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('ai_offers').select('id, guest_id, conversation_id, offer_type, suggested_price, currency, status, confidence, ai_reason, metadata, created_at, updated_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('conversation_ai_state').select('id, conversation_id, current_intent, previous_intent, intent_confidence, last_offer_type, last_offer_sent_at, sentiment, escalation_level, openai_enhanced, state_metadata, updated_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(100)),
      safeRows(withHotel(
        supabase.from('guest_memory').select('id, guest_id, memory_key, memory_value, memory_type, updated_at, created_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('guest_ai_profiles').select('id, guest_id, guest_score, revenue_generated, operational_risk_score, metadata, updated_at'),
        hotelId
      ).order('guest_score', { ascending: false }).limit(10)),
      safeRows(withHotel(
        supabase.from('reservations').select('id, arrival_date, departure_date, status'),
        hotelId
      ).or(`arrival_date.eq.${todayDate},departure_date.eq.${todayDate}`).limit(50)),
      safeRows(withHotel(
        supabase.from('conversations').select('guest_id'),
        hotelId
      ).not('guest_id', 'is', null).limit(500)),
      safeRows(withHotel(
        supabase.from('hotel_pms_connections').select('id, provider, enabled, sync_status, last_sync_at, last_sync_error, metadata, webhook_url, webhook_enabled, webhook_status, last_webhook_at, last_webhook_error, updated_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(10))
      ,
      hotelId
        ? safeRows(
          supabase.from('hotel_onboarding_state').select('*').eq('hotel_id', hotelId).limit(1)
        )
        : [],
      safeRows(withHotel(
        supabase.from('local_knowledge_items').select('id, title, category, featured, active, priority, tags, audience_tags, recommendation_contexts, weather_tags, updated_at'),
        hotelId
      ).order('featured', { ascending: false }).order('priority', { ascending: false }).limit(30))
      ,
      safeRows(withHotel(
        supabase.from('room_status_snapshots').select('*'),
        hotelId
      ).order('last_updated_at', { ascending: false }).limit(500)),
      safeRows(withHotel(
        supabase.from('hotel_occupancy_snapshots').select('*'),
        hotelId
      ).order('created_at', { ascending: false }).limit(1)),
      safeRows(withHotel(
        supabase.from('guest_stay_context').select('*'),
        hotelId
      ).in('stay_phase', ['in_house', 'pre_checkout']).order('last_updated_at', { ascending: false }).limit(500))
      ,
      safeRows(withHotel(
        supabase.from('guest_intelligence_profiles').select('*'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(500)),
      safeRows(withHotel(
        supabase.from('guest_revenue_predictions').select('*'),
        hotelId
      ).order('generated_at', { ascending: false }).limit(500)),
      safeRows(withHotel(
        supabase.from('guest_interest_affinities').select('*'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(500)),
      safeRows(withHotel(
        supabase.from('revenue_ai_events').select('*'),
        hotelId
      ).order('created_at', { ascending: false }).limit(500)),
      safeRows(withHotel(
        supabase.from('experience_booking_requests').select('id, conversation_id, experience_title, provider_source, partner_name, status, lead_status, estimated_revenue, commission_estimate, metadata, created_at, updated_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(200))
    ]);

    const activeGuests = new Set(activeGuestsRows.map((row) => row.guest_id).filter(Boolean)).size;
    const upsellTypeCounts = countBy(recentUpsells, 'upsell_type');
    const acceptedConversions = recentConversions.filter((item) => item.status === 'accepted');
    const conversionTypeCounts = countBy(recentConversions, 'upsell_type');
    const revenueByType = recentConversions.reduce((acc, item) => {
      const key = item.upsell_type || 'unknown';
      acc[key] = (acc[key] || 0) + Number(item.estimated_amount || 0);
      return acc;
    }, {});
    const estimatedAiRevenue = recentConversions.length > 0
      ? recentConversions.reduce((total, item) => total + Number(item.estimated_amount || 0), 0)
      : recentUpsells.reduce((total, item) => (
        total + (revenueByUpsellType[item.upsell_type] || 40)
      ), 0);
    const acceptedRevenue = acceptedConversions.reduce((total, item) => (
      total + Number(item.estimated_amount || 0)
    ), 0);
    const acceptedUpsells = acceptedConversions.length || recentUpsells.filter((item) => item.accepted || item.status === 'accepted').length;
    const conversionRate = recentConversions.length > 0
      ? Math.round((acceptedConversions.length / recentConversions.length) * 100)
      : recentUpsells.length > 0
        ? Math.round((acceptedUpsells / recentUpsells.length) * 100)
        : 0;
    const topUpsellCategory = Object.entries(revenueByType).sort((a, b) => b[1] - a[1])[0]?.[0]
      || Object.entries(upsellTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      || null;
    const completedTickets = allTickets.filter((item) => item.status === 'completed').length;
    const guestSatisfactionScore = Math.max(78, Math.min(98, 94 - urgentTickets * 2 + completedTickets));
    const arrivalsToday = reservationsToday.filter((item) => item.arrival_date === todayDate).length;
    const departuresToday = reservationsToday.filter((item) => item.departure_date === todayDate).length;
    const signalGuestIds = [...new Set([
      ...recentGuestProfiles.map((item) => item.guest_id),
      ...recentGuestMemory.map((item) => item.guest_id),
      ...recentUpsells.map((item) => item.guest_id),
      ...recentConversions.map((item) => item.guest_id),
      ...recentOffers.map((item) => item.guest_id),
      ...allTickets.map((item) => item.guest_id),
      ...recentConversations.map((item) => item.guest_id)
    ].filter(Boolean))].slice(0, 50);
    const signalGuests = signalGuestIds.length
      ? await safeRows(
        supabase.from('guests').select('id, phone_number, current_room, preferred_language').in('id', signalGuestIds),
        'guests'
      )
      : [];
    const guestSignals = buildGuestSignals({
      profiles: recentGuestProfiles,
      guests: signalGuests,
      guestMemory: recentGuestMemory,
      upsells: recentUpsells,
      conversions: recentConversions,
      tickets: allTickets,
      conversations: recentConversations
    });
    const activeOffers = recentOffers.filter((item) => ['suggested', 'sent'].includes(item.status));
    const acceptedOffers = recentOffers.filter((item) => item.status === 'accepted');
    const offerRevenuePotential = activeOffers.reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const offerRevenueGenerated = acceptedOffers.reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const offerTypeCounts = countBy(recentOffers, 'offer_type');
    const topOfferCategory = Object.entries(offerTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const contextualOffers = recentOffers.filter((item) => item.metadata?.contextual_revenue);
    const contextualAccepted = contextualOffers.filter((item) => item.status === 'accepted');
    const contextualPotentialRevenue = contextualOffers
      .filter((item) => ['suggested', 'sent'].includes(item.status))
      .reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const contextualGeneratedRevenue = contextualAccepted.reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const contextualByContext = contextualOffers.reduce((acc, item) => {
      const key = item.metadata?.detected_context || 'contextual';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const experienceOffers = recentOffers.filter((item) => item.metadata?.experience_intelligence);
    const experienceAccepted = experienceOffers.filter((item) => item.status === 'accepted');
    const experiencePotentialRevenue = experienceOffers
      .filter((item) => ['suggested', 'sent'].includes(item.status))
      .reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const experienceGeneratedRevenue = experienceAccepted.reduce((total, item) => total + Number(item.suggested_price || 0), 0);
    const experienceByCategory = experienceOffers.reduce((acc, item) => {
      const key = item.metadata?.experience_category || item.metadata?.detected_context || 'experience';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const activeEscalations = recentConversationStates.filter((item) => ['reception_required', 'manager_required', 'urgent'].includes(item.escalation_level));
    const humanTakeoverStates = recentConversationStates.filter((item) => ['human_takeover', 'ai_paused', 'escalation_lock'].includes(item.state_metadata?.conversation_ai_mode));
    const unresolvedComplaints = recentConversationStates.filter((item) => String(item.current_intent || '').startsWith('complaint_'));
    const repeatedFrustrations = recentConversationStates.filter((item) => item.sentiment === 'negative');
    const highValueConversations = recentConversationStates.filter((item) => ['room_upgrade_interest', 'late_checkout_interest', 'airport_transfer_interest'].includes(item.current_intent));
    const openAiLogs = recentAiLogs.filter((item) => item.openai_concierge_used);
    const openAiConfidenceValues = recentAiLogs.map((item) => Number(item.confidence_score)).filter(Number.isFinite);
    const satisfactionValues = recentAiLogs.map((item) => Number(item.ai_satisfaction_estimate)).filter(Number.isFinite);
    const latestOccupancy = latestOccupancyRows[0] || null;
    const operationalContext = {
      occupancyToday: latestOccupancy?.occupancy_percent ?? null,
      occupiedRooms: latestOccupancy?.occupied_rooms || 0,
      availableRooms: latestOccupancy?.available_rooms || 0,
      arrivalsToday: latestOccupancy?.arrivals_today ?? arrivalsToday,
      departuresToday: latestOccupancy?.departures_today ?? departuresToday,
      stayoversToday: latestOccupancy?.stayovers_today || 0,
      roomsReady: roomStatusRows.filter((room) => ['clean', 'inspected'].includes(room.housekeeping_status)).length,
      roomsDirty: roomStatusRows.filter((room) => room.housekeeping_status === 'dirty').length,
      roomsMaintenance: roomStatusRows.filter((room) => ['maintenance', 'out_of_order'].includes(room.maintenance_status)).length,
      vipGuests: guestStayContextRows.filter((context) => Number(context.vip_score || 0) >= 70).length,
      upgradeOpportunities: guestStayContextRows.filter((context) => context.upgrade_eligible).length,
      lateCheckoutEligible: guestStayContextRows.filter((context) => context.late_checkout_eligible).length,
      health: latestOccupancyRows.length || roomStatusRows.length || guestStayContextRows.length ? 'active' : 'fallback',
      lastUpdatedAt: latestOccupancy?.created_at || roomStatusRows[0]?.last_updated_at || guestStayContextRows[0]?.last_updated_at || null
    };
    const profileCounts = guestIntelligenceProfiles.reduce((acc, profile) => {
      const key = profile.profile_type || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topProfile = Object.entries(profileCounts).sort((a, b) => b[1] - a[1])[0] || null;
    const highRevenueGuests = guestIntelligenceProfiles.filter((profile) => Number(profile.revenue_potential_score || 0) >= 70).length;
    const reviewRiskGuests = guestIntelligenceProfiles.filter((profile) => Number(profile.review_risk_score || 0) >= 60).length;
    const avgConversionProbability = guestRevenuePredictions.length
      ? Math.round((guestRevenuePredictions.reduce((total, item) => total + Number(item.conversion_probability || 0), 0) / guestRevenuePredictions.length) * 100)
      : 0;
    const estimatedRevenueAi = guestRevenuePredictions.reduce((total, item) => total + Number(item.estimated_revenue || 0), 0);
    const topAffinity = Object.entries(guestInterestAffinities.reduce((acc, row) => {
      [
        'spa_affinity',
        'wellness_affinity',
        'adventure_affinity',
        'restaurant_affinity',
        'luxury_affinity',
        'transfer_affinity',
        'family_affinity',
        'nightlife_affinity'
      ].forEach((key) => {
        acc[key] = (acc[key] || 0) + Number(row[key] || 0);
      });
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0] || null;
    const revenueAiInsights = [
      highRevenueGuests ? `${highRevenueGuests} guests show high revenue potential` : null,
      reviewRiskGuests ? `${reviewRiskGuests} guests need review-risk protection before upsells` : null,
      topProfile ? `${topProfile[0].replaceAll('_', ' ')} is the top guest profile` : null,
      topAffinity ? `${topAffinity[0].replace('_affinity', '').replaceAll('_', ' ')} is the strongest affinity` : null,
      avgConversionProbability ? `Average predicted conversion is ${avgConversionProbability}%` : null
    ].filter(Boolean);
    const arrivalCompleteStatuses = new Set(['checked_in', 'in_house', 'inhouse', 'arrived', 'active']);
    const departureCompleteStatuses = new Set(['checked_out', 'completed', 'cancelled', 'no_show', 'departed']);
    const normalizeStatus = (status) => String(status || '').toLowerCase();
    const pendingCheckins = reservationsToday.filter((item) => (
      item.arrival_date === todayDate && !arrivalCompleteStatuses.has(normalizeStatus(item.status))
    )).length;
    const pendingCheckouts = reservationsToday.filter((item) => (
      item.departure_date === todayDate && !departureCompleteStatuses.has(normalizeStatus(item.status))
    )).length;
    const roomsWithIssues = operationalContext.roomsDirty + operationalContext.roomsMaintenance;
    const guestAlertCount = activeEscalations.length + repeatedFrustrations.length + urgentTickets;
    const languageCounts = [
      ...recentAiLogs.map((item) => item.detected_language),
      ...guestIntelligenceProfiles.map((item) => item.language),
      ...guestStayContextRows.map((item) => item.language),
      ...signalGuests.map((item) => item.preferred_language)
    ].filter(Boolean).reduce((acc, language) => {
      const key = String(language).toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topLanguages = topEntries(languageCounts, 5);
    const primaryPmsConnection = pmsConnections.find((item) => item.enabled) || pmsConnections[0] || null;
    const reservationsSynced = pmsConnections.reduce((total, item) => (
      total + Number(item.metadata?.last_sync_summary?.synced || item.metadata?.last_sync_summary?.fetched || 0)
    ), 0);
    const invalidPhones = signalGuests.length
      ? signalGuests.filter((guest) => {
        const digits = String(guest.phone_number || '').replace(/\D/g, '');
        return guest.phone_number && digits.length < 7;
      }).length
      : null;
    const guestsWithoutLanguage = [
      ...guestStayContextRows.filter((context) => !context.language),
      ...signalGuests.filter((guest) => !guest.preferred_language)
    ].length;
    const reservationsWithoutRoom = guestStayContextRows.filter((context) => !context.room_number).length;
    const pmsWarnings = [
      pmsConnections.some((item) => item.last_sync_error) ? 'PMS sync errors detected' : null,
      guestsWithoutLanguage ? `${guestsWithoutLanguage} guests without language` : null,
      reservationsWithoutRoom ? `${reservationsWithoutRoom} active stays without room` : null,
      invalidPhones ? `${invalidPhones} guest phones need review` : null,
      primaryPmsConnection?.webhook_enabled && primaryPmsConnection?.webhook_status && primaryPmsConnection.webhook_status !== 'healthy'
        ? 'PMS webhook needs review'
        : null
    ].filter(Boolean);
    const sentimentValues = guestIntelligenceProfiles
      .map((profile) => Number(profile.sentiment_score))
      .filter(Number.isFinite);
    const avgSentimentScore = sentimentValues.length
      ? Math.round(sentimentValues.reduce((total, value) => total + value, 0) / sentimentValues.length)
      : null;
    const sentimentLabel = repeatedFrustrations.length || reviewRiskGuests
      ? 'Needs attention'
      : avgSentimentScore === null
        ? 'Not enough data'
        : avgSentimentScore >= 70
          ? 'Positive'
          : avgSentimentScore >= 45
            ? 'Stable'
            : 'Sensitive';
    const importantProfileOrder = ['family_guest', 'business_guest', 'wellness_traveler', 'luxury_guest', 'experience_seeker'];
    const topProfiles = importantProfileOrder.map((type) => ({
      type,
      count: profileCounts[type] || 0
    })).filter((item) => item.count > 0);
    const hotelIntelligence = {
      occupancyCurrent: operationalContext.occupancyToday,
      occupiedRooms: operationalContext.occupiedRooms,
      freeRooms: operationalContext.availableRooms,
      roomsWithIssues,
      arrivalsToday: operationalContext.arrivalsToday,
      departuresToday: operationalContext.departuresToday,
      pendingCheckins,
      pendingCheckouts,
      reservationsNeedingAttention: guestAlertCount + pendingCheckins + roomsWithIssues,
      inHouseGuests: guestStayContextRows.filter((context) => context.stay_phase === 'in_house').length || activeGuests,
      vipGuests: operationalContext.vipGuests,
      guestsWithAlerts: guestAlertCount,
      topLanguages,
      lastUpdatedAt: operationalContext.lastUpdatedAt,
      dataState: operationalContext.health
    };
    const pmsSnapshot = {
      connected: pmsConnections.some((item) => item.enabled),
      providerName: primaryPmsConnection?.provider || null,
      lastSyncAt: primaryPmsConnection?.last_sync_at || null,
      reservationsSynced,
      roomsSynced: roomStatusRows.length,
      errors: pmsConnections.filter((item) => item.last_sync_error).length,
      warnings: pmsWarnings,
      invalidPhones,
      guestsWithoutLanguage,
      reservationsWithoutRoom,
      webhookStatus: primaryPmsConnection?.webhook_status || (primaryPmsConnection?.webhook_enabled ? 'unknown' : 'not_configured'),
      webhookEnabled: Boolean(primaryPmsConnection?.webhook_enabled),
      dataCompleteness: {
        roomsAvailable: roomStatusRows.length > 0,
        occupancyAvailable: Boolean(latestOccupancy),
        guestStayContextAvailable: guestStayContextRows.length > 0
      }
    };
    const guestIntelligence = {
      sentimentLabel,
      sentimentScore: avgSentimentScore,
      vipGuests: operationalContext.vipGuests,
      topProfiles,
      reviewRiskGuests,
      highRevenueGuests,
      topLanguages,
      frustratedConversations: repeatedFrustrations.length,
      guestsNeedingAttention: activeEscalations.length + repeatedFrustrations.length,
      averageConversionProbability: avgConversionProbability,
      topAffinity: topAffinity ? { type: topAffinity[0], score: Math.round(topAffinity[1]) } : null
    };

    return NextResponse.json({
      hotel,
      role,
      permissions,
      fallback,
      refreshedAt: new Date().toISOString(),
      kpis: {
        conversationsToday,
        openTickets,
        activeGuests,
        aiResponses,
        upsellsDetected,
        automationsScheduled,
        estimatedAiRevenue: acceptedRevenue || estimatedAiRevenue,
        guestSatisfactionScore,
        urgentTickets
      },
      summary: {
        activeConversations: recentConversations.filter((item) => item.status === 'active').length,
        upsellsDetected: recentUpsells.length,
        urgentTickets,
        experienceRequests: experienceBookingRequests.length,
        providerEmailFailures: experienceBookingRequests.filter((item) => ['failed', 'failed_provider_email'].includes(item.lead_status || item.metadata?.provider_email_status || item.status)).length,
        humanTakeovers: humanTakeoverStates.length,
        averageAiConfidence: openAiConfidenceValues.length
          ? Math.round((openAiConfidenceValues.reduce((total, value) => total + value, 0) / openAiConfidenceValues.length) * 100)
          : 0
      },
      operations: {
        reception: {
          openTickets: allTickets.filter((item) => ['transport', 'restaurant', 'spa', 'room_service', 'reception', 'complaint', 'emergency'].includes(item.category) && item.status !== 'completed').length,
          arrivalsToday,
          departuresToday
        },
        housekeeping: {
          openTickets: allTickets.filter((item) => item.category === 'housekeeping' && item.status !== 'completed').length,
          urgentRooms: allTickets.filter((item) => item.category === 'housekeeping' && item.priority === 'urgent').map((item) => item.room_number).filter(Boolean).slice(0, 6)
        },
        maintenance: {
          openTickets: allTickets.filter((item) => ['maintenance', 'emergency'].includes(item.category) && item.status !== 'completed').length,
          urgentTickets: allTickets.filter((item) => ['maintenance', 'emergency'].includes(item.category) && item.priority === 'urgent').length
        }
      },
      operationalContext,
      hotelIntelligence,
      pmsSnapshot,
      guestIntelligence,
      guestIntelligenceInsights: {
        profiles: guestIntelligenceProfiles.length,
        highRevenueGuests,
        reviewRiskGuests,
        topProfile: topProfile ? { type: topProfile[0], count: topProfile[1] } : null,
        topAffinity: topAffinity ? { type: topAffinity[0], score: Math.round(topAffinity[1]) } : null,
        estimatedRevenueAi,
        avgConversionProbability,
        revenueAiEvents: revenueAiEvents.length,
        insights: revenueAiInsights
      },
      revenue: {
        totalUpsells: recentUpsells.length,
        byType: {
          romantic_package: conversionTypeCounts.romantic_package || upsellTypeCounts.romantic_package || 0,
          late_checkout: conversionTypeCounts.late_checkout || upsellTypeCounts.late_checkout || 0,
          airport_transfer: conversionTypeCounts.airport_transfer || upsellTypeCounts.airport_transfer || 0,
          room_upgrade: conversionTypeCounts.room_upgrade || upsellTypeCounts.room_upgrade || 0,
          spa: conversionTypeCounts.spa || upsellTypeCounts.spa || 0,
          dinner: conversionTypeCounts.dinner || upsellTypeCounts.dinner || 0,
          breakfast_upgrade: conversionTypeCounts.breakfast_upgrade || upsellTypeCounts.breakfast_upgrade || 0
        },
        revenueByType,
        accepted: acceptedUpsells,
        acceptedRevenue,
        estimatedRevenue: estimatedAiRevenue,
        revenueThisMonth: acceptedRevenue,
        conversionRate,
        topUpsellCategory
      },
      conciergeRevenue: {
        activeOpportunities: activeOffers.length,
        potentialRevenue: offerRevenuePotential,
        acceptedOffers: acceptedOffers.length,
        generatedRevenue: offerRevenueGenerated,
        averageOfferValue: recentOffers.length
          ? Math.round(recentOffers.reduce((total, item) => total + Number(item.suggested_price || 0), 0) / recentOffers.length)
          : 0,
        conversionRate: recentOffers.length
          ? Math.round((acceptedOffers.length / recentOffers.length) * 100)
          : 0,
        topCategory: topOfferCategory,
        byType: offerTypeCounts,
        recentOffers: recentOffers.slice(0, 6)
      },
      contextualRevenue: {
        activeOpportunities: contextualOffers.filter((item) => ['suggested', 'sent'].includes(item.status)).length,
        accepted: contextualAccepted.length,
        potentialRevenue: contextualPotentialRevenue,
        generatedRevenue: contextualGeneratedRevenue,
        byContext: contextualByContext,
        averageConfidence: contextualOffers.length
          ? Math.round((contextualOffers.reduce((total, item) => total + Number(item.confidence || 0), 0) / contextualOffers.length) * 100)
          : 0,
        recent: contextualOffers.slice(0, 6).map((item) => ({
          id: item.id,
          offerType: item.offer_type,
          status: item.status,
          suggestedPrice: item.suggested_price,
          currency: item.currency,
          confidence: item.confidence,
          reason: item.ai_reason,
          detectedContext: item.metadata?.detected_context || null,
          timingReason: item.metadata?.revenue_timing_reason || null,
          fatigueScore: item.metadata?.fatigue_score ?? null,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }))
      },
      experienceIntelligence: {
        activeOpportunities: experienceOffers.filter((item) => ['suggested', 'sent'].includes(item.status)).length,
        accepted: experienceAccepted.length,
        potentialRevenue: experiencePotentialRevenue,
        generatedRevenue: experienceGeneratedRevenue,
        byCategory: experienceByCategory,
        averageConfidence: experienceOffers.length
          ? Math.round((experienceOffers.reduce((total, item) => total + Number(item.confidence || 0), 0) / experienceOffers.length) * 100)
          : 0,
        recent: experienceOffers.slice(0, 6).map((item) => ({
          id: item.id,
          offerType: item.offer_type,
          status: item.status,
          suggestedPrice: item.suggested_price,
          currency: item.currency,
          confidence: item.confidence,
          reason: item.ai_reason,
          experienceCategory: item.metadata?.experience_category || null,
          destinationPersonality: item.metadata?.destination_personality || null,
          timingReason: item.metadata?.revenue_timing_reason || null,
          fatigueScore: item.metadata?.fatigue_score ?? null,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }))
      },
      localIntelligence: {
        total: localKnowledgeRows.length,
        active: localKnowledgeRows.filter((item) => item.active !== false).length,
        featured: localKnowledgeRows.filter((item) => item.featured).length,
        indoorReady: localKnowledgeRows.filter((item) => item.weather_tags?.includes('indoor') || item.weather_tags?.includes('rainy')).length,
        byCategory: countBy(localKnowledgeRows, 'category'),
        topRecommendations: localKnowledgeRows.slice(0, 6).map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          featured: item.featured,
          priority: item.priority,
          tags: item.tags || [],
          audienceTags: item.audience_tags || [],
          contexts: item.recommendation_contexts || []
        }))
      },
      conversationIntelligence: {
        activeEscalations: activeEscalations.length,
        humanTakeovers: humanTakeoverStates.length,
        unresolvedComplaints: unresolvedComplaints.length,
        repeatedFrustrations: repeatedFrustrations.length,
        highValueConversations: highValueConversations.length,
        guestsRequiringAttention: activeEscalations.length + repeatedFrustrations.length,
        openAiHandled: openAiLogs.length,
        escalationPrevention: recentConversationStates.filter((item) => item.openai_enhanced && item.escalation_level === 'ai_handled').length,
        aiResolutionRate: recentAiLogs.length
          ? Math.round((recentAiLogs.filter((item) => item.ai_resolution_estimate).length / recentAiLogs.length) * 100)
          : 0,
        aiSatisfactionEstimate: satisfactionValues.length
          ? Math.round(satisfactionValues.reduce((total, value) => total + value, 0) / satisfactionValues.length)
          : 0,
        avgAiConfidence: openAiConfidenceValues.length
          ? Math.round((openAiConfidenceValues.reduce((total, value) => total + value, 0) / openAiConfidenceValues.length) * 100)
          : 0,
        aiRevenueGenerated: offerRevenueGenerated || acceptedRevenue,
        states: recentConversationStates.slice(0, 8)
      },
      experienceBookings: {
        total: experienceBookingRequests.length,
        active: experienceBookingRequests.filter((item) => !['completed', 'cancelled', 'cancelled_by_guest', 'provider_rejected'].includes(item.status)).length,
        pending: experienceBookingRequests.filter((item) => ['guest_interested', 'awaiting_guest_details', 'awaiting_guest_confirmation', 'pending', 'reviewing'].includes(item.status)).length,
        providerRequestsSent: experienceBookingRequests.filter((item) => item.status === 'provider_request_sent' || item.lead_status === 'sent' || item.metadata?.provider_email_status === 'sent').length,
        failedProviderEmails: experienceBookingRequests.filter((item) => item.status === 'failed_provider_email' || item.lead_status === 'failed' || item.metadata?.provider_email_status === 'failed').length,
        estimatedRevenue: experienceBookingRequests.reduce((total, item) => total + Number(item.estimated_revenue || 0), 0),
        recent: experienceBookingRequests.slice(0, 6)
      },
      pmsStatus: {
        connected: pmsConnections.filter((item) => item.enabled).length,
        providers: pmsConnections.map((item) => ({
          provider: item.provider,
          enabled: item.enabled,
          syncStatus: item.sync_status,
          lastSyncAt: item.last_sync_at,
          lastSyncError: item.last_sync_error,
          importedReservations: item.metadata?.last_sync_summary?.synced || 0,
          fetchedReservations: item.metadata?.last_sync_summary?.fetched || 0,
          webhookEnabled: item.webhook_enabled,
          webhookStatus: item.webhook_status,
          webhookUrl: item.webhook_url,
          lastWebhookAt: item.last_webhook_at,
          lastWebhookError: item.last_webhook_error
        })),
        syncErrors: pmsConnections.filter((item) => item.last_sync_error).length
      },
      onboardingHealth: {
        completed: Boolean(onboardingRows[0]?.onboarding_completed),
        currentStep: onboardingRows[0]?.current_step || 'hotel_setup',
        completedSteps: onboardingRows[0]?.completed_steps || [],
        pmsConnected: pmsConnections.some((item) => item.enabled),
        whatsappConfigured: Boolean(hotel?.whatsapp_number),
        aiActive: true,
        reservationsSynced: pmsConnections.some((item) => Number(item.metadata?.last_sync_summary?.synced || 0) > 0),
        kbCompleted: true
      },
      guestSignals,
      activity: buildActivityFeed({
        aiLogs: recentAiLogs,
        tickets: allTickets.slice(0, 12),
        conversations: recentConversations,
        scheduledMessages: recentScheduledMessages,
        upsells: recentUpsells,
        offers: recentOffers,
        guestMemory: recentGuestMemory,
        conversions: recentConversions
      }),
      insights: buildInsights({
        guestMemory: recentGuestMemory,
        upsells: recentUpsells,
        aiLogs: recentAiLogs,
        conversations: recentConversations,
        scheduledMessages: recentScheduledMessages
      })
    });
  } catch (error) {
    console.error('Executive dashboard API failed', error);

    return NextResponse.json({
      error: error.message || 'Executive dashboard failed'
    }, { status: 500 });
  }
}
