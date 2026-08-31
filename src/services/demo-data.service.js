import { getSupabase } from './supabase.service.js';
import { getDefaultHotel, getHotelById } from './hotel.service.js';
import { createOrUpdateReservation } from './reservation.service.js';
import { scheduleReservationAutomations } from './automation.service.js';
import { getDefaultUpsellAmount } from './revenue.service.js';
import { createAiLog } from './ai-log.service.js';
import { logger } from '../utils/logger.js';
import { isGuestMemoryEnabled } from '../../shared/guest-memory/feature-flag.js';
import { getHotelAiAutoReplyStatus } from '../../shared/pilot/ai-safety.js';
import {
  EXECUTION_MODES,
  OPERATIONAL_STATUSES
} from '../../shared/automations/catalog.js';
import {
  buildRuntimeAutomationPreview,
  evaluateAutomationDecision
} from '../../shared/automations/runtime.js';
import {
  PILOT_JOURNEY_CERTIFICATION,
  PILOT_JOURNEY_STATUSES,
  PILOT_LIVE_SEND_BLOCKERS
} from '../../shared/automations/pilot-journeys.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const addMinutesIso = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

const isMissingOptionalTable = (error) => (
  error?.message?.includes('guest_ai_profiles')
  || error?.message?.includes('guest_ai_tags')
  || error?.message?.includes('guest_ai_insights')
  || error?.message?.includes('ai_offers')
  || error?.message?.includes('ai_upsells')
  || error?.message?.includes('upsell_conversions')
  || error?.message?.includes('scheduled_messages')
  || error?.message?.includes('guest_memory')
  || error?.message?.includes('guest_ai_actions')
  || error?.message?.includes('hotel_rooms')
  || error?.message?.includes('room_status_snapshots')
  || error?.message?.includes('hotel_occupancy_snapshots')
  || error?.message?.includes('guest_stay_context')
  || error?.message?.includes('conversation_ai_state')
  || error?.message?.includes('hotel_pms_connections')
  || error?.details?.includes('guest_ai_profiles')
  || error?.details?.includes('guest_ai_tags')
  || error?.details?.includes('guest_ai_insights')
  || error?.details?.includes('ai_offers')
  || error?.details?.includes('ai_upsells')
  || error?.details?.includes('upsell_conversions')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('guest_memory')
  || error?.details?.includes('guest_ai_actions')
  || error?.details?.includes('hotel_rooms')
  || error?.details?.includes('room_status_snapshots')
  || error?.details?.includes('hotel_occupancy_snapshots')
  || error?.details?.includes('guest_stay_context')
  || error?.details?.includes('conversation_ai_state')
  || error?.details?.includes('hotel_pms_connections')
);

const demoScenarios = [
  {
    key: 'romantic-couple',
    name: 'Laura Garcia',
    email: 'laura.garcia@example.com',
    phone: '+34910001001',
    room: '412',
    language: 'es',
    roomType: 'Deluxe Sea View',
    boardBasis: 'breakfast',
    arrivalOffset: 7,
    departureOffset: 11,
    adults: 2,
    children: 0,
    tags: ['romantic', 'spa_interest', 'upgrade_ready'],
    score: 92,
    memory: [
      ['personal_context', 'traveling_with_partner', 'true'],
      ['personal_context', 'anniversary_trip', 'true'],
      ['upsell_interest', 'interested_spa', 'true']
    ],
    messages: [
      ['guest', 'We are celebrating our anniversary next week.'],
      ['ai', 'Congratulations. I can help make the stay feel special. The spa is available from 10:00 to 20:00, and reception can prepare a romantic package if you would like.']
    ],
    upsellType: 'romantic_package',
    offerStatus: 'sent',
    conversionStatus: 'sent',
    insight: 'High probability of accepting a romantic package or spa experience.',
    ticket: null
  },
  {
    key: 'late-checkout',
    name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '+34910001002',
    room: '305',
    language: 'en',
    roomType: 'Junior Suite',
    boardBasis: 'breakfast',
    arrivalOffset: -1,
    departureOffset: 1,
    adults: 2,
    children: 0,
    tags: ['late_checkout_interest', 'business_trip'],
    score: 84,
    memory: [
      ['upsell_interest', 'interested_late_checkout', 'true'],
      ['stay_preference', 'prefers_quiet_room', 'true']
    ],
    messages: [
      ['guest', 'Can we leave later tomorrow?'],
      ['ai', 'Late checkout may be available until 2pm depending on occupancy. The additional cost would be 40 EUR. Would you like me to request it for you?']
    ],
    upsellType: 'late_checkout',
    offerStatus: 'accepted',
    conversionStatus: 'accepted',
    insight: 'Accepted late checkout offer; strong candidate for future paid convenience services.',
    ticket: null
  },
  {
    key: 'noise-complaint',
    name: 'Emma Wilson',
    email: 'emma.wilson@example.com',
    phone: '+34910001003',
    room: '218',
    language: 'en',
    roomType: 'Standard',
    boardBasis: 'room only',
    arrivalOffset: 0,
    departureOffset: 3,
    adults: 1,
    children: 0,
    tags: ['complains_often', 'operational_risk'],
    score: 61,
    risk: 72,
    memory: [
      ['stay_preference', 'sensitive_to_noise', 'true'],
      ['personal_context', 'prefers_fast_replies', 'true']
    ],
    messages: [
      ['guest', 'The room is noisy. I cannot sleep.'],
      ['ai', 'I am sorry about the inconvenience. I have informed reception so we can assist you as quickly as possible.']
    ],
    upsellType: null,
    offerStatus: null,
    conversionStatus: null,
    insight: 'Operational risk: noise complaint needs reception follow-up before review risk increases.',
    ticket: {
      category: 'complaint',
      priority: 'high',
      title: 'Noise complaint',
      description: 'Guest reports noise and cannot sleep. Reception follow-up required.'
    }
  },
  {
    key: 'vip-guest',
    name: 'Michael Brown',
    email: 'michael.brown@example.com',
    phone: '+34910001004',
    room: '701',
    language: 'en',
    roomType: 'Premium Suite',
    boardBasis: 'breakfast',
    arrivalOffset: 3,
    departureOffset: 8,
    adults: 2,
    children: 0,
    tags: ['vip', 'repeat_guest', 'high_spender', 'upgrade_ready'],
    score: 98,
    revenue: 420,
    memory: [
      ['personal_context', 'repeat_guest', 'true'],
      ['upsell_interest', 'accepted_upgrade_before', 'true'],
      ['stay_preference', 'prefers_suite', 'true']
    ],
    messages: [
      ['guest', 'Hi, I am coming back next week. Do you still have premium rooms available?'],
      ['ai', 'Welcome back. I can ask reception to check premium upgrade options for your stay and keep everything aligned with your previous preferences.']
    ],
    upsellType: 'room_upgrade',
    offerStatus: 'suggested',
    conversionStatus: 'pending',
    insight: 'VIP repeat guest with previous upgrade acceptance and high revenue potential.',
    ticket: null
  },
  {
    key: 'family-traveler',
    name: 'Rodriguez Family',
    email: 'familia.rodriguez@example.com',
    phone: '+34910001005',
    room: '524',
    language: 'es',
    roomType: 'Family Room',
    boardBasis: 'breakfast',
    arrivalOffset: 5,
    departureOffset: 10,
    adults: 2,
    children: 2,
    tags: ['family', 'transfer_interest'],
    score: 80,
    memory: [
      ['personal_context', 'family_trip', 'true'],
      ['upsell_interest', 'interested_transfer', 'true'],
      ['stay_preference', 'children_traveling', 'true']
    ],
    messages: [
      ['guest', 'Viajamos con dos ninos. Necesitamos transfer desde el aeropuerto?'],
      ['ai', 'Claro. Recepcion puede ayudarte con un transfer familiar desde el aeropuerto y confirmar espacio para equipaje y ninos.']
    ],
    upsellType: 'airport_transfer',
    offerStatus: 'sent',
    conversionStatus: 'sent',
    insight: 'Family traveler with transfer intent; good opportunity for arrival-service revenue.',
    ticket: null
  }
];

const knowledgeEntries = [
  ['breakfast', 'Breakfast', 'food', 'Breakfast is served from 07:30 to 10:30.'],
  ['wifi', 'WiFi', 'connectivity', 'Network: RiuGuest. Password: mallorca2026.'],
  ['checkout', 'Checkout', 'policy', 'Standard checkout is at 12:00. Late checkout may be available depending on occupancy.'],
  ['spa', 'Spa', 'wellness', 'The spa is open from 10:00 to 20:00.'],
  ['parking', 'Parking', 'transport', 'Parking is available for 18 EUR per day.'],
  ['restaurant', 'Restaurant', 'food', 'Dinner is served from 19:30 to 23:00.'],
  ['transfer', 'Transfer', 'transport', 'Reception can help arrange airport transfers on request.'],
  ['romantic_package', 'Romantic package', 'revenue', 'Reception can prepare romantic packages with cava, chocolates and spa access subject to availability.']
];

const demoPhones = demoScenarios.map((scenario) => scenario.phone);
const demoPmsId = (hotelId, scenario) => `DEMO-SHOWCASE-${String(hotelId || 'HOTEL').slice(0, 8)}-${scenario.key}`;
const legacyDemoPmsIds = demoScenarios.map((scenario) => `DEMO-SHOWCASE-${scenario.key}`);

const safeInsert = async ({ table, rows, select = '*', supabase = getSupabase() }) => {
  try {
    const { data, error } = await supabase
      .from(table)
      .insert(rows)
      .select(select);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping insert', {
        table,
        error: error.message
      });
      return [];
    }

    throw error;
  }
};

const safeUpsert = async ({ table, rows, onConflict, select = '*', supabase = getSupabase() }) => {
  try {
    const query = supabase.from(table).upsert(rows, { onConflict });
    const { data, error } = await query.select(select);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping upsert', {
        table,
        error: error.message
      });
      return [];
    }

    throw error;
  }
};

const safeDelete = async ({ table, apply, supabase = getSupabase() }) => {
  try {
    const { error } = await apply(supabase.from(table).delete());

    if (error) {
      throw error;
    }
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping delete', {
        table,
        error: error.message
      });
      return;
    }

    throw error;
  }
};

