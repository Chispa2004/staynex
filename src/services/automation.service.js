import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';
import { getHotelProfileForPrompt } from './hotel.service.js';
import { getGuestMemory, formatGuestMemoryForPrompt } from './guest-memory.service.js';
import { getKnowledgeForHotel } from './knowledge.service.js';

const addDays = (dateValue, days) => {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

export const AUTOMATION_TYPES = {
  PRE_ARRIVAL_7D: 'pre_arrival_7d',
  PRE_ARRIVAL_1D: 'pre_arrival_1d',
  IN_STAY_UPSELL: 'in_stay_upsell',
  POST_STAY_REVIEW: 'post_stay_review'
};

const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

const isMissingAutomationTables = (error) => (
  error?.message?.includes('automation_rules')
  || error?.message?.includes('scheduled_messages')
  || error?.details?.includes('automation_rules')
  || error?.details?.includes('scheduled_messages')
  || error?.hint?.includes('automation_rules')
  || error?.hint?.includes('scheduled_messages')
);

const getOpenAiModel = () => process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

const getOpenAiClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 15000)
  });
};

const normalizeLanguage = (value) => ['es', 'en', 'fr', 'de'].includes(value) ? value : 'es';

const getDateAtNoon = (dateValue) => dateValue ? `${dateValue}T12:00:00.000Z` : null;

const automationDateForReservation = (reservation, automationType) => {
  if (automationType === AUTOMATION_TYPES.PRE_ARRIVAL_7D) {
    return addDays(reservation.arrival_date, -7);
  }

  if (automationType === AUTOMATION_TYPES.PRE_ARRIVAL_1D) {
    return addDays(reservation.arrival_date, -1);
  }

  if (automationType === AUTOMATION_TYPES.IN_STAY_UPSELL) {
    return getDateAtNoon(reservation.arrival_date);
  }

  if (automationType === AUTOMATION_TYPES.POST_STAY_REVIEW) {
    return addDays(reservation.departure_date, 1);
  }

  return null;
};

const fallbackTemplate = ({ automationType, reservation, hotel, language = 'es', upsells = [] }) => {
  const guestName = reservation.guest_name || '';
  const hotelName = hotel?.name || 'el hotel';
  const firstName = guestName.split(' ')[0] || '';
  const prefix = firstName ? `${firstName}, ` : '';
  const topUpsell = upsells[0]?.suggested_message || null;
  const templates = {
    pre_arrival_7d: {
      es: `Hola ${prefix}estamos deseando recibirte en ${hotelName}. Si necesitas transfer, parking o alguna recomendacion antes de tu llegada, estamos aqui para ayudarte.`,
      en: `Hi ${prefix}we are looking forward to welcoming you to ${hotelName}. If you need a transfer, parking or recommendations before arrival, we are here to help.`,
      fr: `Bonjour ${prefix}nous avons hate de vous accueillir a ${hotelName}. Si vous avez besoin d un transfert, parking ou recommandations avant votre arrivee, nous sommes la pour vous aider.`,
      de: `Hallo ${prefix}wir freuen uns, Sie bald im ${hotelName} zu begrussen. Wenn Sie Transfer, Parkplatz oder Empfehlungen vor der Anreise brauchen, helfen wir gern.`
    },
    pre_arrival_1d: {
      es: `Hola ${prefix}tu llegada es manana. Puedes escribirnos por este chat para cualquier cosa que necesites antes de llegar.`,
      en: `Hi ${prefix}your arrival is tomorrow. You can message us here for anything you need before you arrive.`,
      fr: `Bonjour ${prefix}votre arrivee est demain. Vous pouvez nous ecrire ici pour toute demande avant votre arrivee.`,
      de: `Hallo ${prefix}Ihre Anreise ist morgen. Sie koennen uns hier schreiben, wenn Sie vor der Ankunft etwas brauchen.`
    },
    in_stay_upsell: {
      es: topUpsell || `Hola ${prefix}esperamos que estes disfrutando de tu estancia. Si necesitas reservar restaurante, spa o late checkout, podemos ayudarte desde aqui.`,
      en: topUpsell || `Hi ${prefix}we hope you are enjoying your stay. If you need restaurant, spa or late checkout assistance, we can help here.`,
      fr: topUpsell || `Bonjour ${prefix}nous esperons que votre sejour se passe bien. Si vous souhaitez restaurant, spa ou late checkout, nous pouvons vous aider ici.`,
      de: topUpsell || `Hallo ${prefix}wir hoffen, Sie geniessen Ihren Aufenthalt. Bei Restaurant, Spa oder Late Check-out helfen wir gern hier.`
    },
    post_stay_review: {
      es: `Hola ${prefix}gracias por alojarte en ${hotelName}. Nos encantaria conocer tu opinion sobre la estancia.`,
      en: `Hi ${prefix}thank you for staying at ${hotelName}. We would love to hear your feedback about your stay.`,
      fr: `Bonjour ${prefix}merci d avoir sejourne a ${hotelName}. Nous aimerions connaitre votre avis.`,
      de: `Hallo ${prefix}vielen Dank fuer Ihren Aufenthalt im ${hotelName}. Wir wuerden uns ueber Ihr Feedback freuen.`
    }
  };

  return templates[automationType]?.[language] || templates[automationType]?.es || templates.pre_arrival_1d.es;
};

