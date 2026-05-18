import { getSupabase } from './supabase.service.js';
import { upsertGuestMemory } from './guest-memory.service.js';
import { createConversion } from './revenue.service.js';
import {
  buildExperienceProviderLeadEmail,
  sendExperienceProviderLeadEmail
} from './provider-lead-email.service.js';
import { logger } from '../utils/logger.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isMissingBookingTable = (error) => (
  error?.message?.includes('experience_booking_requests')
  || error?.details?.includes('experience_booking_requests')
  || error?.hint?.includes('experience_booking_requests')
);

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const providerEmailAlreadySent = (bookingRequest = {}) => Boolean(
  bookingRequest?.metadata?.provider_email_sent_at
  || bookingRequest?.metadata?.provider_email_status === 'sent'
  || bookingRequest?.lead_status === 'sent'
  || bookingRequest?.lead_email_sent_at
);

const isMissingLeadColumns = (error) => (
  error?.message?.includes('lead_')
  || error?.message?.includes('provider_email_')
  || error?.details?.includes('lead_')
  || error?.details?.includes('provider_email_')
);

const verifyProviderConnectedToHotel = async ({
  supabase,
  hotelId,
  providerId
}) => {
  if (!providerId) {
    return false;
  }

  const { data, error } = await supabase
    .from('hotel_experience_providers')
    .select('id, lead_email, active, provider:experience_providers(id, name, active, contact_email)')
    .eq('hotel_id', hotelId)
    .eq('provider_id', providerId)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    logger.warn('Provider assignment verification failed', {
      hotelId,
      providerId,
      message: error.message
    });
    return false;
  }

  return data && data.provider?.active !== false ? data : false;
};

const buildProviderEmailMetadata = ({
  bookingRequest,
  emailPayload,
  emailResult
}) => ({
  ...(bookingRequest?.metadata || {}),
  provider_email_to: emailPayload?.to || null,
  provider_email_status: emailResult.status,
  provider_email_error: emailResult.status === 'failed' ? emailResult.reason : null,
  provider_email_sent_at: emailResult.status === 'sent' ? new Date().toISOString() : bookingRequest?.metadata?.provider_email_sent_at || null,
  provider_email_prepared_at: emailResult.status === 'draft' ? new Date().toISOString() : bookingRequest?.metadata?.provider_email_prepared_at || null,
  provider_email_reference: emailPayload?.reference || null,
  provider_email_mode: emailPayload?.mode || process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock'
});