const updateHotelForDemo = async (hotelId) => {
  const { data, error } = await getSupabase()
    .from('hotels')
    .update({
      name: 'Hotel Riu Mallorca',
      brand_name: 'Staynex Demo',
      address: 'Playa de Palma, Mallorca',
      phone: '+34971123456',
      whatsapp_number: process.env.TWILIO_WHATSAPP_FROM || '+14155238886',
      timezone: 'Europe/Madrid',
      default_language: 'es',
      check_in_time: '15:00',
      check_out_time: '12:00',
      description: 'Hotel demo oficial de Staynex para mostrar operaciones IA, revenue concierge y guest memory.',
      updated_at: new Date().toISOString()
    })
    .eq('id', hotelId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const findOrCreateGuest = async ({ hotelId, scenario }) => {
  const client = getSupabase();
  const existingResult = await client
    .from('guests')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('phone_number', scenario.phone)
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  const record = {
    hotel_id: hotelId,
    phone_number: scenario.phone,
    current_room: scenario.room,
    preferred_language: scenario.language
  };

  if (existingResult.data) {
    const { data, error } = await client
      .from('guests')
      .update(record)
      .eq('id', existingResult.data.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await client
    .from('guests')
    .insert(record)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const recreateConversation = async ({ hotelId, guest, scenario, offset }) => {
  const client = getSupabase();
  const { data: existingConversations } = await client
    .from('conversations')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('guest_id', guest.id);
  const conversationIds = (existingConversations || []).map((item) => item.id);

  if (conversationIds.length) {
    await client.from('messages').delete().eq('hotel_id', hotelId).in('conversation_id', conversationIds);
    await client.from('tickets').delete().in('conversation_id', conversationIds);
    await client.from('ai_upsells').delete().in('conversation_id', conversationIds);
    await client.from('ai_offers').delete().in('conversation_id', conversationIds);
    await client.from('upsell_conversions').delete().in('conversation_id', conversationIds);
    await client.from('ai_logs').delete().in('conversation_id', conversationIds);
    await client.from('scheduled_messages').delete().in('conversation_id', conversationIds);
    await client.from('conversations').delete().in('id', conversationIds);
  }

  const lastMessageAt = addMinutesIso(offset);
  const { data: conversation, error } = await client
    .from('conversations')
    .insert({
      hotel_id: hotelId,
      guest_id: guest.id,
      status: 'active',
      last_message_at: lastMessageAt,
      created_at: addMinutesIso(offset - 8)
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const messages = scenario.messages.map(([senderType, content], index) => ({
    conversation_id: conversation.id,
    hotel_id: hotelId,
    sender_type: senderType,
    content,
    created_at: addMinutesIso(offset - (scenario.messages.length - index) * 2)
  }));

  const { data: insertedMessages, error: messagesError } = await client
    .from('messages')
    .insert(messages)
    .select('*');

  if (messagesError) {
    throw messagesError;
  }

  return {
    conversation,
    messages: insertedMessages || []
  };
};

const createDemoReservation = async ({ hotelId, guest, scenario }) => {
  const { reservation } = await createOrUpdateReservation({
    hotel_id: hotelId,
    pms_provider: 'demo_showcase',
    pms_reservation_id: demoPmsId(hotelId, scenario),
    guest_name: scenario.name,
    guest_email: scenario.email,
    guest_phone: scenario.phone,
    arrival_date: addDays(scenario.arrivalOffset),
    departure_date: addDays(scenario.departureOffset),
    room_type: scenario.roomType,
    rate_plan: scenario.boardBasis === 'breakfast' ? 'Breakfast included' : 'Flexible rate',
    board_basis: scenario.boardBasis,
    adults: scenario.adults,
    children: scenario.children,
    status: 'confirmed',
    source: 'commercial_demo',
    notes: `Commercial showcase scenario: ${scenario.key}`
  });

  await scheduleReservationAutomations(reservation);

  return reservation;
};

const createDemoTicket = async ({ hotelId, guest, conversation, scenario }) => {
  if (!scenario.ticket) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from('tickets')
    .insert({
      hotel_id: hotelId,
      guest_id: guest.id,
      conversation_id: conversation.id,
      room_number: scenario.room,
      status: 'open',
      created_at: addMinutesIso(-9),
      ...scenario.ticket
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const createDemoUpsellRevenue = async ({ hotelId, guest, reservation, conversation, scenario }) => {
  if (!scenario.upsellType) {
    return {};
  }

  const amount = getDefaultUpsellAmount(scenario.upsellType);
  const accepted = scenario.conversionStatus === 'accepted';
  const { data: upsell, error: upsellError } = await getSupabase()
    .from('ai_upsells')
    .insert({
      hotel_id: hotelId,
      guest_id: guest.id,
      reservation_id: reservation.id,
      conversation_id: conversation.id,
      upsell_type: scenario.upsellType,
      title: `${scenario.upsellType.replaceAll('_', ' ')} opportunity`,
      description: scenario.insight,
      suggested_message: scenario.messages[1]?.[1] || 'Reception can help with this service.',
      trigger_source: 'commercial_demo',
      confidence: accepted ? 0.94 : 0.86,
      status: accepted ? 'accepted' : 'suggested',
      accepted,
      rejected: false,
      metadata: {
        demo: true,
        scenario: scenario.key
      }
    })
    .select('*')
    .single();

  if (upsellError) {
    if (isMissingOptionalTable(upsellError)) {
      return {};
    }

    throw upsellError;
  }

  const [offer] = await safeInsert({
    table: 'ai_offers',
    rows: [{
      hotel_id: hotelId,
      guest_id: guest.id,
      reservation_id: reservation.id,
      conversation_id: conversation.id,
      offer_type: scenario.upsellType,
      suggested_price: amount,
      currency: 'EUR',
      status: scenario.offerStatus || 'suggested',
      confidence: accepted ? 0.94 : 0.86,
      ai_reason: scenario.insight,
      accepted_at: accepted ? addMinutesIso(-2) : null,
      metadata: {
        demo: true,
        scenario: scenario.key
      }
    }]
  });

  const [conversion] = await safeInsert({
    table: 'upsell_conversions',
    rows: [{
      hotel_id: hotelId,
      guest_id: guest.id,
      reservation_id: reservation.id,
      conversation_id: conversation.id,
      upsell_id: upsell.id,
      upsell_type: scenario.upsellType,
      source: 'commercial_demo',
      offer_sent_at: ['sent', 'accepted'].includes(scenario.conversionStatus) ? addMinutesIso(-3) : null,
      accepted_at: accepted ? addMinutesIso(-2) : null,
      status: scenario.conversionStatus || 'pending',
      estimated_amount: amount,
      currency: 'EUR',
      notes: `Demo revenue attribution for ${scenario.key}`
    }]
  });

  return {
    upsell,
    offer,
    conversion
  };
};

const createDemoMemoryAndSignals = async ({ hotelId, guest, scenario }) => {
  if (isGuestMemoryEnabled()) {
    await safeUpsert({
      table: 'guest_memory',
      onConflict: 'hotel_id,guest_id,memory_key',
      rows: scenario.memory.map(([memoryType, memoryKey, memoryValue]) => ({
        hotel_id: hotelId,
        guest_id: guest.id,
        memory_type: memoryType,
        memory_key: memoryKey,
        memory_value: memoryValue,
        confidence: 0.9,
        source: 'commercial_demo',
        metadata: {
          demo: true,
          scenario: scenario.key
        },
        updated_at: new Date().toISOString()
      }))
    });
  }

  await safeUpsert({
    table: 'guest_ai_profiles',
    onConflict: 'hotel_id,guest_id',
    rows: [{
      hotel_id: hotelId,
      guest_id: guest.id,
      guest_score: scenario.score,
      preferred_language: scenario.language,
      sentiment: scenario.risk ? 'negative' : 'positive',
      revenue_generated: scenario.revenue || (scenario.conversionStatus === 'accepted' ? getDefaultUpsellAmount(scenario.upsellType) : 0),
      operational_risk_score: scenario.risk || 10,
      last_summary: scenario.insight,
      metadata: {
        demo: true,
        tags: scenario.tags,
        scenario: scenario.key
      },
      updated_at: new Date().toISOString()
    }]
  });

  await safeUpsert({
    table: 'guest_ai_tags',
    onConflict: 'hotel_id,guest_id,tag',
    rows: scenario.tags.map((tag) => ({
      hotel_id: hotelId,
      guest_id: guest.id,
      tag,
      source: 'commercial_demo',
      confidence: 0.9,
      metadata: {
        demo: true,
        scenario: scenario.key
      },
      updated_at: new Date().toISOString()
    }))
  });

  await safeInsert({
    table: 'guest_ai_insights',
    rows: [{
      hotel_id: hotelId,
      guest_id: guest.id,
      insight_type: scenario.risk ? 'operational_risk' : 'revenue_opportunity',
      title: scenario.risk ? 'Reception follow-up recommended' : 'High-value guest signal',
      description: scenario.insight,
      priority: scenario.risk ? 'high' : 'normal',
      is_active: true,
      metadata: {
        demo: true,
        scenario: scenario.key
      }
    }]
  });
};

const createDemoAiLogs = async ({ hotelId, guest, conversation, messages, ticket, upsell, scenario }) => {
  await createAiLog({
    hotelId,
    messageId: messages[0]?.id || null,
    guestId: guest.id,
    conversationId: conversation.id,
    detectedLanguage: scenario.language,
    detectedIntent: scenario.ticket ? 'complaint' : scenario.upsellType || 'concierge_request',
    detectedRoom: scenario.room,
    confidenceScore: scenario.risk ? 0.78 : 0.92,
    knowledgeUsed: false,
    ticketCreated: Boolean(ticket),
    ticketId: ticket?.id || null,
    ticketCategory: ticket?.category || null,
    generatedResponse: messages[1]?.content || null,
    rawGuestMessage: messages[0]?.content || null,
    needsHuman: Boolean(scenario.risk),
    humanReason: scenario.risk ? 'complaint_detected' : null,
    aiProvider: 'demo',
    aiModel: 'commercial-showcase',
    fallbackUsed: false,
    upsellDetected: Boolean(upsell),
    upsellType: upsell?.upsell_type || null,
    upsellConfidence: upsell ? 0.9 : null,
    conciergeIntent: scenario.upsellType || (scenario.ticket ? 'complaint_noise' : 'guest_context'),
    offerCreated: Boolean(upsell),
    offerType: scenario.upsellType || null,
    offerStatus: scenario.offerStatus || null,
    aiSummary: scenario.insight,
    aiReasoning: `Commercial showcase scenario for ${scenario.key}`,
    aiSatisfactionEstimate: scenario.risk ? 68 : 92,
    aiResolutionEstimate: !scenario.risk
  });
};

const createDemoScheduledMessages = async ({ hotelId, guest, reservation, conversation, scenario }) => {
  await safeInsert({
    table: 'scheduled_messages',
    rows: [
      {
        hotel_id: hotelId,
        reservation_id: reservation.id,
        guest_id: guest.id,
        conversation_id: conversation.id,
        automation_type: 'pre_arrival_7d',
        channel: 'whatsapp',
        scheduled_for: new Date(Date.now() + 2 * DAY_MS).toISOString(),
        send_to: null,
        language: scenario.language,
        message_preview: `Hi ${scenario.name.split(' ')[0]}, we are looking forward to welcoming you soon. Need transfer, parking or recommendations?`,
        status: 'preview',
        ai_provider: 'demo',
        ai_model: 'commercial-showcase',
        metadata: {
          demo: true,
          scenario: scenario.key,
          execution_mode: 'preview',
          live_sending_disabled: true
        }
      },
      {
        hotel_id: hotelId,
        reservation_id: reservation.id,
        guest_id: guest.id,
        conversation_id: conversation.id,
        automation_type: 'post_stay_review',
        channel: 'whatsapp',
        scheduled_for: new Date(Date.now() + 14 * DAY_MS).toISOString(),
        send_to: null,
        language: scenario.language,
        message_preview: `Thank you for staying with us, ${scenario.name.split(' ')[0]}. We would love to hear about your experience.`,
        status: 'preview',
        ai_provider: 'demo',
        ai_model: 'commercial-showcase',
        metadata: {
          demo: true,
          scenario: scenario.key,
          execution_mode: 'preview',
          live_sending_disabled: true
        }
      }
    ]
  });
};

const upsertKnowledgeBase = async (hotelId) => {
  const client = getSupabase();
  const { data: existing, error: existingError } = await client
    .from('hotel_knowledge')
    .select('id, key')
    .eq('hotel_id', hotelId)
    .in('key', knowledgeEntries.map(([key]) => key));

  if (existingError) {
    throw existingError;
  }

  const existingByKey = new Map((existing || []).map((entry) => [entry.key, entry.id]));

  for (const [key, title, category, value] of knowledgeEntries) {
    const record = {
      hotel_id: hotelId,
      key,
      title,
      category,
      value,
      is_active: true,
      updated_at: new Date().toISOString()
    };
    const existingId = existingByKey.get(key);
    const query = existingId
      ? client.from('hotel_knowledge').update(record).eq('id', existingId)
      : client.from('hotel_knowledge').insert(record);
    const { error } = await query;

    if (error) {
      throw error;
    }
  }
};

const clearExistingDemoData = async ({ hotelId }) => {
  const client = getSupabase();
  const { data: guests } = await client
    .from('guests')
    .select('id')
    .eq('hotel_id', hotelId)
    .in('phone_number', demoPhones);
  const guestIds = (guests || []).map((guest) => guest.id);
  const { data: conversations } = guestIds.length
    ? await client.from('conversations').select('id').eq('hotel_id', hotelId).in('guest_id', guestIds)
    : { data: [] };
  const conversationIds = (conversations || []).map((conversation) => conversation.id);
  const { data: reservations } = await client
    .from('reservations')
    .select('id')
    .eq('hotel_id', hotelId)
    .eq('pms_provider', 'demo_showcase')
    .in('pms_reservation_id', [
      ...legacyDemoPmsIds,
      ...demoScenarios.map((scenario) => demoPmsId(hotelId, scenario))
    ]);
  const reservationIds = (reservations || []).map((reservation) => reservation.id);

  if (conversationIds.length) {
    await client.from('messages').delete().eq('hotel_id', hotelId).in('conversation_id', conversationIds);
    await client.from('tickets').delete().in('conversation_id', conversationIds);
    await client.from('ai_logs').delete().in('conversation_id', conversationIds);
    await safeDelete({ table: 'ai_upsells', apply: (query) => query.in('conversation_id', conversationIds) });
    await safeDelete({ table: 'ai_offers', apply: (query) => query.in('conversation_id', conversationIds) });
    await safeDelete({ table: 'upsell_conversions', apply: (query) => query.in('conversation_id', conversationIds) });
    await safeDelete({ table: 'scheduled_messages', apply: (query) => query.in('conversation_id', conversationIds) });
    await client.from('conversations').delete().in('id', conversationIds);
  }

  if (reservationIds.length) {
    await safeDelete({ table: 'scheduled_messages', apply: (query) => query.in('reservation_id', reservationIds) });
    await client.from('automation_events').delete().in('reservation_id', reservationIds);
    await safeDelete({ table: 'upsell_conversions', apply: (query) => query.in('reservation_id', reservationIds) });
    await safeDelete({ table: 'ai_upsells', apply: (query) => query.in('reservation_id', reservationIds) });
    await safeDelete({ table: 'ai_offers', apply: (query) => query.in('reservation_id', reservationIds) });
    await client.from('reservations').delete().in('id', reservationIds);
  }

  if (guestIds.length) {
    if (isGuestMemoryEnabled()) {
      await safeDelete({ table: 'guest_memory', apply: (query) => query.in('guest_id', guestIds) });
    }
    await safeDelete({ table: 'guest_ai_profiles', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_tags', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_insights', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_actions', apply: (query) => query.in('guest_id', guestIds) });
  }
};

export const CHECKIN_DEMO_HOTEL = Object.freeze({
  name: 'Hotel Demo Checkin',
  slug: 'hotel-demo-checkin'
});

export const CHECKIN_DEMO_SOURCE = 'checkin_demo';
export const CHECKIN_DEMO_PMS_PROVIDER = 'checkin_demo_mock';
export const CHECKIN_DEMO_FIXTURE_MARKER = 'staynex_checkin_demo_v1';
export const CHECKIN_DEMO_RESET_CONFIRMATION = CHECKIN_DEMO_HOTEL.slug;

const CHECKIN_DEMO_ROOMS = Object.freeze([
  ['101', '1', 'Standard Patio'],
  ['102', '1', 'Standard Patio'],
  ['103', '1', 'Standard Patio'],
  ['201', '2', 'Superior Patio'],
  ['202', '2', 'Superior Patio'],
  ['208', '2', 'Superior Patio'],
  ['301', '3', 'Deluxe Terrace'],
  ['302', '3', 'Deluxe Terrace'],
  ['303', '3', 'Family Room'],
  ['401', '4', 'Premium Sea View'],
  ['402', '4', 'Premium Sea View'],
  ['501', '5', 'Junior Suite']
]);

const CHECKIN_DEMO_RESERVATIONS = Object.freeze([
  {
    key: 'main-lucia',
    guestName: 'Lucia Martin',
    emailKey: 'lucia.martin',
    phoneIndex: 1,
    roomNumber: '208',
    roomType: 'Superior Patio',
    ratePlan: 'Flexible breakfast',
    boardBasis: 'breakfast',
    status: 'checked_in',
    arrivalOffset: -1,
    departureStrategy: 'checkout_window',
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 35,
    stayPhase: 'pre_checkout',
    revenuePotential: 45,
    runtimeMetadata: {
      last_intent: 'housekeeping towels',
      interests: ['housekeeping']
    }
  },
  {
    key: 'welcome-mateo',
    guestName: 'Mateo Alvarez',
    emailKey: 'mateo.alvarez',
    phoneIndex: 2,
    roomNumber: '201',
    roomType: 'Superior Patio',
    ratePlan: 'Room only',
    boardBasis: 'room_only',
    status: 'confirmed',
    arrivalOffset: 0,
    departureOffset: 3,
    adults: 1,
    children: 0,
    country: 'ES',
    vipScore: 12,
    stayPhase: 'pre_arrival',
    revenuePotential: 25
  },
  {
    key: 'precheckin-ana',
    guestName: 'Ana Lopez',
    emailKey: 'ana.lopez',
    phoneIndex: 3,
    roomNumber: '301',
    roomType: 'Deluxe Terrace',
    ratePlan: 'Non refundable breakfast',
    boardBasis: 'breakfast',
    status: 'confirmed',
    arrivalOffset: 1,
    departureOffset: 4,
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 22,
    stayPhase: 'pre_arrival',
    revenuePotential: 40
  },
  {
    key: 'wifi-sofia',
    guestName: 'Sofia Romero',
    emailKey: 'sofia.romero',
    phoneIndex: 4,
    roomNumber: '202',
    roomType: 'Superior Patio',
    ratePlan: 'Breakfast included',
    boardBasis: 'breakfast',
    status: 'checked_in',
    arrivalOffset: -1,
    departureOffset: 3,
    adults: 1,
    children: 0,
    country: 'ES',
    vipScore: 18,
    stayPhase: 'in_house',
    revenuePotential: 20,
    runtimeMetadata: {
      last_intent: 'wifi breakfast help',
      interests: ['wifi', 'breakfast']
    }
  },
  {
    key: 'late-transfer-nora',
    guestName: 'Nora Campos',
    emailKey: 'nora.campos',
    phoneIndex: 5,
    roomNumber: '501',
    roomType: 'Junior Suite',
    ratePlan: 'Suite flexible',
    boardBasis: 'breakfast',
    status: 'checked_in',
    arrivalOffset: -2,
    departureOffset: 1,
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 68,
    stayPhase: 'pre_checkout',
    revenuePotential: 125,
    lateCheckoutEligible: true,
    transferLikely: true,
    runtimeMetadata: {
      last_intent: 'interested in late checkout and airport transfer availability',
      available_offers: ['late_checkout', 'airport_transfer'],
      interests: ['late_checkout', 'transfer']
    }
  },
  {
    key: 'complaint-david',
    guestName: 'David Ruiz',
    emailKey: 'david.ruiz',
    phoneIndex: 6,
    roomNumber: '103',
    roomType: 'Standard Patio',
    ratePlan: 'Flexible',
    boardBasis: 'room_only',
    status: 'checked_in',
    arrivalOffset: 0,
    departureOffset: 2,
    adults: 1,
    children: 0,
    country: 'ES',
    vipScore: 10,
    stayPhase: 'in_house',
    revenuePotential: 0,
    runtimeMetadata: {
      last_intent: 'room complaint human fallback'
    }
  },
  {
    key: 'ac-carlos',
    guestName: 'Carlos Vega',
    emailKey: 'carlos.vega',
    phoneIndex: 7,
    roomNumber: '401',
    roomType: 'Premium Sea View',
    ratePlan: 'Premium breakfast',
    boardBasis: 'breakfast',
    status: 'checked_in',
    arrivalOffset: -3,
    departureOffset: 2,
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 42,
    stayPhase: 'in_house',
    revenuePotential: 30,
    runtimeMetadata: {
      last_intent: 'maintenance air conditioning'
    }
  },
  {
    key: 'review-isabel',
    guestName: 'Isabel Torres',
    emailKey: 'isabel.torres',
    phoneIndex: 8,
    roomNumber: '402',
    roomType: 'Premium Sea View',
    ratePlan: 'Flexible breakfast',
    boardBasis: 'breakfast',
    status: 'checked_out',
    arrivalOffset: -5,
    departureStrategy: 'review_window',
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 55,
    stayPhase: 'checked_out',
    revenuePotential: 0,
    runtimeMetadata: {
      stay_sentiment: 'positive',
      google_review_link: 'https://reviews.example.invalid/hotel-demo-checkin'
    }
  },
  {
    key: 'arrival-family',
    guestName: 'Familia Moreno',
    emailKey: 'familia.moreno',
    phoneIndex: 9,
    roomNumber: '303',
    roomType: 'Family Room',
    ratePlan: 'Family breakfast',
    boardBasis: 'breakfast',
    status: 'confirmed',
    arrivalOffset: 3,
    departureOffset: 7,
    adults: 2,
    children: 2,
    country: 'ES',
    vipScore: 20,
    stayPhase: 'pre_arrival',
    revenuePotential: 60,
    transferLikely: true
  },
  {
    key: 'stay-elena',
    guestName: 'Elena Navarro',
    emailKey: 'elena.navarro',
    phoneIndex: 10,
    roomNumber: '302',
    roomType: 'Deluxe Terrace',
    ratePlan: 'Breakfast included',
    boardBasis: 'breakfast',
    status: 'checked_in',
    arrivalOffset: -2,
    departureOffset: 4,
    adults: 1,
    children: 0,
    country: 'ES',
    vipScore: 45,
    stayPhase: 'in_house',
    revenuePotential: 70,
    experienceLikely: true
  },
  {
    key: 'cancelled-marta',
    guestName: 'Marta Silva',
    emailKey: 'marta.silva',
    phoneIndex: 11,
    roomNumber: '102',
    roomType: 'Standard Patio',
    ratePlan: 'Flexible',
    boardBasis: 'room_only',
    status: 'cancelled',
    arrivalOffset: 2,
    departureOffset: 5,
    adults: 1,
    children: 0,
    country: 'ES',
    vipScore: 0,
    stayPhase: 'pre_arrival',
    revenuePotential: 0
  },
  {
    key: 'cancelled-pablo',
    guestName: 'Pablo Marin',
    emailKey: 'pablo.marin',
    phoneIndex: 12,
    roomNumber: '101',
    roomType: 'Standard Patio',
    ratePlan: 'Flexible',
    boardBasis: 'room_only',
    status: 'cancelled',
    arrivalOffset: -1,
    departureOffset: 1,
    adults: 2,
    children: 0,
    country: 'ES',
    vipScore: 0,
    stayPhase: 'in_house',
    revenuePotential: 0
  }
]);

const CHECKIN_DEMO_CONVERSATIONS = Object.freeze([
  {
    key: 'main-lucia',
    reservationKey: 'main-lucia',
    currentIntent: 'housekeeping_request',
    intentConfidence: 0.92,
    sentiment: 'neutral',
    escalationLevel: 'ai_handled',
    aiMode: 'ai_active',
    offsetMinutes: -6,
    messages: [
      ['guest', 'Hola, acabamos de llegar a la habitacion 208.'],
      ['ai', 'Bienvenida, Lucia. Recepcion esta disponible por aqui si necesitais cualquier cosa durante la estancia.'],
      ['guest', 'Hola, me podeis traer dos toallas mas a la habitacion?']
    ]
  },
  {
    key: 'wifi-sofia',
    reservationKey: 'wifi-sofia',
    currentIntent: 'knowledge_wifi_breakfast',
    intentConfidence: 0.88,
    sentiment: 'positive',
    escalationLevel: 'ai_handled',
    aiMode: 'ai_active',
    offsetMinutes: -22,
    messages: [
      ['guest', 'Buenos dias, cual es la clave del wifi y el horario del desayuno?'],
      ['ai', 'La red es CheckinDemo y la clave es DemoWifi2026. El desayuno se sirve de 07:30 a 10:30.']
    ]
  },
  {
    key: 'late-transfer-nora',
    reservationKey: 'late-transfer-nora',
    currentIntent: 'late_checkout_transfer_interest',
    intentConfidence: 0.86,
    sentiment: 'positive',
    escalationLevel: 'ai_handled',
    aiMode: 'ai_active',
    offsetMinutes: -38,
    messages: [
      ['guest', 'Manana salimos tarde. Hay late checkout o transfer al aeropuerto?'],
      ['ai', 'Puedo pedir a recepcion que revise disponibilidad de late checkout y transfer para vuestra salida.']
    ]
  },
  {
    key: 'complaint-david',
    reservationKey: 'complaint-david',
    currentIntent: 'complaint_room_issue',
    intentConfidence: 0.91,
    sentiment: 'frustrated',
    escalationLevel: 'reception_required',
    aiMode: 'human_takeover',
    offsetMinutes: -15,
    messages: [
      ['guest', 'La habitacion huele a humedad y necesito que alguien lo revise ya.'],
      ['ai', 'Lo siento, David. Voy a pasar esto a recepcion para que puedan ayudarte directamente.']
    ]
  },
  {
    key: 'ac-carlos',
    reservationKey: 'ac-carlos',
    currentIntent: 'maintenance_air_conditioning',
    intentConfidence: 0.9,
    sentiment: 'neutral',
    escalationLevel: 'reception_required',
    aiMode: 'ai_active',
    offsetMinutes: -48,
    messages: [
      ['guest', 'El aire acondicionado no enfria en la 401.'],
      ['ai', 'Gracias por avisar, Carlos. He abierto una incidencia de mantenimiento para la habitacion 401.']
    ]
  }
]);

const CHECKIN_DEMO_TICKETS = Object.freeze([
  {
    key: 'main-towels',
    reservationKey: 'main-lucia',
    conversationKey: 'main-lucia',
    category: 'housekeeping',
    title: 'Toallas extra habitacion 208',
    description: 'Demo: entregar dos toallas extra en la habitacion 208.',
    priority: 'normal',
    status: 'open',
    offsetMinutes: -5
  },
  {
    key: 'maintenance-ac',
    reservationKey: 'ac-carlos',
    conversationKey: 'ac-carlos',
    category: 'maintenance',
    title: 'Aire acondicionado habitacion 401',
    description: 'Demo: revisar climatizacion de la habitacion 401.',
    priority: 'high',
    status: 'in_progress',
    offsetMinutes: -44
  },
  {
    key: 'late-checkout-transfer',
    reservationKey: 'late-transfer-nora',
    conversationKey: 'late-transfer-nora',
    category: 'reception',
    title: 'Validar late checkout y transfer',
    description: 'Demo: recepcion revisa disponibilidad de late checkout y transfer de salida.',
    priority: 'normal',
    status: 'completed',
    offsetMinutes: -34
  },
  {
    key: 'room-complaint',
    reservationKey: 'complaint-david',
    conversationKey: 'complaint-david',
    category: 'complaint',
    title: 'Atencion humana habitacion 103',
    description: 'Demo: queja de habitacion derivada a recepcion para fallback humano.',
    priority: 'high',
    status: 'open',
    offsetMinutes: -14
  }
]);

const CHECKIN_DEMO_KNOWLEDGE = Object.freeze([
  ['check_in', 'Check-in', 'arrival', 'El check-in empieza a las 15:00. Recepcion puede guardar equipaje antes de esa hora.'],
  ['check_out', 'Check-out', 'departure', 'El check-out estandar es a las 12:00. Late checkout sujeto a disponibilidad.'],
  ['desayuno', 'Desayuno', 'food', 'El desayuno se sirve de 07:30 a 10:30 en el restaurante principal.'],
  ['wifi', 'WiFi', 'connectivity', 'Red: CheckinDemo. Clave: DemoWifi2026.'],
  ['parking', 'Parking', 'transport', 'Parking disponible por 18 EUR al dia, sujeto a disponibilidad.'],
  ['piscina', 'Piscina', 'facilities', 'La piscina abre de 10:00 a 19:00.'],
  ['restaurante', 'Restaurante', 'food', 'Cena de 19:30 a 22:30. Reservas en recepcion.'],
  ['housekeeping_toallas', 'Toallas extra', 'housekeeping', 'Housekeeping puede llevar toallas extra a la habitacion durante la estancia.'],
  ['late_checkout', 'Late checkout', 'departure', 'Recepcion puede revisar late checkout hasta las 14:00 segun ocupacion.'],
  ['mascotas', 'Mascotas', 'policy', 'No se admiten mascotas salvo animales de asistencia acreditados.'],
  ['recepcion', 'Recepcion', 'operations', 'Recepcion esta disponible 24 horas para incidencias y solicitudes urgentes.'],
  ['transfer', 'Transfer', 'transport', 'Recepcion puede solicitar transfer al aeropuerto con antelacion.'],
  ['gimnasio_spa', 'Gimnasio y spa', 'wellness', 'Gimnasio de 07:00 a 21:00. Spa bajo reserva previa.'],
  ['direccion_transportes', 'Direccion y transporte', 'transport', 'El hotel esta a 18 minutos del aeropuerto en taxi segun trafico.'],
  ['cancelaciones', 'Cancelaciones', 'policy', 'Las condiciones de cancelacion dependen de la tarifa de la reserva.'],
  ['room_service', 'Room service', 'food', 'Room service disponible de 12:00 a 23:00 con carta reducida.'],
  ['emergencias', 'Emergencias', 'safety', 'Para emergencias internas, contactar recepcion 24h.'],
  ['objetos_perdidos', 'Objetos perdidos', 'operations', 'Objetos perdidos se gestionan desde recepcion con nombre, fecha y habitacion.']
]);

const CHECKIN_DEMO_JOURNEYS = Object.freeze([
  {
    key: 'welcome',
    journeyId: 'welcome',
    reservationKey: 'welcome-mateo',
    automationType: 'welcome',
    legacyType: 'welcome_message'
  },
  {
    key: 'pre-checkin',
    journeyId: 'pre_checkin',
    reservationKey: 'precheckin-ana',
    automationType: 'pre_checkin',
    legacyType: 'pre_arrival_1d'
  },
  {
    key: 'during-stay',
    journeyId: 'during_stay_upsell',
    reservationKey: 'wifi-sofia',
    conversationKey: 'wifi-sofia',
    automationType: 'during_stay',
    legacyType: 'weather_trigger'
  },
  {
    key: 'upsell',
    journeyId: 'during_stay_upsell',
    reservationKey: 'late-transfer-nora',
    conversationKey: 'late-transfer-nora',
    automationType: 'upselling',
    legacyType: 'abandoned_interest_followup',
    metadata: {
      guestSignals: 'interested in late checkout and airport transfer availability',
      available_offers: ['late_checkout', 'airport_transfer']
    }
  },
  {
    key: 'checkout',
    journeyId: 'checkout_review',
    reservationKey: 'main-lucia',
    conversationKey: 'main-lucia',
    automationType: 'checkout'
  },
  {
    key: 'review',
    journeyId: 'checkout_review',
    reservationKey: 'review-isabel',
    automationType: 'review_request',
    legacyType: 'post_stay_review_intelligence'
  }
]);

const CHECKIN_DEMO_JOURNEY_BY_ID = new Map(PILOT_JOURNEY_CERTIFICATION.map((row) => [row.id, row]));

const normalizeDemoNow = (now = new Date()) => {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const dateOnlyFromOffset = (now, offsetDays) => {
  const date = normalizeDemoNow(now);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + offsetDays);
  return utc.toISOString().slice(0, 10);
};

const isoFromOffsetMinutes = (now, offsetMinutes) => {
  const date = normalizeDemoNow(now);
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date.toISOString();
};

const resolveDemoDepartureOffset = (definition, now) => {
  if (definition.departureStrategy === 'checkout_window') {
    return normalizeDemoNow(now).getUTCHours() < 12 ? 0 : 1;
  }

  if (definition.departureStrategy === 'review_window') {
    return normalizeDemoNow(now).getUTCHours() >= 12 ? -1 : -2;
  }

  return definition.departureOffset;
};

const syntheticPhone = (index) => `+1500555${String(index).padStart(4, '0')}`;
const syntheticEmail = (key) => `${key}@example.invalid`;
const checkinDemoPmsReservationId = (definition) => `CHECKIN-DEMO-${definition.key.toUpperCase()}`;

const checkinFixtureMetadata = (scenarioKey, extra = {}) => ({
  fixture: CHECKIN_DEMO_FIXTURE_MARKER,
  demo: true,
  checkin_demo: true,
  scenario: scenarioKey,
  source: CHECKIN_DEMO_SOURCE,
  hotel_slug: CHECKIN_DEMO_HOTEL.slug,
  pms_provider: CHECKIN_DEMO_PMS_PROVIDER,
  pii: 'synthetic',
  no_real_contact: true,
  provider_traffic: false,
  live_sending_disabled: true,
  guest_memory_enabled: false,
  ...extra
});

const stripUndefined = (value = {}) => Object.entries(value).reduce((acc, [key, item]) => {
  if (item !== undefined) {
    acc[key] = item;
  }
  return acc;
}, {});

const mapByKey = (rows = []) => new Map(rows.map((row) => [row.key, row]));

const checkinDemoReservationRecord = (reservation) => {
  const {
    key,
    room_number: _roomNumber,
    language: _language,
    country: _country,
    stay_phase: _stayPhase,
    runtime_metadata: _runtimeMetadata,
    metadata: _metadata,
    ...record
  } = reservation;

  return record;
};

export const buildCheckinDemoFixturePlan = ({
  hotelId = 'hotel-demo-checkin-fixture',
  now = new Date()
} = {}) => {
  const referenceNow = normalizeDemoNow(now);
  const nowIso = referenceNow.toISOString();
  const hotel = {
    id: hotelId,
    name: CHECKIN_DEMO_HOTEL.name,
    slug: CHECKIN_DEMO_HOTEL.slug,
    brand_name: 'Checkin Demo',
    timezone: 'Europe/Madrid',
    default_language: 'es',
    check_in_time: '15:00',
    check_out_time: '12:00',
    description: 'Escenario demo seguro para Checkin y Ubikos en piloto.',
    ai_auto_reply_enabled: true,
    metadata: {
      fixture: CHECKIN_DEMO_FIXTURE_MARKER,
      checkin_demo: true,
      source: CHECKIN_DEMO_SOURCE,
      automation_live_enabled: false,
      automation_execution_mode: EXECUTION_MODES.PREVIEW,
      send_automations_required: false,
      guest_memory_enabled: false,
      ubikos_demo_state: 'mock_waiting_external',
      ubikos_live_connected: false
    }
  };

  const reservationDefinitions = CHECKIN_DEMO_RESERVATIONS.map((definition) => {
    const departureOffset = resolveDemoDepartureOffset(definition, referenceNow);
    return {
      ...definition,
      departureOffset
    };
  });

  const reservations = reservationDefinitions.map((definition) => ({
    key: definition.key,
    hotel_id: hotelId,
    guest_id: null,
    pms_provider: CHECKIN_DEMO_PMS_PROVIDER,
    pms_reservation_id: checkinDemoPmsReservationId(definition),
    guest_name: definition.guestName,
    guest_email: syntheticEmail(definition.emailKey),
    guest_phone: syntheticPhone(definition.phoneIndex),
    arrival_date: dateOnlyFromOffset(referenceNow, definition.arrivalOffset),
    departure_date: dateOnlyFromOffset(referenceNow, definition.departureOffset),
    room_type: definition.roomType,
    rate_plan: definition.ratePlan,
    board_basis: definition.boardBasis,
    status: definition.status,
    source: CHECKIN_DEMO_SOURCE,
    adults: definition.adults,
    children: definition.children,
    notes: `${CHECKIN_DEMO_FIXTURE_MARKER}:${definition.key}`,
    room_number: definition.roomNumber,
    language: 'es',
    country: definition.country,
    stay_phase: definition.stayPhase,
    runtime_metadata: checkinFixtureMetadata(definition.key, definition.runtimeMetadata || {}),
    metadata: checkinFixtureMetadata(definition.key)
  }));

  const reservationsByKey = mapByKey(reservations);
  const guests = reservationDefinitions.map((definition) => ({
    key: definition.key,
    hotel_id: hotelId,
    phone_number: syntheticPhone(definition.phoneIndex),
    current_room: definition.roomNumber,
    preferred_language: 'es',
    metadata: checkinFixtureMetadata(definition.key, {
      pms_data_complete: true,
      tags: definition.runtimeMetadata?.interests || []
    })
  }));

  const guestsByKey = mapByKey(guests);
  const roomAssignments = new Map(reservationDefinitions.map((definition) => [definition.roomNumber, definition]));
  const rooms = CHECKIN_DEMO_ROOMS.map(([roomNumber, floor, roomType]) => {
    const assignment = roomAssignments.get(roomNumber);
    return {
      key: `room-${roomNumber}`,
      hotel_id: hotelId,
      room_number: roomNumber,
      floor,
      room_type: roomType,
      active: true,
      qr_enabled: true,
      source: CHECKIN_DEMO_SOURCE,
      pms_provider: CHECKIN_DEMO_PMS_PROVIDER,
      pms_room_id: `CHECKIN-DEMO-ROOM-${roomNumber}`,
      metadata: checkinFixtureMetadata(assignment?.key || `room-${roomNumber}`, {
        demo_room: true
      })
    };
  });

  const conversations = CHECKIN_DEMO_CONVERSATIONS.map((definition) => {
    const reservation = reservationsByKey.get(definition.reservationKey);
    const guest = guestsByKey.get(definition.reservationKey);
    const createdAt = isoFromOffsetMinutes(referenceNow, definition.offsetMinutes - 8);
    const lastMessageAt = isoFromOffsetMinutes(referenceNow, definition.offsetMinutes);
    const messages = definition.messages.map(([senderType, content], index) => ({
      sender_type: senderType,
      content,
      original_language: 'es',
      translated_language: 'es',
      translated_text: null,
      translation_provider: 'demo',
      translation_confidence: 1,
      metadata: checkinFixtureMetadata(definition.key, {
        message_index: index + 1
      }),
      created_at: isoFromOffsetMinutes(referenceNow, definition.offsetMinutes - ((definition.messages.length - index) * 2))
    }));

    return {
      key: definition.key,
      reservation_key: definition.reservationKey,
      hotel_id: hotelId,
      guest_key: guest?.key || definition.reservationKey,
      guest_id: null,
      status: 'active',
      last_message_at: lastMessageAt,
      created_at: createdAt,
      last_message: messages.at(-1)?.content || null,
      messages,
      ai_state: {
        hotel_id: hotelId,
        conversation_id: null,
        current_intent: definition.currentIntent,
        previous_intent: null,
        intent_confidence: definition.intentConfidence,
        last_offer_type: definition.key === 'late-transfer-nora' ? 'late_checkout' : null,
        last_offer_sent_at: null,
        last_ai_response: messages.filter((item) => item.sender_type === 'ai').at(-1)?.content || null,
        sentiment: definition.sentiment,
        escalation_level: definition.escalationLevel,
        state_metadata: checkinFixtureMetadata(definition.key, {
          conversation_ai_mode: definition.aiMode,
          reservation_key: reservation?.key || definition.reservationKey,
          human_takeover: definition.aiMode === 'human_takeover'
            ? {
                active: true,
                reason: 'demo_human_fallback',
                activated_at: lastMessageAt
              }
            : {
                active: false
              }
        }),
        updated_at: lastMessageAt
      }
    };
  });

  const conversationsByKey = mapByKey(conversations);
  const tickets = CHECKIN_DEMO_TICKETS.map((definition) => {
    const reservation = reservationsByKey.get(definition.reservationKey);
    const conversation = conversationsByKey.get(definition.conversationKey);
    return {
      key: definition.key,
      hotel_id: hotelId,
      guest_key: definition.reservationKey,
      guest_id: null,
      conversation_key: definition.conversationKey,
      conversation_id: null,
      room_number: reservation?.room_number || null,
      category: definition.category,
      title: definition.title,
      description: definition.description,
      priority: definition.priority,
      status: definition.status,
      completed_at: definition.status === 'completed' ? isoFromOffsetMinutes(referenceNow, definition.offsetMinutes + 12) : null,
      created_at: isoFromOffsetMinutes(referenceNow, definition.offsetMinutes),
      metadata: checkinFixtureMetadata(definition.key, {
        reservation_key: reservation?.key || definition.reservationKey,
        conversation_key: conversation?.key || definition.conversationKey
      })
    };
  });

  const knowledge = CHECKIN_DEMO_KNOWLEDGE.map(([key, title, category, value]) => ({
    key,
    hotel_id: hotelId,
    title,
    category,
    value,
    is_active: true,
    updated_at: nowIso,
    metadata: checkinFixtureMetadata(`knowledge-${key}`)
  }));

  const stayContexts = reservationDefinitions.map((definition) => {
    const reservation = reservationsByKey.get(definition.key);
    return {
      key: definition.key,
      hotel_id: hotelId,
      guest_key: definition.key,
      guest_id: null,
      reservation_key: definition.key,
      reservation_id: null,
      room_number: definition.roomNumber,
      room_type: definition.roomType,
      rate_plan: definition.ratePlan,
      arrival_date: reservation.arrival_date,
      departure_date: reservation.departure_date,
      checked_in_at: ['checked_in', 'checked_out'].includes(definition.status) ? `${reservation.arrival_date}T15:10:00.000Z` : null,
      checked_out_at: definition.status === 'checked_out' ? `${reservation.departure_date}T11:35:00.000Z` : null,
      nights: Math.max(1, Math.round((new Date(`${reservation.departure_date}T12:00:00.000Z`) - new Date(`${reservation.arrival_date}T12:00:00.000Z`)) / DAY_MS)),
      adults: definition.adults,
      children: definition.children,
      language: 'es',
      country: definition.country,
      vip_score: definition.vipScore,
      stay_phase: definition.stayPhase,
      revenue_potential: definition.revenuePotential,
      upgrade_eligible: definition.vipScore >= 60,
      late_checkout_eligible: Boolean(definition.lateCheckoutEligible),
      transfer_likely: Boolean(definition.transferLikely),
      experience_likely: Boolean(definition.experienceLikely),
      last_updated_at: nowIso,
      raw_payload: checkinFixtureMetadata(definition.key, {
        pms_state: 'ubikos_demo_mock',
        live_connected: false
      })
    };
  });

  const occupiedRoomNumbers = new Set(reservationDefinitions
    .filter((definition) => definition.status === 'checked_in')
    .map((definition) => definition.roomNumber));
  const arrivingRoomNumbers = new Set(reservationDefinitions
    .filter((definition) => definition.status === 'confirmed' && definition.arrivalOffset >= 0 && definition.arrivalOffset <= 1)
    .map((definition) => definition.roomNumber));
  const departingRoomNumbers = new Set(reservationDefinitions
    .filter((definition) => definition.departureStrategy === 'checkout_window')
    .map((definition) => definition.roomNumber));

  const roomStatusSnapshots = rooms.map((room) => {
    const assignment = roomAssignments.get(room.room_number);
    const occupancyStatus = occupiedRoomNumbers.has(room.room_number)
      ? departingRoomNumbers.has(room.room_number) ? 'departing' : 'occupied'
      : arrivingRoomNumbers.has(room.room_number) ? 'arriving' : 'vacant';
    return {
      key: room.key,
      hotel_id: hotelId,
      room_number: room.room_number,
      room_type: room.room_type,
      housekeeping_status: occupancyStatus === 'vacant' ? 'clean' : occupancyStatus === 'departing' ? 'dirty' : 'inspected',
      maintenance_status: room.room_number === '401' ? 'maintenance' : 'ok',
      occupancy_status: occupancyStatus,
      current_guest_id: null,
      current_reservation_id: null,
      next_arrival_at: arrivingRoomNumbers.has(room.room_number) ? `${reservationsByKey.get(assignment?.key)?.arrival_date}T15:00:00.000Z` : null,
      last_cleaned_at: isoFromOffsetMinutes(referenceNow, -180),
      last_updated_at: nowIso,
      raw_payload: checkinFixtureMetadata(assignment?.key || room.key, {
        pms_state: 'ubikos_demo_mock'
      })
    };
  });

  const today = dateOnlyFromOffset(referenceNow, 0);
  const arrivalsToday = reservations.filter((item) => item.arrival_date === today && item.status !== 'cancelled').length;
  const departuresToday = reservations.filter((item) => item.departure_date === today && item.status !== 'cancelled').length;
  const occupiedRooms = [...occupiedRoomNumbers].length;
  const occupancySnapshots = [{
    hotel_id: hotelId,
    date: today,
    occupancy_percent: Math.round((occupiedRooms / CHECKIN_DEMO_ROOMS.length) * 100),
    occupied_rooms: occupiedRooms,
    available_rooms: CHECKIN_DEMO_ROOMS.length - occupiedRooms,
    arrivals_today: arrivalsToday,
    departures_today: departuresToday,
    stayovers_today: occupiedRooms,
    adr: 146,
    revpar: 82,
    raw_payload: checkinFixtureMetadata('occupancy', {
      pms_state: 'ubikos_demo_mock',
      live_connected: false
    })
  }];

  const plan = {
    kind: 'checkin_demo_fixture_plan',
    generatedAt: nowIso,
    hotelTarget: CHECKIN_DEMO_HOTEL,
    hotel,
    reservations,
    guests,
    rooms,
    conversations,
    tickets,
    knowledge,
    stayContexts,
    roomStatusSnapshots,
    occupancySnapshots,
    journeys: CHECKIN_DEMO_JOURNEYS.map((journey) => ({
      ...journey,
      certificationStatus: CHECKIN_DEMO_JOURNEY_BY_ID.get(journey.journeyId)?.status || PILOT_JOURNEY_STATUSES.BLOCKED
    })),
    humanControl: {
      aiActive: true,
      humanTakeoverAvailable: true,
      returnToAiAvailable: true,
      humanAttentionConversationKey: 'complaint-david',
      killSwitchAvailable: true,
      killSwitchColumn: 'hotels.ai_auto_reply_enabled'
    },
    pilotHealth: {
      readyForPilotDemo: true,
      readyForLiveAutomations: false,
      demoStatus: 'READY_FOR_DEMO_PREFLIGHT',
      liveSendBlockers: PILOT_LIVE_SEND_BLOCKERS,
      externalBlockers: [
        'Ubikos real connection pending',
        'Real WhatsApp hotel pending',
        'SEND_AUTOMATIONS remains false'
      ]
    },
    ubikos: {
      provider: 'ubikos',
      state: 'DEMO_MOCK_WAITING_EXTERNAL',
      pmsProvider: CHECKIN_DEMO_PMS_PROVIDER,
      liveConnected: false,
      realWrites: false,
      secretsStored: false,
      webhookTraffic: false
    },
    safety: {
      sendAutomations: false,
      guestMemory: false,
      supabaseAccessOnImport: false,
      twilioReal: false,
      whatsappReal: false,
      openAiReal: false,
      pmsReal: false,
      providerTraffic: false,
      pii: 'synthetic'
    }
  };

  return {
    ...plan,
    journeyPreviews: buildCheckinDemoJourneyPreviews({ plan, now: referenceNow })
  };
};

export const buildCheckinDemoJourneyPreviews = ({
  plan = buildCheckinDemoFixturePlan(),
  now = new Date(),
  reservationByKey = null,
  guestByKey = null,
  conversationByKey = null
} = {}) => {
  const referenceNow = normalizeDemoNow(now);
  const reservationsByKey = reservationByKey || mapByKey(plan.reservations);
  const guestsByKey = guestByKey || mapByKey(plan.guests);
  const conversationsByKey = conversationByKey || mapByKey(plan.conversations);
  const hotel = {
    ...(plan.hotel || {}),
    metadata: {
      ...(plan.hotel?.metadata || {}),
      automation_execution_mode: EXECUTION_MODES.PREVIEW,
      automation_live_enabled: false
    }
  };

  return plan.journeys.map((journey) => {
    const reservation = reservationsByKey.get(journey.reservationKey);
    const guest = guestsByKey.get(journey.reservationKey);
    const conversation = conversationsByKey.get(journey.conversationKey || journey.reservationKey) || null;
    const runtimeReservation = {
      ...reservation,
      id: reservation?.id || `reservation-${journey.reservationKey}`,
      guest_id: guest?.id || reservation?.guest_id || `guest-${journey.reservationKey}`,
      metadata: {
        ...(reservation?.runtime_metadata || {}),
        ...(journey.metadata || {})
      }
    };
    const runtimeGuest = {
      ...(guest || {}),
      id: guest?.id || runtimeReservation.guest_id,
      name: reservation?.guest_name,
      pms_data_complete: true,
      metadata: {
        ...(guest?.metadata || {}),
        pms_data_complete: true
      }
    };
    const decision = evaluateAutomationDecision({
      hotel,
      reservation: runtimeReservation,
      guest: runtimeGuest,
      conversation,
      automation: {
        type: journey.legacyType || journey.automationType,
        active: true
      },
      automationType: journey.automationType,
      legacyType: journey.legacyType || null,
      executionMode: EXECUTION_MODES.PREVIEW,
      now: referenceNow,
      metadata: {
        source: CHECKIN_DEMO_SOURCE,
        scenario_id: journey.key,
        test_mode: true,
        ...(reservation?.runtime_metadata || {}),
        ...(journey.metadata || {})
      },
      source: CHECKIN_DEMO_SOURCE
    });
    const messagePreview = buildRuntimeAutomationPreview({
      decision,
      hotel,
      reservation: runtimeReservation,
      guest: runtimeGuest
    });
    const certification = CHECKIN_DEMO_JOURNEY_BY_ID.get(journey.journeyId);

    return {
      ...journey,
      journey: certification?.journey || journey.journeyId,
      certificationStatus: certification?.status || PILOT_JOURNEY_STATUSES.BLOCKED,
      eligible: decision.eligible,
      skipReason: decision.skipReason,
      scheduledFor: decision.scheduledFor,
      sendable: decision.sendable,
      status: decision.operationalStatus,
      executionMode: decision.executionMode,
      messagePreview,
      decision
    };
  });
};

export const buildCheckinDemoScheduledPreviewRows = ({
  plan = buildCheckinDemoFixturePlan(),
  now = new Date(),
  reservationByKey = null,
  guestByKey = null,
  conversationByKey = null
} = {}) => buildCheckinDemoJourneyPreviews({
  plan,
  now,
  reservationByKey,
  guestByKey,
  conversationByKey
}).map((preview) => {
  const reservation = (reservationByKey || mapByKey(plan.reservations)).get(preview.reservationKey);
  const guest = (guestByKey || mapByKey(plan.guests)).get(preview.reservationKey);
  const conversation = (conversationByKey || mapByKey(plan.conversations)).get(preview.conversationKey || preview.reservationKey);
  return stripUndefined({
    key: preview.key,
    hotel_id: preview.decision.hotelId,
    reservation_key: preview.reservationKey,
    reservation_id: preview.decision.reservationId || reservation?.id,
    guest_key: preview.reservationKey,
    guest_id: preview.decision.guestId || guest?.id || null,
    conversation_key: preview.conversationKey || preview.reservationKey,
    conversation_id: preview.decision.conversationId || conversation?.id || null,
    automation_type: preview.legacyType || preview.automationType,
    channel: 'whatsapp',
    scheduled_for: preview.scheduledFor || normalizeDemoNow(now).toISOString(),
    send_to: null,
    language: 'es',
    message_preview: preview.messagePreview,
    status: OPERATIONAL_STATUSES.PREVIEW,
    ai_provider: 'demo',
    ai_model: 'automation-runtime-preview',
    automation_fallback: false,
    execution_mode: EXECUTION_MODES.PREVIEW,
    idempotency_key: preview.decision.idempotencyKey,
    runtime_version: preview.decision.runtimeVersion,
    source: CHECKIN_DEMO_SOURCE,
    creation_reason: preview.decision.triggerReason || preview.decision.skipReason || 'demo_preflight',
    metadata: {
      ...(preview.decision.metadata || {}),
      fixture: CHECKIN_DEMO_FIXTURE_MARKER,
      checkin_demo: true,
      scenario: preview.key,
      journey_id: preview.journeyId,
      journey: preview.journey,
      certification_status: preview.certificationStatus,
      certified_for_preview: preview.certificationStatus === PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW,
      live_send_blockers: PILOT_LIVE_SEND_BLOCKERS,
      no_real_contact: true,
      provider_traffic: false,
      live_sending_disabled: true,
      ubikos_state: plan.ubikos?.state || 'DEMO_MOCK_WAITING_EXTERNAL'
    }
  });
});

export const assertCheckinDemoResetOptIn = (confirmation) => {
  if (confirmation !== CHECKIN_DEMO_RESET_CONFIRMATION) {
    throw new Error(`Refusing to reset Checkin demo data without --confirm=${CHECKIN_DEMO_RESET_CONFIRMATION}`);
  }

  return true;
};

export const buildCheckinDemoCleanupSelectors = ({ hotelId }) => {
  if (!hotelId) {
    throw new Error('hotelId is required for Checkin demo cleanup selectors');
  }

  const plan = buildCheckinDemoFixturePlan({ hotelId });
  return [
    { table: 'messages', hotelId, by: 'conversation_ids_from_demo_guests' },
    { table: 'tickets', hotelId, by: 'conversation_ids_from_demo_guests' },
    { table: 'conversation_ai_state', hotelId, by: 'conversation_ids_from_demo_guests' },
    { table: 'scheduled_messages', hotelId, by: 'reservation_ids_or_fixture_metadata' },
    { table: 'conversations', hotelId, by: 'guest_ids_from_demo_phones' },
    { table: 'guest_stay_context', hotelId, by: 'reservation_ids_or_guest_ids' },
    { table: 'room_status_snapshots', hotelId, by: 'known_demo_room_numbers' },
    { table: 'hotel_occupancy_snapshots', hotelId, by: 'fixture_snapshot_date' },
    { table: 'hotel_rooms', hotelId, by: 'source_checkin_demo' },
    { table: 'hotel_knowledge', hotelId, by: 'known_demo_knowledge_keys', keys: plan.knowledge.map((item) => item.key) },
    { table: 'reservations', hotelId, by: 'pms_provider_and_known_pms_reservation_ids' },
    { table: 'guests', hotelId, by: 'known_demo_phone_numbers' }
  ];
};

const isMissingHotelIdentityColumn = (error) => (
  error?.message?.includes('slug')
  || error?.message?.includes('workspace_slug')
  || error?.details?.includes('slug')
  || error?.details?.includes('workspace_slug')
  || error?.hint?.includes('slug')
  || error?.hint?.includes('workspace_slug')
);

const isMissingHotelDemoColumn = (error) => [
  'brand_name',
  'timezone',
  'default_language',
  'check_in_time',
  'check_out_time',
  'description',
  'updated_at'
].some((column) => (
  error?.message?.includes(column)
  || error?.details?.includes(column)
  || error?.hint?.includes(column)
));

const isMissingCanonicalHotelAiSwitchColumn = (error) => (
  error?.message?.includes('ai_auto_reply_enabled')
  || error?.details?.includes('ai_auto_reply_enabled')
  || error?.hint?.includes('ai_auto_reply_enabled')
);

const canonicalHotelAiSwitchColumnError = () => new Error(
  'hotels.ai_auto_reply_enabled column is required for the Checkin demo AI Kill Switch. Apply supabase/sql/add_hotel_ai_auto_reply_enabled.sql before resetting demo data.'
);

const CHECKIN_DEMO_OPTIONAL_TABLES = Object.freeze({
  guest_stay_context: {
    rowKey: 'stayContexts',
    requiredRows: 10,
    unavailableMessage: 'Guest stay context table is not available in this environment; demo readiness uses core reservations and guests.'
  },
  room_status_snapshots: {
    rowKey: 'roomStatusSnapshots',
    requiredRows: 10,
    unavailableMessage: 'Room status snapshots table is not available in this environment; demo readiness uses core room assignment data.'
  },
  hotel_occupancy_snapshots: {
    rowKey: 'occupancySnapshots',
    requiredRows: 1,
    unavailableMessage: 'Hotel occupancy snapshots table is not available in this environment; demo readiness uses core reservation data.'
  }
});

const optionalTableResult = ({
  table,
  rows = [],
  status = 'AVAILABLE',
  message = null
} = {}) => {
  const config = CHECKIN_DEMO_OPTIONAL_TABLES[table] || {};
  const available = status !== 'NOT_AVAILABLE';
  const rowCount = rows.length;
  const dataReady = rowCount >= (config.requiredRows || 1);

  return {
    table,
    status,
    requirement: 'OPTIONAL',
    available,
    rows: rowCount,
    requiredRows: config.requiredRows || 1,
    ready: available ? dataReady : true,
    blocking: available ? !dataReady : false,
    message: message || (available
      ? dataReady
        ? 'Optional demo capability is available and populated.'
        : 'Optional demo capability is available but not fully populated.'
      : config.unavailableMessage || 'Optional demo table is not available in this environment.')
  };
};

const resolveCheckinHotelBy = async ({ supabase, column, value }) => {
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingHotelIdentityColumn(error)) {
      return null;
    }

    throw error;
  }

  return data || null;
};

export const resolveCheckinDemoHotel = async ({ supabase = getSupabase() } = {}) => {
  const bySlug = await resolveCheckinHotelBy({
    supabase,
    column: 'slug',
    value: CHECKIN_DEMO_HOTEL.slug
  });
  if (bySlug) return bySlug;

  const byWorkspaceSlug = await resolveCheckinHotelBy({
    supabase,
    column: 'workspace_slug',
    value: CHECKIN_DEMO_HOTEL.slug
  });
  if (byWorkspaceSlug) return byWorkspaceSlug;

  return resolveCheckinHotelBy({
    supabase,
    column: 'name',
    value: CHECKIN_DEMO_HOTEL.name
  });
};

export const assertCheckinDemoHotelTarget = (hotel) => {
  const slugMatch = [hotel?.slug, hotel?.workspace_slug].includes(CHECKIN_DEMO_HOTEL.slug);
  const nameMatch = String(hotel?.name || '').trim().toLowerCase() === CHECKIN_DEMO_HOTEL.name.toLowerCase();

  if (!hotel?.id || (!slugMatch && !nameMatch)) {
    throw new Error(`Refusing Checkin demo operation outside ${CHECKIN_DEMO_HOTEL.name}`);
  }

  return true;
};

const safeSelectRows = async ({ table, apply, supabase = getSupabase() }) => {
  try {
    const { data, error } = await apply(supabase.from(table).select('*'));

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping select', {
        table,
        error: error.message
      });
      return [];
    }

    throw error;
  }
};

const safeOptionalSelectRows = async ({ table, apply, supabase = getSupabase() }) => {
  try {
    const { data, error } = await apply(supabase.from(table).select('*'));

    if (error) {
      throw error;
    }

    const rows = data || [];
    return {
      rows,
      status: optionalTableResult({
        table,
        rows
      })
    };
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping select', {
        table,
        error: error.message
      });

      return {
        rows: [],
        status: optionalTableResult({
          table,
          rows: [],
          status: 'NOT_AVAILABLE'
        })
      };
    }

    throw error;
  }
};

const safeOptionalUpsert = async ({ table, rows, onConflict, select = '*', supabase = getSupabase() }) => {
  try {
    const query = supabase.from(table).upsert(rows, { onConflict });
    const { data, error } = await query.select(select);

    if (error) {
      throw error;
    }

    const resultRows = data || [];
    return {
      rows: resultRows,
      status: optionalTableResult({
        table,
        rows: resultRows
      })
    };
  } catch (error) {
    if (isMissingOptionalTable(error)) {
      logger.warn('Demo data optional table unavailable; skipping optional upsert', {
        table,
        error: error.message
      });

      return {
        rows: [],
        status: optionalTableResult({
          table,
          rows: [],
          status: 'NOT_AVAILABLE'
        })
      };
    }

    throw error;
  }
};

const updateCheckinDemoHotel = async ({ supabase, hotel, plan }) => {
  const nowIso = new Date().toISOString();
  const richUpdate = {
    brand_name: plan.hotel.brand_name,
    timezone: plan.hotel.timezone,
    default_language: plan.hotel.default_language,
    check_in_time: plan.hotel.check_in_time,
    check_out_time: plan.hotel.check_out_time,
    description: plan.hotel.description,
    ai_auto_reply_enabled: plan.hotel.ai_auto_reply_enabled,
    updated_at: nowIso
  };
  const { data, error } = await supabase
    .from('hotels')
    .update(richUpdate)
    .eq('id', hotel.id)
    .select('*')
    .single();

  if (!error) {
    return data;
  }

  if (isMissingCanonicalHotelAiSwitchColumn(error)) {
    throw canonicalHotelAiSwitchColumnError();
  }

  if (!isMissingHotelIdentityColumn(error) && !isMissingHotelDemoColumn(error) && !isMissingOptionalTable(error)) {
    throw error;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('hotels')
    .update({
      ai_auto_reply_enabled: plan.hotel.ai_auto_reply_enabled,
      updated_at: nowIso
    })
    .eq('id', hotel.id)
    .select('*')
    .single();

  if (fallbackError) {
    if (isMissingCanonicalHotelAiSwitchColumn(fallbackError)) {
      throw canonicalHotelAiSwitchColumnError();
    }

    throw fallbackError;
  }

  return fallbackData;
};

const clearExistingCheckinDemoData = async ({ supabase, hotelId, plan }) => {
  const guestPhones = plan.guests.map((guest) => guest.phone_number);
  const pmsReservationIds = plan.reservations.map((reservation) => reservation.pms_reservation_id);
  const roomNumbers = plan.rooms.map((room) => room.room_number);
  const knowledgeKeys = plan.knowledge.map((entry) => entry.key);
  const snapshotDates = plan.occupancySnapshots.map((snapshot) => snapshot.date);
  const guests = await safeSelectRows({
    table: 'guests',
    supabase,
    apply: (query) => query.eq('hotel_id', hotelId).in('phone_number', guestPhones)
  });
  const guestIds = guests.map((guest) => guest.id).filter(Boolean);
  const reservations = await safeSelectRows({
    table: 'reservations',
    supabase,
    apply: (query) => query
      .eq('hotel_id', hotelId)
      .eq('pms_provider', CHECKIN_DEMO_PMS_PROVIDER)
      .in('pms_reservation_id', pmsReservationIds)
  });
  const reservationIds = reservations.map((reservation) => reservation.id).filter(Boolean);
  const conversations = guestIds.length
    ? await safeSelectRows({
        table: 'conversations',
        supabase,
        apply: (query) => query.eq('hotel_id', hotelId).in('guest_id', guestIds)
      })
    : [];
  const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean);

  if (conversationIds.length) {
    await safeDelete({ table: 'messages', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('conversation_id', conversationIds) });
    await safeDelete({ table: 'tickets', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('conversation_id', conversationIds) });
    await safeDelete({ table: 'conversation_ai_state', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('conversation_id', conversationIds) });
    await safeDelete({ table: 'scheduled_messages', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('conversation_id', conversationIds) });
    await safeDelete({ table: 'conversations', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('id', conversationIds) });
  }

  if (reservationIds.length) {
    await safeDelete({ table: 'scheduled_messages', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('reservation_id', reservationIds) });
    await safeDelete({ table: 'guest_stay_context', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('reservation_id', reservationIds) });
    await safeDelete({ table: 'reservations', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('id', reservationIds) });
  }

  if (guestIds.length) {
    await safeDelete({ table: 'guest_stay_context', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('guest_id', guestIds) });
    await safeDelete({ table: 'guests', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('id', guestIds) });
  }

  await safeDelete({ table: 'room_status_snapshots', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('room_number', roomNumbers) });
  await safeDelete({ table: 'hotel_occupancy_snapshots', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('date', snapshotDates) });
  await safeDelete({ table: 'hotel_rooms', supabase, apply: (query) => query.eq('hotel_id', hotelId).eq('source', CHECKIN_DEMO_SOURCE) });
  await safeDelete({ table: 'hotel_knowledge', supabase, apply: (query) => query.eq('hotel_id', hotelId).in('key', knowledgeKeys) });
};

const upsertCheckinDemoGuests = async ({ supabase, plan }) => {
  const rows = plan.guests.map(({ key: _key, metadata: _metadata, ...guest }) => guest);
  const guests = await safeUpsert({
    table: 'guests',
    rows,
    onConflict: 'hotel_id,phone_number',
    supabase
  });
  const guestByPhone = new Map(guests.map((guest) => [guest.phone_number, guest]));
  return new Map(plan.guests.map((guest) => [
    guest.key,
    guestByPhone.get(guest.phone_number) || { ...guest, id: `guest-${guest.key}` }
  ]));
};

const upsertCheckinDemoReservations = async ({ supabase, plan, guestByKey }) => {
  const rows = plan.reservations.map((reservation) => checkinDemoReservationRecord({
    ...reservation,
    guest_id: guestByKey.get(reservation.key)?.id || null
  }));
  const reservations = await safeUpsert({
    table: 'reservations',
    rows,
    onConflict: 'pms_provider,pms_reservation_id',
    supabase
  });
  const reservationByPmsId = new Map(reservations.map((reservation) => [reservation.pms_reservation_id, reservation]));
  return new Map(plan.reservations.map((reservation) => [
    reservation.key,
    reservationByPmsId.get(reservation.pms_reservation_id) || { ...reservation, id: `reservation-${reservation.key}` }
  ]));
};

const upsertCheckinDemoRooms = async ({ supabase, plan }) => {
  const rows = plan.rooms.map(({ key: _key, ...room }) => room);
  return safeUpsert({
    table: 'hotel_rooms',
    rows,
    onConflict: 'hotel_id,room_number',
    supabase
  });
};

const upsertCheckinDemoOperationalContext = async ({ supabase, plan, guestByKey, reservationByKey }) => {
  const roomStatusResult = await safeOptionalUpsert({
    table: 'room_status_snapshots',
    onConflict: 'hotel_id,room_number',
    supabase,
    rows: plan.roomStatusSnapshots.map(({ key, ...snapshot }) => {
      const assignment = CHECKIN_DEMO_RESERVATIONS.find((definition) => definition.roomNumber === snapshot.room_number);
      const reservation = assignment ? reservationByKey.get(assignment.key) : null;
      const guest = assignment ? guestByKey.get(assignment.key) : null;
      return {
        ...snapshot,
        current_guest_id: ['occupied', 'departing'].includes(snapshot.occupancy_status) ? guest?.id || null : null,
        current_reservation_id: ['occupied', 'departing'].includes(snapshot.occupancy_status) ? reservation?.id || null : null
      };
    })
  });

  const occupancyResult = await safeOptionalUpsert({
    table: 'hotel_occupancy_snapshots',
    onConflict: 'hotel_id,date',
    supabase,
    rows: plan.occupancySnapshots
  });

  const stayContextResult = await safeOptionalUpsert({
    table: 'guest_stay_context',
    onConflict: 'reservation_id',
    supabase,
    rows: plan.stayContexts.map(({ key: _key, guest_key, reservation_key, ...context }) => ({
      ...context,
      guest_id: guestByKey.get(guest_key)?.id || null,
      reservation_id: reservationByKey.get(reservation_key)?.id || null
    }))
  });

  return {
    optionalTables: {
      guest_stay_context: stayContextResult.status,
      room_status_snapshots: roomStatusResult.status,
      hotel_occupancy_snapshots: occupancyResult.status
    }
  };
};

const upsertCheckinDemoKnowledge = async ({ supabase, plan }) => {
  const existing = await safeSelectRows({
    table: 'hotel_knowledge',
    supabase,
    apply: (query) => query.eq('hotel_id', plan.hotel.id).in('key', plan.knowledge.map((entry) => entry.key))
  });
  const existingByKey = new Map(existing.map((entry) => [entry.key, entry.id]));

  for (const entry of plan.knowledge) {
    const { metadata: _metadata, ...record } = entry;
    const existingId = existingByKey.get(entry.key);
    const query = existingId
      ? supabase.from('hotel_knowledge').update(record).eq('id', existingId)
      : supabase.from('hotel_knowledge').insert(record);
    const { error } = await query;

    if (error) {
      throw error;
    }
  }
};

const createCheckinDemoConversations = async ({ supabase, plan, guestByKey }) => {
  const conversationRows = plan.conversations.map((conversation) => ({
    hotel_id: conversation.hotel_id,
    guest_id: guestByKey.get(conversation.guest_key)?.id || null,
    status: conversation.status,
    last_message_at: conversation.last_message_at,
    created_at: conversation.created_at
  }));
  const conversations = await safeInsert({
    table: 'conversations',
    rows: conversationRows,
    supabase
  });
  const conversationByKey = new Map(plan.conversations.map((conversation, index) => [conversation.key, conversations[index] || { ...conversation, id: `conversation-${conversation.key}` }]));
  const messageRows = plan.conversations.flatMap((conversation) => (
    conversation.messages.map((message) => ({
      ...message,
      hotel_id: conversation.hotel_id,
      conversation_id: conversationByKey.get(conversation.key)?.id
    }))
  ));

  await safeInsert({
    table: 'messages',
    rows: messageRows,
    supabase
  });

  await safeUpsert({
    table: 'conversation_ai_state',
    onConflict: 'conversation_id',
    supabase,
    rows: plan.conversations.map((conversation) => ({
      ...conversation.ai_state,
      conversation_id: conversationByKey.get(conversation.key)?.id
    }))
  });

  return conversationByKey;
};

const createCheckinDemoTickets = async ({ supabase, plan, guestByKey, conversationByKey }) => safeInsert({
  table: 'tickets',
  supabase,
  rows: plan.tickets.map(({ key: _key, guest_key, conversation_key, metadata: _metadata, ...ticket }) => ({
    ...ticket,
    guest_id: guestByKey.get(guest_key)?.id || null,
    conversation_id: conversationByKey.get(conversation_key)?.id || null
  }))
});

const createCheckinDemoScheduledPreviews = async ({ supabase, plan, guestByKey, reservationByKey, conversationByKey, now }) => {
  const previewRows = buildCheckinDemoScheduledPreviewRows({
    plan,
    now,
    reservationByKey,
    guestByKey,
    conversationByKey
  }).map(({ key: _key, reservation_key: _reservationKey, guest_key: _guestKey, conversation_key: _conversationKey, ...row }) => row);

  return safeInsert({
    table: 'scheduled_messages',
    rows: previewRows,
    supabase
  });
};

export const seedCheckinDemoScenario = async ({
  confirm,
  supabase = getSupabase(),
  now = new Date()
} = {}) => {
  assertCheckinDemoResetOptIn(confirm);

  if (process.env.SEND_AUTOMATIONS === 'true') {
    throw new Error('Refusing Checkin demo seed while SEND_AUTOMATIONS=true');
  }

  const hotel = await resolveCheckinDemoHotel({ supabase });
  assertCheckinDemoHotelTarget(hotel);

  const plan = buildCheckinDemoFixturePlan({
    hotelId: hotel.id,
    now
  });

  await clearExistingCheckinDemoData({ supabase, hotelId: hotel.id, plan });
  const demoHotel = await updateCheckinDemoHotel({ supabase, hotel, plan });
  const guestByKey = await upsertCheckinDemoGuests({ supabase, plan });
  const reservationByKey = await upsertCheckinDemoReservations({ supabase, plan, guestByKey });
  await upsertCheckinDemoRooms({ supabase, plan });
  const operationalContext = await upsertCheckinDemoOperationalContext({ supabase, plan, guestByKey, reservationByKey });
  await upsertCheckinDemoKnowledge({ supabase, plan });
  const conversationByKey = await createCheckinDemoConversations({ supabase, plan, guestByKey });
  const tickets = await createCheckinDemoTickets({ supabase, plan, guestByKey, conversationByKey });
  const scheduledMessages = await createCheckinDemoScheduledPreviews({
    supabase,
    plan,
    guestByKey,
    reservationByKey,
    conversationByKey,
    now
  });

  return {
    hotel: {
      id: demoHotel.id,
      name: demoHotel.name,
      slug: demoHotel.slug || CHECKIN_DEMO_HOTEL.slug
    },
    fixture: CHECKIN_DEMO_FIXTURE_MARKER,
    reservations: reservationByKey.size,
    rooms: plan.rooms.length,
    conversations: conversationByKey.size,
    tickets: tickets.length || plan.tickets.length,
    knowledge: plan.knowledge.length,
    scheduledPreviews: scheduledMessages.length || plan.journeys.length,
    optionalTables: operationalContext.optionalTables,
    guestMemory: 'OFF',
    providerTraffic: 'NONE',
    ubikos: plan.ubikos.state
  };
};

const allCheckinDemoJourneysReady = (scheduledMessages = []) => {
  const ready = new Set(scheduledMessages
    .filter((message) => message.status === OPERATIONAL_STATUSES.PREVIEW)
    .filter((message) => message.send_to === null || message.send_to === undefined)
    .map((message) => message.metadata?.journey_id)
    .filter(Boolean));

  return PILOT_JOURNEY_CERTIFICATION.every((row) => ready.has(row.id));
};

export const buildCheckinDemoPreflightReport = ({
  hotel = null,
  rows = {},
  env = process.env,
  tableAvailability = {}
} = {}) => {
  const plan = buildCheckinDemoFixturePlan({
    hotelId: hotel?.id || 'hotel-demo-checkin-fixture'
  });
  const optionalTables = Object.fromEntries(
    Object.entries(CHECKIN_DEMO_OPTIONAL_TABLES).map(([table, config]) => {
      const provided = tableAvailability[table] || {};
      return [table, optionalTableResult({
        table,
        rows: rows[config.rowKey] || [],
        status: provided.status || 'AVAILABLE',
        message: provided.message || null
      })];
    })
  );
  const hotelAiStatus = getHotelAiAutoReplyStatus(hotel || {});
  const checks = {
    hotel_exists: Boolean(hotel?.id),
    target_is_hotel_demo_checkin: (() => {
      try {
        assertCheckinDemoHotelTarget(hotel);
        return true;
      } catch {
        return false;
      }
    })(),
    reservations_ready: (rows.reservations || []).length >= 10,
    rooms_ready: (rows.rooms || []).length >= 10,
    conversations_ready: (rows.conversations || []).length >= 5,
    messages_ready: (rows.messages || []).length >= 10,
    tickets_ready: (rows.tickets || []).length >= 4,
    knowledge_ready: (rows.knowledge || []).length >= 15,
    stay_context_ready: optionalTables.guest_stay_context.ready,
    room_status_ready: optionalTables.room_status_snapshots.ready,
    occupancy_snapshot_ready: optionalTables.hotel_occupancy_snapshots.ready,
    four_pilot_journeys_ready: allCheckinDemoJourneysReady(rows.scheduledMessages || []),
    scheduled_previews_only: (rows.scheduledMessages || []).every((message) => (
      message.status === OPERATIONAL_STATUSES.PREVIEW
      && (message.send_to === null || message.send_to === undefined)
      && message.metadata?.live_sending_disabled === true
    )),
    send_automations_false: env.SEND_AUTOMATIONS !== 'true',
    guest_memory_off: env.GUEST_MEMORY_ENABLED !== 'true',
    human_takeover_ready: (rows.conversationStates || []).some((state) => state.state_metadata?.conversation_ai_mode === 'human_takeover'),
    return_to_ai_ready: (rows.conversationStates || []).some((state) => state.state_metadata?.conversation_ai_mode === 'ai_active'),
    kill_switch_ready: hotelAiStatus.configured && hotelAiStatus.valid !== false,
    ubikos_demo_state_ready: !(rows.pmsConnections || []).some((connection) => (
      connection.provider === 'ubikos'
      && connection.enabled === true
      && ['healthy', 'active', 'connected'].includes(String(connection.sync_status || '').toLowerCase())
    )),
    no_real_provider_traffic: (rows.scheduledMessages || []).every((message) => !message.send_to)
  };
  const optionalBlockingFailures = Object.values(optionalTables).filter((table) => table.blocking);
  const readyForPilotDemo = Object.values(checks).every(Boolean);

  return {
    hotel: hotel ? {
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug || hotel.workspace_slug || null
    } : null,
    fixture: CHECKIN_DEMO_FIXTURE_MARKER,
    checks,
    counts: {
      reservations: (rows.reservations || []).length,
      rooms: (rows.rooms || []).length,
      conversations: (rows.conversations || []).length,
      messages: (rows.messages || []).length,
      tickets: (rows.tickets || []).length,
      knowledge: (rows.knowledge || []).length,
      stayContexts: (rows.stayContexts || []).length,
      roomStatusSnapshots: (rows.roomStatusSnapshots || []).length,
      occupancySnapshots: (rows.occupancySnapshots || []).length,
      scheduledPreviews: (rows.scheduledMessages || []).length,
      conversationStates: (rows.conversationStates || []).length,
      pmsConnections: (rows.pmsConnections || []).length
    },
    optionalTables,
    optionalBlockingFailures,
    readiness: readyForPilotDemo ? 'READY_TO_SEED_DEMO' : 'BLOCKED',
    readyForPilotDemo,
    readyForLiveAutomations: false,
    liveSendBlockers: plan.pilotHealth.liveSendBlockers,
    hotelAiKillSwitch: hotelAiStatus,
    ubikos: {
      state: plan.ubikos.state,
      liveConnected: false,
      realWrites: false
    },
    productionDataSeeded: false
  };
};

export const getCheckinDemoPreflight = async ({
  supabase = getSupabase(),
  env = process.env
} = {}) => {
  const hotel = await resolveCheckinDemoHotel({ supabase });
  assertCheckinDemoHotelTarget(hotel);
  const plan = buildCheckinDemoFixturePlan({ hotelId: hotel.id });
  const reservations = await safeSelectRows({
    table: 'reservations',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).eq('pms_provider', CHECKIN_DEMO_PMS_PROVIDER)
  });
  const guests = await safeSelectRows({
    table: 'guests',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).in('phone_number', plan.guests.map((guest) => guest.phone_number))
  });
  const guestIds = guests.map((guest) => guest.id).filter(Boolean);
  const conversations = guestIds.length
    ? await safeSelectRows({
        table: 'conversations',
        supabase,
        apply: (query) => query.eq('hotel_id', hotel.id).in('guest_id', guestIds)
      })
    : [];
  const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean);
  const messages = conversationIds.length
    ? await safeSelectRows({
        table: 'messages',
        supabase,
        apply: (query) => query.eq('hotel_id', hotel.id).in('conversation_id', conversationIds)
      })
    : [];
  const tickets = conversationIds.length
    ? await safeSelectRows({
        table: 'tickets',
        supabase,
        apply: (query) => query.eq('hotel_id', hotel.id).in('conversation_id', conversationIds)
      })
    : [];
  const conversationStates = conversationIds.length
    ? await safeSelectRows({
        table: 'conversation_ai_state',
        supabase,
        apply: (query) => query.eq('hotel_id', hotel.id).in('conversation_id', conversationIds)
      })
    : [];
  const scheduledMessages = await safeSelectRows({
    table: 'scheduled_messages',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).contains('metadata', { fixture: CHECKIN_DEMO_FIXTURE_MARKER })
  });
  const knowledge = await safeSelectRows({
    table: 'hotel_knowledge',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).in('key', plan.knowledge.map((entry) => entry.key))
  });
  const rooms = await safeSelectRows({
    table: 'hotel_rooms',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).eq('source', CHECKIN_DEMO_SOURCE)
  });
  const stayContextsResult = await safeOptionalSelectRows({
    table: 'guest_stay_context',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id)
  });
  const roomStatusSnapshotsResult = await safeOptionalSelectRows({
    table: 'room_status_snapshots',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).in('room_number', plan.rooms.map((room) => room.room_number))
  });
  const occupancySnapshotsResult = await safeOptionalSelectRows({
    table: 'hotel_occupancy_snapshots',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id).in('date', plan.occupancySnapshots.map((snapshot) => snapshot.date))
  });
  const pmsConnections = await safeSelectRows({
    table: 'hotel_pms_connections',
    supabase,
    apply: (query) => query.eq('hotel_id', hotel.id)
  });

  return buildCheckinDemoPreflightReport({
    hotel,
    env,
    rows: {
      reservations,
      guests,
      conversations,
      messages,
      tickets,
      conversationStates,
      scheduledMessages,
      knowledge,
      rooms,
      stayContexts: stayContextsResult.rows,
      roomStatusSnapshots: roomStatusSnapshotsResult.rows,
      occupancySnapshots: occupancySnapshotsResult.rows,
      pmsConnections
    },
    tableAvailability: {
      guest_stay_context: stayContextsResult.status,
      room_status_snapshots: roomStatusSnapshotsResult.status,
      hotel_occupancy_snapshots: occupancySnapshotsResult.status
    }
  });
};