const buildAutomationPrompt = ({
  automationType,
  hotel,
  reservation,
  guest,
  guestMemory,
  hotelKnowledge,
  upsells,
  language
}) => `
Create one short WhatsApp message for a hotel guest.

Rules:
- Language: ${language}
- Tone: natural, warm, premium hotel service.
- 1-2 short sentences.
- Do not invent prices, availability, policies or exact times.
- Do not sound like a marketing campaign.
- If mentioning upsell, make it useful and optional.
- Return plain text only. No JSON.

Automation type: ${automationType}

Hotel:
- Name: ${hotel?.name || 'Hotel'}
- Brand: ${hotel?.brand_name || '-'}
- Check-in: ${hotel?.check_in_time || '-'}
- Check-out: ${hotel?.check_out_time || '-'}
- Description: ${hotel?.description || '-'}

Reservation:
- Guest: ${reservation.guest_name || guest?.phone_number || 'Guest'}
- Arrival: ${reservation.arrival_date || '-'}
- Departure: ${reservation.departure_date || '-'}
- Room type: ${reservation.room_type || '-'}
- Rate plan: ${reservation.rate_plan || '-'}
- Board basis: ${reservation.board_basis || '-'}

Guest memory:
${formatGuestMemoryForPrompt(guestMemory)}

Knowledge:
${hotelKnowledge.map((item) => `- ${item.key}: ${item.value}`).join('\n') || 'No hotel knowledge.'}

Upsells:
${upsells.map((item) => `- ${item.upsell_type}: ${item.suggested_message}`).join('\n') || 'No upsell suggestions.'}
`.trim();

export const generateAutomationMessage = async ({
  automationType,
  hotel,
  reservation,
  guest,
  guestMemory = [],
  hotelKnowledge = [],
  upsells = [],
  language = 'es'
}) => {
  const normalizedLanguage = normalizeLanguage(language);
  const fallbackMessage = fallbackTemplate({
    automationType,
    reservation,
    hotel,
    language: normalizedLanguage,
    upsells
  });

  if (process.env.USE_MOCK_AI === 'true') {
    return {
      message: fallbackMessage,
      aiProvider: 'mock',
      aiModel: 'template-fallback',
      fallbackUsed: true
    };
  }

  try {
    const model = getOpenAiModel();
    const openai = getOpenAiClient();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You write concise hotel WhatsApp automation messages.'
        },
        {
          role: 'user',
          content: buildAutomationPrompt({
            automationType,
            hotel,
            reservation,
            guest,
            guestMemory,
            hotelKnowledge,
            upsells,
            language: normalizedLanguage
          })
        }
      ]
    });
    const content = completion.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI returned empty automation message');
    }

    return {
      message: content,
      aiProvider: 'openai',
      aiModel: model,
      fallbackUsed: false
    };
  } catch (error) {
    logger.warn('Automation OpenAI generation failed; using template fallback', {
      automationType,
      message: error.message
    });

    return {
      message: fallbackMessage,
      aiProvider: 'mock',
      aiModel: 'template-fallback',
      fallbackUsed: true
    };
  }
};