const updateBookingRequestProviderEmailState = async ({
  supabase,
  bookingRequest,
  emailPayload,
  emailResult
}) => {
  const metadata = buildProviderEmailMetadata({
    bookingRequest,
    emailPayload,
    emailResult
  });
  const sentAt = metadata.provider_email_sent_at;
  const updateWithLeadColumns = {
    metadata,
    lead_status: emailResult.status,
    lead_email_payload: emailPayload,
    lead_email_sent_at: emailResult.status === 'sent' ? sentAt : null,
    lead_error: emailResult.status === 'failed' ? emailResult.reason : null,
    updated_at: new Date().toISOString()
  };

  let { data, error } = await supabase
    .from('experience_booking_requests')
    .update(updateWithLeadColumns)
    .eq('id', bookingRequest.id)
    .select('*')
    .single();

  if (error && isMissingLeadColumns(error)) {
    const fallback = await supabase
      .from('experience_booking_requests')
      .update({
        metadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingRequest.id)
      .select('*')
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logger.warn('Experience provider lead status update failed', {
      bookingRequestId: bookingRequest.id,
      message: error.message
    });
    return {
      ...bookingRequest,
      metadata
    };
  }

  return data || {
    ...bookingRequest,
    metadata
  };
};

const deliverProviderLeadEmailForBookingRequest = async ({
  supabase,
  hotel,
  guest,
  reservation,
  conversation,
  bookingRequest,
  providerExperience,
  providerId,
  providerSource,
  providerLeadEmail
}) => {
  if (!providerSource && !providerId) {
    return bookingRequest;
  }

  if (providerEmailAlreadySent(bookingRequest)) {
    logger.info('experience_provider_lead_email_duplicate_skipped', {
      bookingRequestId: bookingRequest.id,
      hotelId: hotel.id,
      providerSource: providerSource || bookingRequest.provider_source || bookingRequest.metadata?.provider_source || null
    });
    return bookingRequest;
  }

  const assignment = await verifyProviderConnectedToHotel({
    supabase,
    hotelId: hotel.id,
    providerId: providerId || bookingRequest.provider_id || bookingRequest.metadata?.provider_id
  });

  if (!assignment) {
    logger.warn('experience_provider_lead_email_skipped_unassigned_provider', {
      bookingRequestId: bookingRequest.id,
      hotelId: hotel.id,
      providerId
    });
    return updateBookingRequestProviderEmailState({
      supabase,
      bookingRequest,
      emailPayload: {
        to: providerLeadEmail,
        subject: `New Staynex experience lead - ${hotel.name || 'Hotel'}`,
        mode: process.env.EXPERIENCE_PROVIDER_EMAIL_MODE || 'mock'
      },
      emailResult: {
        status: 'skipped',
        reason: 'provider_not_connected_to_hotel'
      }
    });
  }

  const resolvedLeadEmail = providerLeadEmail
    || bookingRequest.provider_lead_email
    || bookingRequest.metadata?.provider_lead_email
    || assignment.lead_email
    || assignment.provider?.contact_email
    || null;
  const emailPayload = buildExperienceProviderLeadEmail({
    hotel,
    guest,
    reservation,
    conversation,
    bookingRequest: {
      ...bookingRequest,
      provider_source: providerSource || bookingRequest.provider_source || assignment.provider?.name || null
    },
    providerExperience,
    leadEmail: resolvedLeadEmail
  });
  const emailResult = await sendExperienceProviderLeadEmail(emailPayload);

  return updateBookingRequestProviderEmailState({
    supabase,
    bookingRequest,
    emailPayload,
    emailResult
  });
};

const uniqueExperiences = (experiences = []) => {
  const seen = new Set();

  return (experiences || []).filter((experience) => {
    const titleKey = normalize(experience?.title || '').replace(/[^a-z0-9]+/g, ' ').trim();
    const key = experience?.id || titleKey;

    if (!key || seen.has(key) || (titleKey && seen.has(`title:${titleKey}`))) {
      return false;
    }

    seen.add(key);
    if (titleKey) {
      seen.add(`title:${titleKey}`);
    }

    return true;
  });
};

export const PROVIDER_EXPERIENCE_INTENTS = {
  INQUIRY: 'excursion_inquiry',
  INTEREST: 'excursion_interest',
  BOOKING_INTENT: 'excursion_booking_intent',
  BOOKING_CONFIRMATION: 'excursion_booking_confirmation'
};

const inquiryWords = [
  'what excursions',
  'what tours',
  'what activities',
  'what do you recommend',
  'recommend activities',
  'recommend tours',
  'things to do',
  'plans for',
  'weekend plans',
  'which tours',
  'quelles excursions',
  'quelles activites',
  'recommandez-vous',
  'welche ausfluge',
  'que excursiones',
  'que actividades',
  'que recomendais',
  'que recomiendas',
  'que podemos hacer',
  'planes para',
  'actividades teneis',
  'excursiones teneis',
  'tenéis excursiones',
  'tenéis actividades'
];

const softInterestWords = [
  'interested',
  'sounds interesting',
  'tell me more',
  'more details',
  'what does it include',
  'how long',
  'how much',
  'me interesa',
  'nos interesa',
  'cuentame mas',
  'cuéntame más',
  'dame mas detalles',
  'mas detalles',
  'más detalles',
  'que incluye',
  'qué incluye',
  'cuanto dura',
  'cuánto dura',
  'cuanto cuesta',
  'cuánto cuesta'
];

const bookingIntentWords = [
  'can we book',
  'can you book',
  'book it',
  'book this',
  'book the',
  'make a reservation',
  'reserve it',
  'reserve this',
  'we want to book',
  'we would like to book',
  'we would like to do',
  'we want to do',
  'reserve it for',
  'book it for',
  'confirm it',
  'confirm the booking',
  'queremos reservar',
  'queremos reservarlo',
  'queremos confirmar',
  'nos gustaria reservar',
  'nos gustaría reservar',
  'nos gustaria hacer',
  'nos gustaría hacer',
  'puedes reservar',
  'puedes reservarlo',
  'reservalo',
  'resérvalo',
  'reservarlo',
  'confirmar reserva',
  'si queremos confirmar',
  'sí queremos confirmar'
];

const negativeWords = [
  'not now',
  'later',
  'cancel',
  'not interested',
  'no gracias',
  'cancelar',
  'ahora no'
];

const experienceWords = [
  'catamaran',
  'catamaran',
  'boat',
  'barco',
  'excursion',
  'experience',
  'experiencia',
  'restaurant',
  'restaurante',
  'dinner',
  'cena',
  'spa',
  'transfer',
  'beach club',
  'yacht',
  'yate',
  'tour',
  'actividad',
  'actividades',
  'quad',
  'agafay',
  'atlas',
  'essaouira',
  'hammam'
];

const dateFromMessage = (message = '') => {
  const text = normalize(message);
  const today = new Date();
  const date = new Date(today);

  if (text.includes('tomorrow') || text.includes('manana')) {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  if (text.includes('today') || text.includes('hoy')) {
    return date.toISOString().slice(0, 10);
  }

  const isoMatch = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  return null;
};

const timeFromMessage = (message = '') => {
  const timeMatch = message.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  const amPmMatch = message.match(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i);
  if (!amPmMatch) {
    return null;
  }

  let hour = Number(amPmMatch[1]);
  if (amPmMatch[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (amPmMatch[2].toLowerCase() === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:00`;
};

const guestsCountFromMessage = (message = '') => {
  const countMatch = message.match(/\b(?:for|para)\s+(\d{1,2})\b/i) || message.match(/\b(\d{1,2})\s+(?:people|guests|personas|pax)\b/i);

  return countMatch ? Number(countMatch[1]) : null;
};

const wordsForExperience = (experience = {}) => [
  experience.title,
  experience.slug,
  experience.category,
  experience.partner_name,
  experience.provider_source,
  ...(experience.tags || []),
  ...(experience.target_guest_types || [])
].filter(Boolean).map(normalize);

const getLatestExperienceOffer = async ({ conversationId }) => {
  if (!conversationId) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_offers')
      .select('*')
      .eq('conversation_id', conversationId)
      .in('status', ['suggested', 'sent'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return (data || []).find((offer) => offer.metadata?.experience_intelligence) || null;
  } catch (error) {
    logger.warn('Recent experience offer lookup failed', { message: error.message });
    return null;
  }
};

const matchHotelExperience = ({ message, hotelExperiences = [], latestOffer = null }) => {
  const text = normalize(message);
  const offeredExperienceId = latestOffer?.metadata?.hotel_experience_id;

  if (offeredExperienceId) {
    const offered = hotelExperiences.find((experience) => experience.id === offeredExperienceId);
    if (offered) return offered;
  }

  return hotelExperiences.find((experience) => wordsForExperience(experience).some((word) => (
    word.length >= 4 && text.includes(word)
  ))) || null;
};

const hasQuestionShape = (message = '') => /[?¿]/.test(message);

export const classifyProviderExperienceConversation = async ({
  message = '',
  conversationId = null,
  hotelExperiences = []
} = {}) => {
  const text = normalize(message);

  if (!text || includesAny(text, negativeWords)) {
    return {
      intentType: null,
      confidence: 0,
      reason: 'negative_or_empty',
      bookingReady: false
    };
  }

  const latestOffer = await getLatestExperienceOffer({ conversationId });
  const matchedExperience = matchHotelExperience({ message, hotelExperiences, latestOffer });
  const mentionsExperience = includesAny(text, experienceWords) || Boolean(matchedExperience);
  const asksForRecommendations = includesAny(text, inquiryWords) || (
    hasQuestionShape(message) && mentionsExperience && includesAny(text, ['recommend', 'recomiendas', 'recomendais', 'tenéis', 'teneis', 'activities', 'actividades', 'excursions', 'excursiones', 'tours'])
  );
  const asksForDetails = includesAny(text, softInterestWords) || (
    hasQuestionShape(message) && Boolean(matchedExperience) && !includesAny(text, bookingIntentWords)
  );
  const hasBookingLanguage = includesAny(text, bookingIntentWords);
  const hasBareConfirmation = includesAny(text, ['yes confirm', 'yes please book', 'yes book', 'si confirmar', 'sí confirmar', 'si reservar', 'sí reservar']);
  const followsExperienceOfferWithAction = Boolean(latestOffer && mentionsExperience && (hasBookingLanguage || hasBareConfirmation));

  if (hasBookingLanguage && (mentionsExperience || latestOffer)) {
    return {
      intentType: PROVIDER_EXPERIENCE_INTENTS.BOOKING_INTENT,
      confidence: 0.9,
      reason: 'explicit_booking_action',
      bookingReady: true,
      latestOffer,
      matchedExperience,
      requestedDate: dateFromMessage(message),
      requestedTime: timeFromMessage(message),
      guestsCount: guestsCountFromMessage(message)
    };
  }

  if (followsExperienceOfferWithAction) {
    return {
      intentType: PROVIDER_EXPERIENCE_INTENTS.BOOKING_CONFIRMATION,
      confidence: 0.88,
      reason: 'confirmed_recent_experience_offer',
      bookingReady: true,
      latestOffer,
      matchedExperience,
      requestedDate: dateFromMessage(message),
      requestedTime: timeFromMessage(message),
      guestsCount: guestsCountFromMessage(message)
    };
  }

  if (asksForRecommendations) {
    return {
      intentType: PROVIDER_EXPERIENCE_INTENTS.INQUIRY,
      confidence: 0.84,
      reason: 'exploratory_recommendation_request',
      bookingReady: false,
      latestOffer,
      matchedExperience
    };
  }

  if (asksForDetails || (mentionsExperience && includesAny(text, softInterestWords))) {
    return {
      intentType: PROVIDER_EXPERIENCE_INTENTS.INTEREST,
      confidence: 0.78,
      reason: 'soft_interest_or_detail_request',
      bookingReady: false,
      latestOffer,
      matchedExperience
    };
  }

  return {
    intentType: null,
    confidence: 0,
    reason: 'no_provider_experience_intent',
    bookingReady: false,
    latestOffer,
    matchedExperience
  };
};

export const detectExperienceBookingIntent = async ({
  message = '',
  conversationId = null,
  hotelExperiences = []
} = {}) => {
  const classified = await classifyProviderExperienceConversation({
    message,
    conversationId,
    hotelExperiences
  });

  if (!classified.bookingReady) {
    return {
      detected: false,
      confidence: classified.confidence || 0,
      reason: classified.reason,
      conversationIntent: classified
    };
  }

  return {
    detected: true,
    confidence: classified.confidence,
    reason: classified.reason,
    latestOffer: classified.latestOffer,
    matchedExperience: classified.matchedExperience,
    requestedDate: classified.requestedDate,
    requestedTime: classified.requestedTime,
    guestsCount: classified.guestsCount,
    conversationIntent: classified
  };
};

const formatExperienceLine = ({ experience, language = 'en' }) => {
  const locale = language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : language === 'de' ? 'de-DE' : 'en-US';
  const fromWord = {
    es: 'desde',
    fr: 'a partir de',
    de: 'ab',
    en: 'from'
  }[language] || 'from';
  const price = experience.price
    ? ` - ${fromWord} ${Number(experience.price).toLocaleString(locale)} ${experience.currency || 'EUR'}`
    : '';
  const duration = experience.duration ? ` (${experience.duration})` : '';

  return `- ${experience.title}${price}${duration}`;
};

export const buildProviderExperienceRecommendationReply = ({
  intent,
  hotelExperiences = [],
  language = 'en',
  limit = 4
} = {}) => {
  const dedupedExperiences = uniqueExperiences(hotelExperiences);
  const providerExperiences = dedupedExperiences
    .filter((experience) => experience?.metadata?.experience_provider || experience.provider_source || experience.provider_id)
    .filter((experience) => experience.active !== false);
  const catalog = providerExperiences.length
    ? providerExperiences
    : dedupedExperiences.filter((experience) => experience.active !== false);

  if (!catalog.length) {
    if (!intent?.intentType) {
      return null;
    }

    return {
      es: 'Ahora mismo no tengo experiencias configuradas todavia para este hotel. Si quieres, recepcion puede ayudarte con recomendaciones locales.',
      fr: 'Pour le moment, aucune experience n est encore configuree pour cet hotel. Si vous le souhaitez, la reception peut vous aider avec des recommandations locales.',
      de: 'Aktuell sind fuer dieses Hotel noch keine Erlebnisse konfiguriert. Wenn Sie moechten, kann die Rezeption Ihnen mit lokalen Empfehlungen helfen.',
      en: 'There are no experiences configured for this hotel yet. If you like, reception can still help with local recommendations.'
    }[language] || 'There are no experiences configured for this hotel yet. If you like, reception can still help with local recommendations.';
  }

  const matched = intent?.matchedExperience;
  const selected = matched
    ? [matched, ...catalog.filter((experience) => experience.id !== matched.id)].slice(0, limit)
    : catalog.slice(0, limit);
  const providerName = selected.find((experience) => experience.provider_source)?.provider_source || selected[0]?.partner_name || null;
  const list = selected.map((experience) => formatExperienceLine({ experience, language })).join('\n');

  if (intent?.intentType === PROVIDER_EXPERIENCE_INTENTS.INTEREST && matched) {
    const description = matched.short_description || matched.description || ({
      es: 'Es una de las experiencias que podemos ayudar a organizar durante la estancia.',
      fr: 'C est l une des experiences que nous pouvons aider a organiser pendant votre sejour.',
      de: 'Das ist eines der Erlebnisse, die wir waehrend Ihres Aufenthalts organisieren koennen.',
      en: 'It is one of the experiences we can help arrange during the stay.'
    }[language] || 'It is one of the experiences we can help arrange during the stay.');
    const locale = language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : language === 'de' ? 'de-DE' : 'en-US';
    const fromWord = { es: 'desde', fr: 'a partir de', de: 'ab', en: 'from' }[language] || 'from';
    const price = matched.price ? `${fromWord} ${Number(matched.price).toLocaleString(locale)} ${matched.currency || 'EUR'}` : null;
    const details = [
      description,
      matched.duration ? `${{ es: 'Duracion', fr: 'Duree', de: 'Dauer', en: 'Duration' }[language] || 'Duration'}: ${matched.duration}.` : null,
      price ? `${{ es: 'Precio', fr: 'Prix', de: 'Preis', en: 'Price' }[language] || 'Price'}: ${price}.` : null
    ].filter(Boolean).join('\n');

    return {
      es: `Claro.\n\n${details}\n\nSi os encaja, puedo ayudaros a enviar la solicitud para confirmar disponibilidad.`,
      fr: `Bien sur.\n\n${details}\n\nSi cela vous convient, je peux vous aider a envoyer la demande pour confirmer la disponibilite.`,
      de: `Gerne.\n\n${details}\n\nWenn es fuer Sie passt, kann ich die Anfrage zur Bestaetigung der Verfuegbarkeit weiterleiten.`,
      en: `Of course.\n\n${details}\n\nIf it suits you, I can help send the request to confirm availability.`
    }[language] || `Of course.\n\n${details}\n\nIf it suits you, I can help send the request to confirm availability.`;
  }

  return {
    es: `Claro.\n\n${providerName ? `A traves de ${providerName} podemos organizar varias experiencias:\n\n` : 'Podemos ayudaros con varias experiencias durante vuestra estancia:\n\n'}${list}\n\nSi alguna os interesa, puedo daros mas detalles o ayudaros con la reserva.`,
    fr: `Bien sur.\n\n${providerName ? `Avec ${providerName}, nous pouvons organiser plusieurs experiences:\n\n` : 'Nous pouvons vous aider avec plusieurs experiences pendant votre sejour:\n\n'}${list}\n\nSi l une d elles vous interesse, je peux vous donner plus de details ou vous aider avec la demande de reservation.`,
    de: `Gerne.\n\n${providerName ? `Ueber ${providerName} koennen wir mehrere Erlebnisse organisieren:\n\n` : 'Wir koennen Ihnen waehrend Ihres Aufenthalts mit mehreren Erlebnissen helfen:\n\n'}${list}\n\nWenn Sie eine davon interessiert, gebe ich Ihnen gern weitere Details oder helfe mit der Anfrage.`,
    en: `Of course.\n\n${providerName ? `Through ${providerName}, we can arrange several experiences:\n\n` : 'We can help with several experiences during your stay:\n\n'}${list}\n\nIf any of these interest you, I can share more details or help with the booking.`
  }[language] || `Of course.\n\n${providerName ? `Through ${providerName}, we can arrange several experiences:\n\n` : 'We can help with several experiences during your stay:\n\n'}${list}\n\nIf any of these interest you, I can share more details or help with the booking.`;
};

export const buildProviderExperienceInterestMemories = ({ intent } = {}) => {
  if (!intent || ![PROVIDER_EXPERIENCE_INTENTS.INQUIRY, PROVIDER_EXPERIENCE_INTENTS.INTEREST].includes(intent.intentType)) {
    return [];
  }

  const experience = intent.matchedExperience;
  const keyBase = experience?.slug || experience?.title || 'provider_experience';
  const cleanKey = normalize(keyBase).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'provider_experience';

  return [{
    memoryType: 'experience_interest',
    memoryKey: `interested_${cleanKey}`,
    memoryValue: experience?.title || intent.intentType,
    confidence: intent.confidence || 0.75,
    metadata: {
      provider_experience_id: experience?.provider_experience_id || experience?.id || null,
      provider_source: experience?.provider_source || null,
      conversational_intent: intent.intentType
    }
  }];
};

const getExperienceFromOffer = ({ intent, hotelExperiences = [] }) => {
  if (intent.matchedExperience) {
    return intent.matchedExperience;
  }

  const id = intent.latestOffer?.metadata?.hotel_experience_id;
  return id ? hotelExperiences.find((experience) => experience.id === id) || null : null;
};

export const createExperienceBookingRequest = async ({
  hotel,
  guest,
  conversation,
  reservation = null,
  message = '',
  hotelExperiences = [],
  intent
}) => {
  if (!intent?.detected || !hotel?.id || !conversation?.id) {
    return null;
  }

  const experience = getExperienceFromOffer({ intent, hotelExperiences });
  const latestOffer = intent.latestOffer || null;
  const title = experience?.title || latestOffer?.metadata?.hotel_experience_title || latestOffer?.offer_type || 'Local experience';
  const estimatedRevenue = Number(experience?.price ?? latestOffer?.suggested_price ?? 0);
  const commissionPercentage = Number(experience?.commission_percentage || 0);
  const commissionEstimate = commissionPercentage > 0
    ? Math.round((estimatedRevenue * commissionPercentage) / 100)
    : 0;
  const providerId = experience?.provider_id || latestOffer?.metadata?.provider_id || null;
  const providerExperienceId = experience?.provider_experience_id || latestOffer?.metadata?.provider_experience_id || null;
  const providerSource = experience?.provider_source || latestOffer?.metadata?.provider_source || null;
  const providerLeadEmail = experience?.provider_lead_email || latestOffer?.metadata?.provider_lead_email || null;

  try {
    const supabase = getSupabase();
    const { data: existing, error: existingError } = await supabase
      .from('experience_booking_requests')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('conversation_id', conversation.id)
      .eq('experience_title', title)
      .in('status', ['pending', 'reviewing', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return deliverProviderLeadEmailForBookingRequest({
        supabase,
        hotel,
        guest,
        reservation,
        conversation,
        bookingRequest: existing,
        providerExperience: experience,
        providerId: providerId || existing.provider_id || existing.metadata?.provider_id || null,
        providerSource: providerSource || existing.provider_source || existing.metadata?.provider_source || null,
        providerLeadEmail: providerLeadEmail || existing.provider_lead_email || existing.metadata?.provider_lead_email || null
      });
    }

    const baseRecord = {
      hotel_id: hotel.id,
      reservation_id: reservation?.id || null,
      guest_id: guest?.id || null,
      conversation_id: conversation.id,
      hotel_experience_id: experience?.metadata?.experience_provider ? null : experience?.id || null,
      experience_title: title,
      partner_name: experience?.partner_name || latestOffer?.metadata?.partner_name || null,
      guest_name: reservation?.guest_name || guest?.name || null,
      room_number: guest?.current_room || reservation?.room_number || null,
      requested_date: intent.requestedDate,
      requested_time: intent.requestedTime,
      guests_count: intent.guestsCount || reservation?.adults || null,
      notes: message,
      status: 'pending',
      estimated_revenue: estimatedRevenue,
      commission_estimate: commissionEstimate,
      source: 'ai_concierge',
      metadata: {
        intent_reason: intent.reason,
        confidence: intent.confidence,
        ai_offer_id: latestOffer?.id || null,
        offer_type: latestOffer?.offer_type || null,
        provider_id: providerId,
        provider_experience_id: providerExperienceId,
        provider_source: providerSource,
        provider_lead_email: providerLeadEmail,
        provider_lead_required: Boolean(providerLeadEmail),
        reception_confirmation_required: true,
        partner_ready: true,
        future_partner_channels: ['email', 'whatsapp', 'api']
      }
    };
    const providerRecord = providerSource ? {
      provider_id: providerId,
      provider_experience_id: providerExperienceId,
      provider_source: providerSource,
      provider_lead_email: providerLeadEmail,
      lead_status: providerLeadEmail ? 'pending' : 'not_required'
    } : {};

    let { data, error } = await supabase
      .from('experience_booking_requests')
      .insert({
        ...baseRecord,
        ...providerRecord
      })
      .select('*')
      .single();

    if (error && (
      error.message?.includes('provider_')
      || error.message?.includes('lead_')
      || error.details?.includes('provider_')
      || error.details?.includes('lead_')
    )) {
      logger.warn('Provider lead columns missing; retrying booking request without provider columns', {
        message: error.message
      });
      const fallback = await supabase
        .from('experience_booking_requests')
        .insert(baseRecord)
        .select('*')
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    if (providerSource || providerId) {
      data = await deliverProviderLeadEmailForBookingRequest({
        supabase,
        hotel,
        guest,
        reservation,
        conversation,
        bookingRequest: data,
        providerExperience: experience,
        providerId,
        providerSource,
        providerLeadEmail
      });
    }

    await createConversion({
      hotelId: hotel.id,
      guestId: guest?.id || null,
      reservationId: reservation?.id || null,
      conversationId: conversation.id,
      upsellType: latestOffer?.offer_type || experience?.category || 'experience_booking',
      source: 'experience_booking_request',
      status: 'pending',
      estimatedAmount: estimatedRevenue,
      currency: latestOffer?.currency || 'EUR',
      notes: `Experience booking request ${data.id}: ${title}`
    }).catch((error) => {
      logger.warn('Experience booking revenue conversion failed', { message: error.message });
    });

    if (guest?.id) {
      const memoryKey = experience?.category
        ? `booked_${experience.category}`
        : `interested_${latestOffer?.offer_type || 'experience_booking'}`;

      await upsertGuestMemory({
        hotelId: hotel.id,
        guestId: guest.id,
        reservationId: reservation?.id || null,
        memoryType: 'experience_booking',
        memoryKey,
        memoryValue: 'pending_request',
        confidence: intent.confidence || 0.8,
        source: 'experience_booking',
        metadata: {
          booking_request_id: data.id,
          experience_title: title,
          provider_source: providerSource
        }
      }).catch((error) => {
        logger.warn('Experience booking memory write failed', { message: error.message });
      });
    }

    logger.info('experience_booking_request_created', {
      hotelId: hotel.id,
      conversationId: conversation.id,
      bookingRequestId: data.id,
      experienceTitle: title,
      providerSource
    });

    return data;
  } catch (error) {
    if (isMissingBookingTable(error)) {
      logger.warn('experience_booking_requests table missing; booking workflow skipped');
      return null;
    }

    logger.warn('Experience booking request failed', { message: error.message });
    return null;
  }
};

export const getExperienceBookingConfirmationReply = ({ language = 'en', providerName = null } = {}) => {
  const destination = providerName
    ? ({
      es: ` a ${providerName}`,
      fr: ` a ${providerName}`,
      de: ` an ${providerName}`,
      en: ` to ${providerName}`
    }[language] || ` to ${providerName}`)
    : '';

  return {
    es: `Perfecto.\n\nHe enviado vuestra solicitud${destination} para confirmar disponibilidad y detalles de la experiencia. Os contactaran lo antes posible para finalizar la reserva.`,
    fr: `Parfait.\n\nJ ai envoye votre demande${destination} afin de confirmer la disponibilite et les details de l experience. Vous serez contactes des que possible pour finaliser la reservation.`,
    de: `Perfekt.\n\nIch habe Ihre Anfrage${destination} gesendet, um Verfuegbarkeit und Details des Erlebnisses zu bestaetigen. Sie werden so bald wie moeglich kontaktiert, um die Buchung abzuschliessen.`,
    en: `Perfect.\n\nI have sent your request${destination} to confirm availability and the experience details. You will be contacted as soon as possible to finalize the booking.`
  }[language] || `Perfect.\n\nI have sent your request${destination} to confirm availability and the experience details. You will be contacted as soon as possible to finalize the booking.`;
};