export const createGuestProfiles = async ({ hotelId, scenarios = demoScenarios } = {}) => {
  const guests = [];

  for (const scenario of scenarios) {
    guests.push(await findOrCreateGuest({ hotelId, scenario }));
  }

  return guests;
};

export const createDemoConversations = async ({ hotelId, guestByScenario }) => {
  const conversations = [];

  for (const [index, scenario] of demoScenarios.entries()) {
    conversations.push(await recreateConversation({
      hotelId,
      guest: guestByScenario.get(scenario.key),
      scenario,
      offset: -((demoScenarios.length - index) * 8)
    }));
  }

  return conversations;
};

export const createDemoTickets = async ({ hotelId, guestByScenario, conversationByScenario }) => {
  const tickets = [];

  for (const scenario of demoScenarios) {
    const ticket = await createDemoTicket({
      hotelId,
      guest: guestByScenario.get(scenario.key),
      conversation: conversationByScenario.get(scenario.key),
      scenario
    });

    if (ticket) {
      tickets.push(ticket);
    }
  }

  return tickets;
};

export const createDemoUpsells = async ({ hotelId, guestByScenario, reservationByScenario, conversationByScenario }) => {
  const results = [];

  for (const scenario of demoScenarios) {
    results.push(await createDemoUpsellRevenue({
      hotelId,
      guest: guestByScenario.get(scenario.key),
      reservation: reservationByScenario.get(scenario.key),
      conversation: conversationByScenario.get(scenario.key),
      scenario
    }));
  }

  return results.filter((item) => item.upsell || item.offer || item.conversion);
};