const buildEventPayload = (reservation) => ({
  reservation_id: reservation.id,
  guest_name: reservation.guest_name,
  guest_email: reservation.guest_email,
  guest_phone: reservation.guest_phone,
  arrival_date: reservation.arrival_date,
  departure_date: reservation.departure_date,
  whatsapp_link: reservation.whatsapp_link
});

const buildAutomationEvents = (reservation) => {
  const payload = buildEventPayload(reservation);
  const events = [
    {
      reservation_id: reservation.id,
      event_type: 'booking_confirmation',
      scheduled_for: new Date().toISOString(),
      channel: 'email',
      status: 'scheduled',
      payload
    }
  ];

  const preArrivalSevenDays = addDays(reservation.arrival_date, -7);
  const preArrivalOneDay = addDays(reservation.arrival_date, -1);
  const postStayReview = addDays(reservation.departure_date, 1);
  const postStayDiscount = addDays(reservation.departure_date, 14);

  if (preArrivalSevenDays) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'pre_arrival_7_days',
      scheduled_for: preArrivalSevenDays,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (preArrivalOneDay) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'pre_arrival_1_day',
      scheduled_for: preArrivalOneDay,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (postStayReview) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'post_stay_review',
      scheduled_for: postStayReview,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  if (postStayDiscount) {
    events.push({
      reservation_id: reservation.id,
      event_type: 'post_stay_discount',
      scheduled_for: postStayDiscount,
      channel: 'email',
      status: 'scheduled',
      payload
    });
  }

  return events;
};

