import { getSupabase } from './supabase.service.js';
import { getDefaultHotel, getHotelById } from './hotel.service.js';
import { createOrUpdateReservation } from './reservation.service.js';
import { scheduleReservationAutomations } from './automation.service.js';
import { getDefaultUpsellAmount } from './revenue.service.js';
import { createAiLog } from './ai-log.service.js';
import { logger } from '../utils/logger.js';

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
  || error?.details?.includes('guest_ai_profiles')
  || error?.details?.includes('guest_ai_tags')
  || error?.details?.includes('guest_ai_insights')
  || error?.details?.includes('ai_offers')
  || error?.details?.includes('ai_upsells')
  || error?.details?.includes('upsell_conversions')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('guest_memory')
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

const safeInsert = async ({ table, rows, select = '*' }) => {
  try {
    const { data, error } = await getSupabase()
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

const safeUpsert = async ({ table, rows, onConflict, select = '*' }) => {
  try {
    const query = getSupabase().from(table).upsert(rows, { onConflict });
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

const safeDelete = async ({ table, apply }) => {
  try {
    const { error } = await apply(getSupabase().from(table).delete());

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
    await client.from('messages').delete().in('conversation_id', conversationIds);
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
        send_to: guest.phone_number,
        language: scenario.language,
        message_preview: `Hi ${scenario.name.split(' ')[0]}, we are looking forward to welcoming you soon. Need transfer, parking or recommendations?`,
        status: 'scheduled',
        ai_provider: 'demo',
        ai_model: 'commercial-showcase',
        metadata: {
          demo: true,
          scenario: scenario.key
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
        send_to: guest.phone_number,
        language: scenario.language,
        message_preview: `Thank you for staying with us, ${scenario.name.split(' ')[0]}. We would love to hear about your experience.`,
        status: 'scheduled',
        ai_provider: 'demo',
        ai_model: 'commercial-showcase',
        metadata: {
          demo: true,
          scenario: scenario.key
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
    await client.from('messages').delete().in('conversation_id', conversationIds);
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
    await safeDelete({ table: 'guest_memory', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_profiles', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_tags', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_insights', apply: (query) => query.in('guest_id', guestIds) });
    await safeDelete({ table: 'guest_ai_actions', apply: (query) => query.in('guest_id', guestIds) });
  }
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
