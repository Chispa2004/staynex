import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

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
    console.warn('Executive dashboard rows unavailable', error.message);
    return fallback;
  }

  return data || fallback;
};

const withHotel = (query, hotelId) => (
  hotelId ? query.eq('hotel_id', hotelId) : query
);

const revenueByUpsellType = {
  romantic_package: 95,
  late_checkout: 45,
  airport_transfer: 65,
  room_upgrade: 120,
  spa: 80,
  dinner: 70,
  breakfast_upgrade: 30
};

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
  guestMemory
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
    description: `${item.category || 'ticket'} · ${item.priority || 'normal'}`,
    createdAt: item.created_at,
    tone: item.priority === 'urgent' ? 'red' : 'amber',
    href: `/dashboard/tickets/${item.id}`
  })),
  ...upsells.map((item) => formatActivity({
    type: 'upsell',
    title: item.title || 'Upsell detected',
    description: `${item.upsell_type || 'opportunity'} · ${Math.round(Number(item.confidence || 0) * 100)}% confidence`,
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
  ...guestMemory.map((item) => formatActivity({
    type: 'memory',
    title: 'Guest memory detected',
    description: `${item.memory_key}: ${item.memory_value}`,
    createdAt: item.updated_at || item.created_at,
    tone: 'emerald',
    href: '/dashboard/guest-memory'
  })),
  ...aiLogs.map((item) => formatActivity({
    type: 'ai',
    title: item.ticket_created ? 'AI created a ticket' : 'AI response generated',
    description: `${item.detected_intent || 'unknown'} · ${item.detected_language || 'auto'}`,
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

const buildInsights = ({ guestMemory, upsells, aiLogs, conversations }) => {
  const memoryKeys = new Set(guestMemory.map((item) => item.memory_key));
  const languageCounts = countBy(aiLogs, 'detected_language');
  const topLanguage = Object.entries(languageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'es';
  const lowConfidence = aiLogs.filter((item) => Number(item.confidence_score) < 0.65).length;
  const romanticUpsells = upsells.filter((item) => item.upsell_type === 'romantic_package').length;

  return [
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
    const { supabase, hotel, fallback } = await getCurrentHotelForRequest(request);
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
      recentGuestMemory,
      reservationsToday,
      activeGuestsRows
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
        supabase.from('tickets').select('id, room_number, category, priority, status, title, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('conversations').select('id, status, last_message_at, created_at, guest_id'),
        hotelId
      ).order('last_message_at', { ascending: false, nullsFirst: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('ai_logs').select('id, detected_language, detected_intent, confidence_score, ticket_created, emergency, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('scheduled_messages').select('id, automation_type, status, scheduled_for, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(20)),
      safeRows(withHotel(
        supabase.from('ai_upsells').select('id, upsell_type, title, confidence, status, accepted, rejected, created_at'),
        hotelId
      ).order('created_at', { ascending: false }).limit(50)),
      safeRows(withHotel(
        supabase.from('guest_memory').select('id, memory_key, memory_value, memory_type, updated_at, created_at'),
        hotelId
      ).order('updated_at', { ascending: false }).limit(25)),
      safeRows(withHotel(
        supabase.from('reservations').select('id, arrival_date, departure_date, status'),
        hotelId
      ).or(`arrival_date.eq.${todayDate},departure_date.eq.${todayDate}`).limit(50)),
      safeRows(withHotel(
        supabase.from('conversations').select('guest_id'),
        hotelId
      ).not('guest_id', 'is', null).limit(500))
    ]);

    const activeGuests = new Set(activeGuestsRows.map((row) => row.guest_id).filter(Boolean)).size;
    const upsellTypeCounts = countBy(recentUpsells, 'upsell_type');
    const estimatedAiRevenue = recentUpsells.reduce((total, item) => (
      total + (revenueByUpsellType[item.upsell_type] || 40)
    ), 0);
    const completedTickets = allTickets.filter((item) => item.status === 'completed').length;
    const guestSatisfactionScore = Math.max(78, Math.min(98, 94 - urgentTickets * 2 + completedTickets));
    const arrivalsToday = reservationsToday.filter((item) => item.arrival_date === todayDate).length;
    const departuresToday = reservationsToday.filter((item) => item.departure_date === todayDate).length;

    return NextResponse.json({
      hotel,
      fallback,
      refreshedAt: new Date().toISOString(),
      kpis: {
        conversationsToday,
        openTickets,
        activeGuests,
        aiResponses,
        upsellsDetected,
        automationsScheduled,
        estimatedAiRevenue,
        guestSatisfactionScore,
        urgentTickets
      },
      summary: {
        activeConversations: recentConversations.filter((item) => item.status === 'active').length,
        upsellsDetected: recentUpsells.length,
        urgentTickets
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
      revenue: {
        totalUpsells: recentUpsells.length,
        byType: {
          romantic_package: upsellTypeCounts.romantic_package || 0,
          late_checkout: upsellTypeCounts.late_checkout || 0,
          airport_transfer: upsellTypeCounts.airport_transfer || 0,
          room_upgrade: upsellTypeCounts.room_upgrade || 0
        },
        accepted: recentUpsells.filter((item) => item.accepted || item.status === 'accepted').length,
        estimatedRevenue: estimatedAiRevenue,
        conversionRate: recentUpsells.length > 0
          ? Math.round((recentUpsells.filter((item) => item.accepted || item.status === 'accepted').length / recentUpsells.length) * 100)
          : 18
      },
      activity: buildActivityFeed({
        aiLogs: recentAiLogs,
        tickets: allTickets.slice(0, 12),
        conversations: recentConversations,
        scheduledMessages: recentScheduledMessages,
        upsells: recentUpsells,
        guestMemory: recentGuestMemory
      }),
      insights: buildInsights({
        guestMemory: recentGuestMemory,
        upsells: recentUpsells,
        aiLogs: recentAiLogs,
        conversations: recentConversations
      })
    });
  } catch (error) {
    console.error('Executive dashboard API failed', error);

    return NextResponse.json({
      error: error.message || 'Executive dashboard failed'
    }, { status: 500 });
  }
}