export const scheduleReservationAutomations = async (reservation) => {
  const client = getSupabase();
  const events = buildAutomationEvents(reservation);

  const { error: deleteError } = await client
    .from('automation_events')
    .delete()
    .eq('reservation_id', reservation.id);

  if (deleteError) {
    throw deleteError;
  }

  if (events.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('automation_events')
    .insert(events)
    .select('*');

  if (error) {
    throw error;
  }

  const sortedEvents = (data || []).sort((a, b) => (
    new Date(a.scheduled_for || a.created_at).getTime()
    - new Date(b.scheduled_for || b.created_at).getTime()
  ));

  logger.info('Reservation automation events scheduled', {
    reservationId: reservation.id,
    totalEvents: sortedEvents.length
  });

  return sortedEvents;
};

export const seedDefaultAutomationRules = async (hotelId) => {
  const client = getSupabase();
  const rules = [
    [AUTOMATION_TYPES.PRE_ARRIVAL_7D, 'Pre-arrival 7 days'],
    [AUTOMATION_TYPES.PRE_ARRIVAL_1D, 'Pre-arrival 1 day'],
    [AUTOMATION_TYPES.IN_STAY_UPSELL, 'In-stay upsell'],
    [AUTOMATION_TYPES.POST_STAY_REVIEW, 'Post-stay review']
  ].map(([automationType, name]) => ({
    hotel_id: hotelId,
    automation_type: automationType,
    name,
    channel: 'whatsapp',
    is_active: true,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await client
    .from('automation_rules')
    .upsert(rules, {
      onConflict: 'hotel_id,automation_type'
    })
    .select('*');

  if (error) {
    if (isMissingAutomationTables(error)) {
      logger.warn('automation_rules table missing; skipping seed');
      return [];
    }

    throw error;
  }

  return data || [];
};

export const getAutomationRulesForHotel = async (hotelId) => {
  const client = getSupabase();
  const { data, error } = await client
    .from('automation_rules')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('is_active', true);

  if (error) {
    if (isMissingAutomationTables(error)) {
      return [];
    }

    throw error;
  }

  if (!data?.length) {
    return seedDefaultAutomationRules(hotelId);
  }

  return data;
};

export const shouldScheduleAutomationForReservation = ({
  reservation,
  automationType,
  now = new Date()
}) => {
  const scheduledFor = automationDateForReservation(reservation, automationType);

  if (!scheduledFor) {
    return null;
  }

  const scheduledDate = new Date(scheduledFor);

  if (Number.isNaN(scheduledDate.getTime())) {
    return null;
  }

  const daysWindowMs = 30 * 86400000;

  if (scheduledDate.getTime() < now.getTime() - daysWindowMs) {
    return null;
  }

  return scheduledFor;
};

export const createScheduledMessage = async ({
  rule,
  hotel,
  reservation,
  guest = null,
  conversation = null,
  scheduledFor,
  messageResult,
  language = 'es',
  metadata = {}
}) => {
  const client = getSupabase();
  const scheduledDate = new Date(scheduledFor);
  const dayStart = new Date(Date.UTC(
    scheduledDate.getUTCFullYear(),
    scheduledDate.getUTCMonth(),
    scheduledDate.getUTCDate(),
    0,
    0,
    0
  )).toISOString();
  const dayEnd = new Date(Date.UTC(
    scheduledDate.getUTCFullYear(),
    scheduledDate.getUTCMonth(),
    scheduledDate.getUTCDate() + 1,
    0,
    0,
    0
  )).toISOString();
  const { data: existing, error: existingError } = await client
    .from('scheduled_messages')
    .select('*')
    .eq('reservation_id', reservation.id)
    .eq('automation_type', rule.automation_type)
    .gte('scheduled_for', dayStart)
    .lt('scheduled_for', dayEnd)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingAutomationTables(existingError)) {
      logger.warn('scheduled_messages table missing; skipping scheduled message');
      return null;
    }

    throw existingError;
  }

  if (existing) {
    return existing;
  }

  const record = {
    hotel_id: hotel.id,
    reservation_id: reservation.id,
    guest_id: reservation.guest_id || guest?.id || null,
    conversation_id: conversation?.id || null,
    automation_rule_id: rule?.id || null,
    automation_type: rule.automation_type,
    channel: rule.channel || 'whatsapp',
    scheduled_for: scheduledFor,
    send_to: reservation.guest_phone || guest?.phone_number || null,
    language,
    message_preview: messageResult.message,
    status: 'scheduled',
    ai_provider: messageResult.aiProvider,
    ai_model: messageResult.aiModel,
    automation_fallback: Boolean(messageResult.fallbackUsed),
    metadata,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from('scheduled_messages')
    .insert(record)
    .select('*')
    .single();

  if (error) {
    if (isMissingAutomationTables(error)) {
      logger.warn('scheduled_messages table missing; skipping scheduled message');
      return null;
    }

    throw error;
  }

  return data;
};

export const getAutomationContextForReservation = async ({
  hotel,
  reservation
}) => {
  const client = getSupabase();
  const upsellLookup = reservation.guest_id
    ? client
      .from('ai_upsells')
      .select('*')
      .eq('guest_id', reservation.guest_id)
      .in('status', ['suggested', 'shown'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then((result) => {
        if (result.error) {
          logger.warn('Automation upsell context unavailable', {
            message: result.error.message
          });
          return { data: [] };
        }

        return result;
      })
    : Promise.resolve({ data: [] });
  const [{ data: guest }, { data: conversation }, hotelProfile, guestMemory, hotelKnowledge, { data: upsells }] = await Promise.all([
    reservation.guest_id
      ? client.from('guests').select('*').eq('id', reservation.guest_id).maybeSingle()
      : Promise.resolve({ data: null }),
    reservation.guest_id
      ? client
        .from('conversations')
        .select('*')
        .eq('guest_id', reservation.guest_id)
        .eq('hotel_id', hotel.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    getHotelProfileForPrompt(hotel.id),
    reservation.guest_id ? getGuestMemory(hotel.id, reservation.guest_id) : Promise.resolve([]),
    getKnowledgeForHotel(hotel.id),
    upsellLookup
  ]);

  return {
    hotelProfile: hotelProfile || hotel,
    guest,
    conversation,
    guestMemory,
    hotelKnowledge,
    upsells: upsells || []
  };
};

export const getScheduledMessages = async ({ hotelId, limit = 100 } = {}) => {
  const client = getSupabase();
  let query = client
    .from('scheduled_messages')
    .select('*')
    .order('scheduled_for', { ascending: false })
    .limit(limit);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingAutomationTables(error)) {
      return [];
    }

    throw error;
  }

  return data || [];
};
