import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const periodConfig = {
  today: { days: 1, bucket: 'hour' },
  sevenDays: { days: 7, bucket: 'day' },
  thirtyDays: { days: 30, bucket: 'week' }
};

const noStoreJson = (body, init = {}) => NextResponse.json(body, {
  ...init,
  headers: {
    'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
    ...(init.headers || {})
  }
});

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const getSinceDate = (period) => {
  const config = periodConfig[period] || periodConfig.sevenDays;
  const date = startOfDay(new Date());
  date.setDate(date.getDate() - (config.days - 1));
  return date;
};

const safeRows = async (query, label, fallback = []) => {
  const { data, error } = await query;

  if (error) {
    console.warn(`Analytics ${label} unavailable`, error.message);
    return fallback;
  }

  return data || fallback;
};

const safeCount = async (query, label, fallback = 0) => {
  const { count, error } = await query;

  if (error) {
    console.warn(`Analytics ${label} count unavailable`, error.message);
    return fallback;
  }

  return count || fallback;
};

const formatDayLabel = (date) => new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date);
const formatHourLabel = (date) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

const getMessageBucket = (date, period) => {
  if (period === 'today') {
    const hour = new Date(date);
    hour.setMinutes(0, 0, 0);
    return formatHourLabel(hour);
  }

  if (period === 'thirtyDays') {
    const since = getSinceDate(period);
    const diffDays = Math.max(0, Math.floor((startOfDay(new Date(date)) - since) / 86400000));
    return `W${Math.floor(diffDays / 7) + 1}`;
  }

  return formatDayLabel(new Date(date));
};

const buildMessagesByDay = ({ messages, period }) => {
  const config = periodConfig[period] || periodConfig.sevenDays;
  const buckets = new Map();

  if (period === 'today') {
    ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].forEach((label) => buckets.set(label, 0));
  } else if (period === 'thirtyDays') {
    ['W1', 'W2', 'W3', 'W4', 'W5'].forEach((label) => buckets.set(label, 0));
  } else {
    for (let index = config.days - 1; index >= 0; index -= 1) {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - index);
      buckets.set(formatDayLabel(date), 0);
    }
  }

  messages.forEach((message) => {
    const label = getMessageBucket(message.created_at, period);
    buckets.set(label, (buckets.get(label) || 0) + 1);
  });

  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => period !== 'thirtyDays' || item.value > 0 || ['W1', 'W2', 'W3', 'W4'].includes(item.label));
};

const buildTicketFlow = ({ tickets, period }) => {
  const config = periodConfig[period] || periodConfig.sevenDays;
  const buckets = new Map();

  if (period === 'today') {
    ['Housekeeping', 'Maintenance', 'Reception'].forEach((label) => buckets.set(label, { label, created: 0, resolved: 0 }));
  } else if (period === 'thirtyDays') {
    ['W1', 'W2', 'W3', 'W4', 'W5'].forEach((label) => buckets.set(label, { label, created: 0, resolved: 0 }));
  } else {
    for (let index = config.days - 1; index >= 0; index -= 1) {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - index);
      const label = formatDayLabel(date);
      buckets.set(label, { label, created: 0, resolved: 0 });
    }
  }

  tickets.forEach((ticket) => {
    const label = period === 'today'
      ? (ticket.category || 'Reception')
      : getMessageBucket(ticket.created_at, period);
    const normalizedLabel = period === 'today'
      ? String(label).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
      : label;
    const current = buckets.get(normalizedLabel) || { label: normalizedLabel, created: 0, resolved: 0 };
    current.created += 1;

    if (['completed', 'resolved', 'closed'].includes(ticket.status)) {
      current.resolved += 1;
    }

    buckets.set(normalizedLabel, current);
  });

  return [...buckets.values()].filter((item) => item.created > 0 || item.resolved > 0 || period !== 'today');
};