export const createDemoRevenue = createDemoUpsells;

export const createDemoAutomations = async ({ hotelId, guestByScenario, reservationByScenario, conversationByScenario }) => {
  for (const scenario of demoScenarios) {
    await createDemoScheduledMessages({
      hotelId,
      guest: guestByScenario.get(scenario.key),
      reservation: reservationByScenario.get(scenario.key),
      conversation: conversationByScenario.get(scenario.key),
      scenario
    });
  }
};

export const createDemoGuestMemory = async ({ hotelId, guestByScenario }) => {
  for (const scenario of demoScenarios) {
    await createDemoMemoryAndSignals({
      hotelId,
      guest: guestByScenario.get(scenario.key),
      scenario
    });
  }
};

export const createLuxuryHotelDemoData = async ({
  hotelId = null,
  clean = true,
  applyHotelBranding = true
} = {}) => {
  const hotel = hotelId ? await getHotelById(hotelId) : await getDefaultHotel();

  if (!hotel?.id) {
    throw new Error('Hotel is required to create demo data');
  }

  logger.info('Commercial demo data generation started', {
    hotelId: hotel.id,
    clean,
    applyHotelBranding
  });

  if (clean) {
    await clearExistingDemoData({ hotelId: hotel.id });
  }

  const demoHotel = applyHotelBranding ? await updateHotelForDemo(hotel.id) : hotel;
  await upsertKnowledgeBase(hotel.id);
  const guests = await createGuestProfiles({ hotelId: hotel.id });
  const guestByScenario = new Map(demoScenarios.map((scenario, index) => [scenario.key, guests[index]]));
  const reservationByScenario = new Map();

  for (const scenario of demoScenarios) {
    reservationByScenario.set(scenario.key, await createDemoReservation({
      hotelId: hotel.id,
      guest: guestByScenario.get(scenario.key),
      scenario
    }));
  }

  const conversationResults = await createDemoConversations({ hotelId: hotel.id, guestByScenario });
  const conversationByScenario = new Map(demoScenarios.map((scenario, index) => [
    scenario.key,
    conversationResults[index].conversation
  ]));
  const messagesByScenario = new Map(demoScenarios.map((scenario, index) => [
    scenario.key,
    conversationResults[index].messages
  ]));
  const tickets = await createDemoTickets({ hotelId: hotel.id, guestByScenario, conversationByScenario });
  const upsells = await createDemoUpsells({
    hotelId: hotel.id,
    guestByScenario,
    reservationByScenario,
    conversationByScenario
  });

  await createDemoAutomations({
    hotelId: hotel.id,
    guestByScenario,
    reservationByScenario,
    conversationByScenario
  });
  await createDemoGuestMemory({ hotelId: hotel.id, guestByScenario });

  for (const scenario of demoScenarios) {
    await createDemoAiLogs({
      hotelId: hotel.id,
      guest: guestByScenario.get(scenario.key),
      conversation: conversationByScenario.get(scenario.key),
      messages: messagesByScenario.get(scenario.key) || [],
      ticket: tickets.find((ticket) => ticket.guest_id === guestByScenario.get(scenario.key)?.id) || null,
      upsell: upsells.find((item) => item.upsell?.guest_id === guestByScenario.get(scenario.key)?.id)?.upsell || null,
      scenario
    });
  }

  const summary = {
    hotel: demoHotel,
    scenarios: demoScenarios.map((scenario) => scenario.key),
    guests: guests.length,
    reservations: reservationByScenario.size,
    conversations: conversationByScenario.size,
    tickets: tickets.length,
    upsells: upsells.filter((item) => item.upsell).length,
    revenueOpportunities: upsells.filter((item) => item.conversion).length
  };

  logger.info('Commercial demo data generation completed', summary);

  return summary;
};
