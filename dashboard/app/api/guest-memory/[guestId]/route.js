import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import {
  buildDepartmentContext,
  buildTimeline,
  calculateGuestScore,
  detectOperationalRisk,
  detectRevenueSignals,
  formatGuestName,
  generateGuestInsights,
  generateRecommendedActions,
  generateGuestTags,
  getAcceptedRevenue,
  getGuestEmail
} from '@/lib/guest-profile-ai';

const isMissingTable = (error, tableName) => (
  error?.message?.includes(tableName)
  || error?.details?.includes(tableName)
  || error?.hint?.includes(tableName)
);

const safeRows = async (query, tableName, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    if (!isMissingTable(error, tableName)) {
      console.warn(`Guest AI profile ${tableName} unavailable`, error.message);
    }

    return fallback;
  }

  return data || fallback;
};

const safeSingle = async (query, tableName) => {
  const { data, error } = await query;

  if (error) {
    if (!isMissingTable(error, tableName)) {
      console.warn(`Guest AI profile ${tableName} unavailable`, error.message);
    }

    return null;
  }

  return data || null;
};

const formatLanguage = (guest, memories = []) => (
  guest?.preferred_language
  || memories.find((item) => item.memory_key === 'preferred_language')?.memory_value
  || 'es'
);

const getLastStay = (reservations = []) => reservations
  .filter((item) => item.departure_date || item.arrival_date)
  .sort((a, b) => new Date(b.departure_date || b.arrival_date).getTime() - new Date(a.departure_date || a.arrival_date).getTime())[0] || null;

export async function GET(request, { params }) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const { guestId } = await params;

    if (!hotel?.id || !guestId) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const guest = await safeSingle(
      supabase
        .from('guests')
        .select('*')
        .eq('hotel_id', hotel.id)
        .eq('id', guestId)
        .maybeSingle(),
      'guests'
    );

    if (!guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const [
      memories,
      reservations,
      conversations,
      tickets,
      upsells,
      conversions,
      aiLogs,
      persistedProfile,
      persistedTags,
      persistedInsights,
      persistedActions
    ] = await Promise.all([
      safeRows(
        supabase.from('guest_memory').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('updated_at', { ascending: false }),
        'guest_memory'
      ),
      safeRows(
        supabase.from('reservations').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('arrival_date', { ascending: false }),
        'reservations'
      ),
      safeRows(
        supabase.from('conversations').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('last_message_at', { ascending: false }),
        'conversations'
      ),
      safeRows(
        supabase.from('tickets').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('created_at', { ascending: false }),
        'tickets'
      ),
      safeRows(
        supabase.from('ai_upsells').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('created_at', { ascending: false }),
        'ai_upsells'
      ),
      safeRows(
        supabase.from('upsell_conversions').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('updated_at', { ascending: false }),
        'upsell_conversions'
      ),
      safeRows(
        supabase.from('ai_logs').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('created_at', { ascending: false }).limit(100),
        'ai_logs'
      ),
      safeSingle(
        supabase.from('guest_ai_profiles').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).maybeSingle(),
        'guest_ai_profiles'
      ),
      safeRows(
        supabase.from('guest_ai_tags').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('updated_at', { ascending: false }),
        'guest_ai_tags'
      ),
      safeRows(
        supabase.from('guest_ai_insights').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).eq('is_active', true).order('updated_at', { ascending: false }),
        'guest_ai_insights'
      ),
      safeRows(
        supabase.from('guest_ai_actions').select('*').eq('hotel_id', hotel.id).eq('guest_id', guestId).order('updated_at', { ascending: false }),
        'guest_ai_actions'
      )
    ]);

    const conversationIds = conversations.map((item) => item.id).filter(Boolean);
    const reservationIds = reservations.map((item) => item.id).filter(Boolean);

    const [messages, scheduledMessages] = await Promise.all([
      conversationIds.length
        ? safeRows(
          supabase.from('messages').select('*').in('conversation_id', conversationIds).order('created_at', { ascending: false }).limit(200),
          'messages'
        )
        : [],
      reservationIds.length
        ? safeRows(
          supabase.from('scheduled_messages').select('*').in('reservation_id', reservationIds).order('scheduled_for', { ascending: false }).limit(100),
          'scheduled_messages'
        )
        : []
    ]);

    const computedTags = generateGuestTags({
      memories,
      reservations,
      tickets,
      upsells,
      conversions,
      messages
    });
    const persistedTagNames = new Set((persistedTags || []).map((item) => item.tag));
    const tags = [
      ...(persistedTags || []).map((item) => ({ ...item, source: item.source || 'persisted' })),
      ...computedTags.filter((item) => !persistedTagNames.has(item.tag))
    ];
    const computedInsights = generateGuestInsights({
      memories,
      reservations,
      tickets,
      upsells,
      conversions,
      messages,
      aiLogs
    });
    const insights = (persistedInsights || []).length ? persistedInsights : computedInsights;
    const risk = detectOperationalRisk({ tickets, aiLogs, messages });
    const revenue = detectRevenueSignals({ memories, upsells, reservations, conversions });
    const guestScore = persistedProfile?.guest_score ?? calculateGuestScore({
      reservations,
      tickets,
      upsells,
      conversions,
      memories,
      aiLogs
    });
    const actions = (persistedActions || []).length
      ? persistedActions
      : generateRecommendedActions({ tags, risk, revenue });
    const departmentContext = buildDepartmentContext({
      memories,
      tickets,
      upsells,
      tags,
      risk,
      revenue
    });
    const timeline = buildTimeline({
      messages,
      tickets,
      reservations,
      upsells,
      scheduledMessages,
      insights
    });

    return NextResponse.json({
      hotel,
      guest,
      header: {
        name: formatGuestName({ guest, reservations }),
        email: getGuestEmail({ reservations }),
        phone: guest.phone_number,
        preferredLanguage: formatLanguage(guest, memories),
        reservationCount: reservations.length,
        lastStay: getLastStay(reservations),
        totalConversations: conversations.length,
        totalTickets: tickets.length,
        acceptedUpsells: conversions.filter((item) => item.status === 'accepted').length || upsells.filter((item) => item.accepted || item.status === 'accepted').length,
        revenueGenerated: getAcceptedRevenue(conversions),
        guestScore
      },
      profile: persistedProfile,
      tags,
      timeline,
      insights,
      actions,
      departmentContext,
      revenue,
      risk,
      raw: {
        memories,
        reservations,
        conversations,
        tickets,
        upsells,
        conversions,
        aiLogs
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Guest AI profile failed'
    }, { status: 500 });
  }
}