const countBy = (rows, field) => rows.reduce((acc, row) => {
  const key = row[field] || 'unknown';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const toPercentList = (counts) => {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  if (!total) {
    return [];
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({
      label: String(label).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      value: Math.round((value / total) * 100)
    }));
};

const toCountList = (counts) => Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([label, value]) => ({
    label: String(label).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    value
  }));

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = periodConfig[searchParams.get('period')] ? searchParams.get('period') : 'sevenDays';
    const sinceDate = getSinceDate(period);
    const sinceIso = sinceDate.toISOString();
    const { supabase, hotel, role, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id) {
      return noStoreJson({ error: 'Workspace is not available' }, { status: 403 });
    }

    if (!canAccess(role, 'analytics')) {
      return noStoreJson({ error: 'Access denied' }, { status: 403 });
    }

    const hotelId = hotel.id;
    const conversations = await safeRows(
      supabase
        .from('conversations')
        .select('id, guest_id, last_message_at, created_at')
        .eq('hotel_id', hotelId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      'conversations'
    );
    const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean);
    const [
      messages,
      tickets,
      aiLogs,
      urgentTickets,
      rooms
    ] = await Promise.all([
      conversationIds.length
        ? safeRows(
          supabase
            .from('messages')
            .select('id, conversation_id, sender_type, content, created_at')
            .in('conversation_id', conversationIds)
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: true })
            .limit(3000),
          'messages'
        )
        : [],
      safeRows(
        supabase
          .from('tickets')
          .select('id, category, priority, status, room_number, created_at, completed_at')
          .eq('hotel_id', hotelId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(1000),
        'tickets'
      ),
      safeRows(
        supabase
          .from('ai_logs')
          .select('id, detected_language, detected_intent, confidence_score, ticket_created, created_at')
          .eq('hotel_id', hotelId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(1000),
        'ai logs'
      ),
      safeCount(
        supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotelId)
          .eq('priority', 'urgent')
          .gte('created_at', sinceIso),
        'urgent tickets'
      ),
      safeRows(
        supabase
          .from('guests')
          .select('current_room')
          .eq('hotel_id', hotelId)
          .not('current_room', 'is', null)
          .limit(200),
        'rooms'
      )
    ]);

    const managedMessages = messages.length;
    const ticketsCreated = tickets.length;
    const resolvedTickets = tickets.filter((ticket) => ['completed', 'resolved', 'closed'].includes(ticket.status)).length;
    const aiResponses = messages.filter((message) => message.sender_type === 'ai').length;
    const resolutionRate = ticketsCreated ? Math.round((resolvedTickets / ticketsCreated) * 100) : 0;
    const aiAutomation = managedMessages ? Math.round((aiResponses / managedMessages) * 100) : 0;
    const instantReplies = aiLogs.length || aiResponses;
    const timeSavedHours = Math.round((instantReplies * 4) / 60);
    const detectedRooms = [
      ...new Set([
        ...tickets.map((ticket) => ticket.room_number),
        ...rooms.map((room) => room.current_room)
      ].filter(Boolean))
    ].slice(0, 6);

    return noStoreJson({
      ok: true,
      hotelId,
      period,
      analytics: {
        hotelId,
        kpis: {
          managedMessages,
          ticketsCreated,
          resolutionRate,
          aiAutomation
        },
        messagesByDay: buildMessagesByDay({ messages, period }),
        ticketFlow: buildTicketFlow({ tickets, period }),
        departmentTickets: toPercentList(countBy(tickets, 'category')),
        languages: toPercentList(countBy(aiLogs, 'detected_language')),
        frequentCategories: toCountList(countBy([
          ...tickets.map((ticket) => ({ category: ticket.category })),
          ...aiLogs.map((log) => ({ category: log.detected_intent }))
        ], 'category')),
        peakHours: toCountList(messages.reduce((acc, message) => {
          const hour = new Date(message.created_at).getHours();
          const label = `${String(hour).padStart(2, '0')}:00`;
          acc.push({ hour: label });
          return acc;
        }, []).reduce((acc, item) => {
          acc[item.hour] = (acc[item.hour] || 0) + 1;
          return acc;
        }, {})),
        impact: {
          timeSaved: `${timeSavedHours} h`,
          instantReplies,
          urgentIncidents: urgentTickets,
          activeRooms: detectedRooms
        }
      }
    });
  } catch (error) {
    console.error('Analytics API failed', error);

    return noStoreJson({
      ok: false,
      error: error.message || 'Analytics lookup failed'
    }, { status: 500 });
  }
}
