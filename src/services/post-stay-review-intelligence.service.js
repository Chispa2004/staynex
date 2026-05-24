import { getSupabase } from './supabase.service.js';
import { isHumanControlledConversation } from './conversation-context.service.js';
import { logger } from '../utils/logger.js';

export const POST_STAY_REVIEW_INTELLIGENCE_TYPE = 'post_stay_review_intelligence';

const FINAL_RESERVATION_STATUSES = new Set(['checked_out', 'completed', 'departed', 'finalized']);
const VALID_STRATEGIES = new Set(['request_public_review', 'request_private_feedback', 'alert_quality_team', 'skip']);

const normalize = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isValidPhone = (value) => String(value || '').replace(/\D/g, '').length >= 8;

const checkoutDateTime = (reservation = {}) => {
  if (!reservation.departure_date) return null;
  const value = String(reservation.departure_date).includes('T')
    ? reservation.departure_date
    : `${reservation.departure_date}T11:00:00.000Z`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isPostStayReviewDue = ({ reservation = {}, now = new Date(), delayHours = 24 } = {}) => {
  const checkout = checkoutDateTime(reservation);
  if (!checkout) return false;
  const elapsedHours = (now.getTime() - checkout.getTime()) / 3600000;
  return elapsedHours >= Number(delayHours || 24);
};

const getTextCorpus = ({ messages = [], tickets = [], aiLogs = [], guestMemory = [] } = {}) => normalize([
  ...messages.map((item) => item.content || item.body || item.message || item.text || ''),
  ...tickets.map((item) => `${item.title || ''} ${item.description || ''} ${item.category || ''} ${item.priority || ''} ${item.status || ''}`),
  ...aiLogs.map((item) => `${item.detected_intent || ''} ${item.generated_response || ''} ${item.human_reason || ''}`),
  ...guestMemory.map((item) => `${item.memory_key || ''} ${item.memory_value || ''}`)
].filter(Boolean).join(' '));

const countMatches = (text, patterns = []) => patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);

const positivePatterns = [
  /thank|thanks|gracias|merci|danke|perfect|perfecto|great|excellent|excelente|amazing|fantastic|lovely|genial|maravilloso|muy bien/
];

const negativePatterns = [
  /complaint|queja|reclamacion|angry|enfadad|furious|horrible|terrible|unacceptable|inaceptable|refund|reembolso|noise|ruido|broken|roto|dirty|sucio|waited|esperando|nadie|nobody|bad service|mal servicio|not working|no funciona/
];

const severePatterns = [
  /emergency|urgente|danger|peligro|police|policia|legal|lawyer|abogado|accident|accidente|unsafe|inseguro|medical|medico/
];

export const getHotelReviewConfig = (hotel = {}) => {
  const metadata = hotel.metadata || {};
  const reviewLinks = metadata.review_links || metadata.reviewLinks || {};
  const googleReviewLink = metadata.google_review_link || metadata.googleReviewLink || reviewLinks.google || null;
  const tripAdvisorLink = metadata.tripadvisor_link || metadata.tripAdvisorLink || reviewLinks.tripadvisor || null;
  const publicReviewLink = metadata.public_review_link || metadata.review_link || metadata.reviewLink || googleReviewLink || tripAdvisorLink || null;
  const privateFeedbackLink = metadata.private_feedback_link || metadata.feedback_link || metadata.feedbackLink || reviewLinks.private || null;

  return {
    publicReviewLink,
    googleReviewLink,
    tripAdvisorLink,
    privateFeedbackLink,
    privateFeedbackMode: metadata.private_feedback_mode || 'whatsapp_reply',
    qualityDepartment: metadata.quality_department || metadata.qualityDepartment || 'guest_relations',
    askAiAssistanceFeedback: metadata.ask_ai_assistance_feedback !== false,
    delayAfterCheckoutHours: Number(metadata.post_stay_review_delay_hours || metadata.delay_after_checkout_hours || 24)
  };
};

export const classifyAiAssistanceFeedback = (message = '') => {
  const text = normalize(message);

  if (!text.trim()) return 'no_response';
  if (/no me ayudo|no ayudo|not helpful|did not help|useless|lento|slow|bad|mal|confusing|confuso/.test(text)) {
    return 'not_helpful';
  }
  if (/si|sí|yes|helpful|muy bien|perfect|perfecto|great|genial|utile|util|thanks|gracias/.test(text)) {
    return 'helpful';
  }

  return 'no_response';
};

export const analyzePostStayReviewStrategy = ({
  hotel = {},
  reservation = {},
  guest = null,
  messages = [],
  tickets = [],
  aiLogs = [],
  guestMemory = [],
  intelligenceProfile = null
} = {}) => {
  const config = getHotelReviewConfig(hotel);
  const text = getTextCorpus({ messages, tickets, aiLogs, guestMemory });
  const positiveSignals = countMatches(text, positivePatterns);
  const negativeSignals = countMatches(text, negativePatterns);
  const severeSignals = countMatches(text, severePatterns);
  const urgentTickets = tickets.filter((ticket) => ['urgent', 'high'].includes(String(ticket.priority || '').toLowerCase()));
  const unresolvedTickets = tickets.filter((ticket) => !['resolved', 'closed', 'completed'].includes(String(ticket.status || '').toLowerCase()));
  const urgentUnresolvedTickets = unresolvedTickets.filter((ticket) => ['urgent', 'high'].includes(String(ticket.priority || '').toLowerCase()));
  const humanTakeoverLogs = aiLogs.filter((log) => log.needs_human || log.human_reason);
  const reviewRiskScore = Number(
    intelligenceProfile?.review_risk_score
    || intelligenceProfile?.reviewRiskScore
    || guest?.metadata?.review_risk_score
    || 0
  );
  const vipScore = Number(intelligenceProfile?.vip_score || intelligenceProfile?.vipScore || guest?.metadata?.vip_score || 0);
  const hasConversationEvidence = messages.length > 0 || tickets.length > 0 || aiLogs.length > 0 || guestMemory.length > 0;
  const reasons = [];

  if (positiveSignals) reasons.push('positive_guest_language_detected');
  if (negativeSignals) reasons.push('negative_guest_language_detected');
  if (severeSignals) reasons.push('severe_risk_language_detected');
  if (urgentTickets.length) reasons.push('urgent_ticket_detected');
  if (urgentUnresolvedTickets.length) reasons.push('unresolved_urgent_ticket');
  if (unresolvedTickets.length) reasons.push('unresolved_ticket');
  if (humanTakeoverLogs.length) reasons.push('human_review_during_stay');
  if (reviewRiskScore >= 60) reasons.push('high_review_risk_score');
  if (vipScore >= 70) reasons.push('vip_guest');
  if (!config.publicReviewLink) reasons.push('public_review_link_missing');
  if (!hasConversationEvidence) reasons.push('limited_stay_evidence');

  let staySentiment = 'unknown';
  if (severeSignals || negativeSignals >= 1 || urgentUnresolvedTickets.length || reviewRiskScore >= 60) {
    staySentiment = 'negative';
  } else if (positiveSignals >= 1 && !unresolvedTickets.length && reviewRiskScore < 35) {
    staySentiment = 'positive';
  } else if (hasConversationEvidence) {
    staySentiment = 'neutral';
  }

  let reviewStrategy = 'skip';
  if (staySentiment === 'negative') {
    reviewStrategy = 'alert_quality_team';
  } else if (staySentiment === 'positive' && config.publicReviewLink) {
    reviewStrategy = 'request_public_review';
  } else if (staySentiment === 'positive' || staySentiment === 'neutral') {
    reviewStrategy = 'request_private_feedback';
  }

  const confidence = staySentiment === 'unknown'
    ? 0.35
    : Math.min(0.94, 0.58 + (positiveSignals + negativeSignals + urgentTickets.length + humanTakeoverLogs.length) * 0.1);

  if (confidence < 0.5 && reviewStrategy === 'request_public_review') {
    reviewStrategy = 'request_private_feedback';
    reasons.push('public_review_blocked_low_confidence');
  }

  if (!VALID_STRATEGIES.has(reviewStrategy)) {
    reviewStrategy = 'skip';
  }

  return {
    stay_sentiment: staySentiment,
    staySentiment,
    review_strategy: reviewStrategy,
    reviewStrategy,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    reviewRiskScore,
    guestSatisfactionEstimate: staySentiment === 'positive' ? 82 : staySentiment === 'negative' ? 28 : staySentiment === 'neutral' ? 58 : 45,
    vipScore,
    qualitySummary: buildQualitySummary({
      reservation,
      staySentiment,
      reviewStrategy,
      reasons,
      tickets,
      reviewRiskScore
    }),
    config
  };
};

const firstName = (reservation = {}, guest = null) => String(reservation.guest_name || guest?.name || '').split(' ')[0] || '';

export const buildPostStayReviewMessage = ({
  hotel = {},
  reservation = {},
  guest = null,
  analysis,
  language = 'es'
} = {}) => {
  const normalizedLanguage = ['es', 'en', 'fr', 'de'].includes(language) ? language : 'es';
  const guestPrefix = firstName(reservation, guest);
  const prefix = guestPrefix ? `${guestPrefix}, ` : '';
  const hotelName = hotel.name || 'el hotel';
  const config = analysis?.config || getHotelReviewConfig(hotel);
  const reviewLink = config.publicReviewLink;

  if (analysis?.reviewStrategy === 'request_public_review') {
    const templates = {
      es: `${prefix}esperamos que hayas disfrutado de tu estancia en ${hotelName}.\n\nNos ayudaria mucho conocer tu opinion. Si tienes un minuto, puedes dejar una resena sobre tu experiencia aqui:\n\n${reviewLink}\n\nTambien puedes valorar si la asistencia por WhatsApp de Staynex te resulto util respondiendo a este mensaje.\n\nMuchas gracias por alojarte con nosotros.`,
      en: `${prefix}we hope you enjoyed your stay at ${hotelName}.\n\nYour opinion would mean a lot to us. If you have a minute, you can leave a review about your experience here:\n\n${reviewLink}\n\nYou can also let us know whether the Staynex WhatsApp assistance was helpful by replying to this message.\n\nThank you very much for staying with us.`,
      fr: `${prefix}nous esperons que vous avez apprecie votre sejour a ${hotelName}.\n\nVotre avis nous aiderait beaucoup. Si vous avez une minute, vous pouvez laisser un avis ici:\n\n${reviewLink}\n\nVous pouvez aussi nous dire si l'assistance WhatsApp Staynex vous a ete utile en repondant a ce message.\n\nMerci beaucoup d'avoir sejourne chez nous.`,
      de: `${prefix}wir hoffen, dass Sie Ihren Aufenthalt im ${hotelName} genossen haben.\n\nIhre Meinung hilft uns sehr. Wenn Sie eine Minute Zeit haben, koennen Sie hier eine Bewertung hinterlassen:\n\n${reviewLink}\n\nSie koennen auch direkt antworten, ob die Staynex WhatsApp-Unterstuetzung hilfreich war.\n\nVielen Dank fuer Ihren Aufenthalt.`
    };
    return templates[normalizedLanguage];
  }

  if (analysis?.reviewStrategy === 'request_private_feedback') {
    const privateLink = config.privateFeedbackLink ? `\n\n${config.privateFeedbackLink}` : '';
    const templates = {
      es: `${prefix}gracias por alojarte en ${hotelName}. Nos gustaria saber como fue tu experiencia y si hay algo que podamos mejorar. Puedes responder directamente a este mensaje.${privateLink}`,
      en: `${prefix}thank you for staying at ${hotelName}. We would like to know how your experience was and whether there is anything we can improve. You can reply directly to this message.${privateLink}`,
      fr: `${prefix}merci d'avoir sejourne a ${hotelName}. Nous aimerions savoir comment s'est passee votre experience et s'il y a quelque chose a ameliorer. Vous pouvez repondre directement a ce message.${privateLink}`,
      de: `${prefix}vielen Dank fuer Ihren Aufenthalt im ${hotelName}. Wir wuerden gern erfahren, wie Ihre Erfahrung war und ob wir etwas verbessern koennen. Sie koennen direkt auf diese Nachricht antworten.${privateLink}`
    };
    return templates[normalizedLanguage];
  }

  if (analysis?.reviewStrategy === 'alert_quality_team') {
    const templates = {
      es: `${prefix}sentimos que tu estancia no haya sido perfecta. El equipo del hotel revisara lo ocurrido para poder ayudarte y mejorar la experiencia.`,
      en: `${prefix}we are sorry your stay was not perfect. The hotel team will review what happened so they can help and improve the experience.`,
      fr: `${prefix}nous sommes desoles que votre sejour n'ait pas ete parfait. L'equipe de l'hotel va examiner la situation afin de vous aider et d'ameliorer l'experience.`,
      de: `${prefix}es tut uns leid, dass Ihr Aufenthalt nicht perfekt war. Das Hotelteam wird den Fall pruefen, um zu helfen und die Erfahrung zu verbessern.`
    };
    return templates[normalizedLanguage];
  }

  return null;
};

const buildQualitySummary = ({
  reservation = {},
  staySentiment,
  reviewStrategy,
  reasons = [],
  tickets = [],
  reviewRiskScore = 0
} = {}) => {
  const ticketSummary = tickets
    .slice(0, 4)
    .map((ticket) => `${ticket.category || 'ticket'}:${ticket.priority || 'normal'}:${ticket.status || 'open'}`)
    .join(', ');

  return [
    `Post-stay review strategy: ${reviewStrategy}.`,
    `Stay sentiment: ${staySentiment}.`,
    `Review risk score: ${Math.round(reviewRiskScore)}/100.`,
    reservation.guest_name ? `Guest: ${reservation.guest_name}.` : null,
    ticketSummary ? `Related tickets: ${ticketSummary}.` : null,
    reasons.length ? `Reasons: ${reasons.join(', ')}.` : null
  ].filter(Boolean).join(' ');
};

export const evaluatePostStayReviewIntelligence = ({
  hotel = {},
  reservation = {},
  guest = null,
  conversationState = null,
  existingScheduledMessages = [],
  existingRuns = [],
  analysis = null,
  now = new Date()
} = {}) => {
  const config = getHotelReviewConfig(hotel);

  if (!FINAL_RESERVATION_STATUSES.has(String(reservation.status || '').toLowerCase()) && !isPostStayReviewDue({ reservation, now, delayHours: config.delayAfterCheckoutHours })) {
    return { eligible: false, reason: 'reservation_not_finished' };
  }

  if (!isPostStayReviewDue({ reservation, now, delayHours: config.delayAfterCheckoutHours })) {
    return { eligible: false, reason: 'post_stay_delay_not_elapsed' };
  }

  const phone = reservation.guest_phone || guest?.phone_number;
  if (!isValidPhone(phone)) {
    return { eligible: false, reason: 'guest_phone_invalid' };
  }

  if (guest?.opt_out || guest?.metadata?.opt_out || reservation.metadata?.guest_opt_out) {
    return { eligible: false, reason: 'guest_opt_out' };
  }

  if (isHumanControlledConversation(conversationState)) {
    return { eligible: false, reason: 'human_takeover_active' };
  }

  const duplicate = existingScheduledMessages.some((message) => (
    message.reservation_id === reservation.id
    && message.automation_type === POST_STAY_REVIEW_INTELLIGENCE_TYPE
    && ['preview', 'scheduled', 'sent'].includes(message.status)
  )) || existingRuns.some((run) => (
    run.reservation_id === reservation.id
    && run.automation_type === POST_STAY_REVIEW_INTELLIGENCE_TYPE
    && ['preview', 'scheduled', 'sent', 'quality_alert_created'].includes(run.status)
  ));

  if (duplicate) {
    return { eligible: false, reason: 'duplicate_post_stay_review' };
  }

  if (!analysis || analysis.reviewStrategy === 'skip') {
    return { eligible: false, reason: analysis?.reasons?.[0] || 'analysis_skip' };
  }

  if (analysis.reviewStrategy === 'request_public_review' && !config.publicReviewLink) {
    return { eligible: false, reason: 'public_review_link_missing' };
  }

  if (analysis.reviewStrategy === 'request_public_review' && (analysis.staySentiment !== 'positive' || analysis.confidence < 0.6 || analysis.reviewRiskScore >= 45)) {
    return { eligible: false, reason: 'public_review_blocked_by_risk' };
  }

  const language = guest?.preferred_language || reservation.language || hotel.default_language || 'es';
  const message = buildPostStayReviewMessage({ hotel, reservation, guest, analysis, language });

  return {
    eligible: true,
    reason: 'eligible',
    strategy: analysis.reviewStrategy,
    language,
    sendTo: phone,
    message,
    previewOnly: true
  };
};

const isMissingAutomationTables = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.message?.includes('automation_runs')
  || error?.message?.includes('tickets')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('automation_runs')
  || error?.details?.includes('tickets')
  || error?.hint?.includes('scheduled_messages')
  || error?.hint?.includes('automation_runs')
  || error?.hint?.includes('tickets')
);

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;
  if (error) throw error;
  return data || fallback;
};

const insertAutomationRun = async ({
  supabase,
  hotel,
  reservation,
  guest = null,
  conversation = null,
  scheduledMessage = null,
  analysis,
  status,
  reason = null,
  now = new Date()
}) => {
  try {
    const { data, error } = await supabase
      .from('automation_runs')
      .insert({
        automation_id: null,
        hotel_id: hotel.id || reservation.hotel_id,
        guest_id: reservation.guest_id || guest?.id || null,
        reservation_id: reservation.id || null,
        conversation_id: conversation?.id || null,
        trigger_type: 'post_stay_review_intelligence',
        automation_type: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
        message_sent: false,
        translated_language: guest?.preferred_language || reservation.language || hotel.default_language || 'es',
        converted: false,
        revenue_generated: 0,
        revenue_owner: 'hotel',
        scheduled_message_id: scheduledMessage?.id || null,
        status,
        cooldown_applied: false,
        fatigue_score: 0,
        metadata: {
          source: 'post_stay_review_intelligence',
          preview_only: true,
          strategy: analysis?.reviewStrategy || null,
          stay_sentiment: analysis?.staySentiment || null,
          confidence: analysis?.confidence || null,
          review_risk_score: analysis?.reviewRiskScore || 0,
          skipped_reason: reason,
          reasons: analysis?.reasons || []
        },
        updated_at: now.toISOString()
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    if (!isMissingAutomationTables(error) && error?.code !== '42703') {
      logger.warn('post_stay_review_run_log_failed', {
        hotelId: hotel.id || reservation.hotel_id,
        reservationId: reservation.id,
        message: error.message
      });
    }
    return null;
  }
};

const createQualityAlert = async ({ supabase, hotel, reservation, guest, conversation, analysis }) => {
  try {
    const record = {
      hotel_id: hotel.id || reservation.hotel_id,
      guest_id: reservation.guest_id || guest?.id || null,
      conversation_id: conversation?.id || null,
      room_number: guest?.current_room || reservation.room_number || null,
      category: 'review_risk',
      title: `Review risk follow-up: ${reservation.guest_name || guest?.name || 'guest'}`,
      description: analysis.qualitySummary,
      priority: 'high',
      status: 'open',
      metadata: {
        source: 'post_stay_review_intelligence',
        strategy: analysis.reviewStrategy,
        reasons: analysis.reasons,
        review_risk_score: analysis.reviewRiskScore,
        department: analysis.config?.qualityDepartment || 'guest_relations'
      }
    };

    let created = null;
    const { data, error } = await supabase
      .from('tickets')
      .insert(record)
      .select('*')
      .single();

    if (error) {
      if (error?.code === '42703' || error?.message?.includes('metadata')) {
        const fallbackRecord = { ...record };
        delete fallbackRecord.metadata;
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('tickets')
          .insert(fallbackRecord)
          .select('*')
          .single();
        if (fallbackError) throw fallbackError;
        created = fallbackData;
      } else {
        throw error;
      }
    } else {
      created = data;
    }

    logger.info('quality_alert_created', {
      hotelId: hotel.id || reservation.hotel_id,
      reservationId: reservation.id,
      ticketId: created.id
    });

    return created;
  } catch (error) {
    if (!isMissingAutomationTables(error) && error?.code !== '42703') {
      logger.warn('quality_alert_create_failed', {
        hotelId: hotel.id || reservation.hotel_id,
        reservationId: reservation.id,
        message: error.message
      });
    }
    return null;
  }
};

export const runPostStayReviewIntelligence = async ({
  hotelId = null,
  now = new Date(),
  limit = 250,
  supabase = getSupabase()
} = {}) => {
  const result = {
    automationType: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
    eligibleGuests: 0,
    publicReviewPreviews: 0,
    privateFeedbackPreviews: 0,
    qualityAlertsCreated: 0,
    skippedCount: 0,
    skippedReasons: {},
    reviewRiskDetected: 0,
    positiveStays: 0,
    negativeStays: 0,
    scheduledMessages: []
  };

  try {
    let reservationsQuery = supabase
      .from('reservations')
      .select('*')
      .lte('departure_date', now.toISOString().slice(0, 10))
      .order('departure_date', { ascending: false })
      .limit(limit);

    if (hotelId) {
      reservationsQuery = reservationsQuery.eq('hotel_id', hotelId);
    }

    const reservations = (await safeRows(reservationsQuery)).filter((reservation) => isPostStayReviewDue({ reservation, now }));
    const hotelIds = [...new Set(reservations.map((reservation) => reservation.hotel_id).filter(Boolean))];
    const guestIds = [...new Set(reservations.map((reservation) => reservation.guest_id).filter(Boolean))];
    const reservationIds = reservations.map((reservation) => reservation.id).filter(Boolean);
    const [hotels, guests, conversations, states, messages, tickets, aiLogs, guestMemory, profiles, existingMessages, existingRuns] = await Promise.all([
      hotelIds.length ? safeRows(supabase.from('hotels').select('*').in('id', hotelIds)) : [],
      guestIds.length ? safeRows(supabase.from('guests').select('*').in('id', guestIds)) : [],
      guestIds.length ? safeRows(supabase.from('conversations').select('*').in('guest_id', guestIds)) : [],
      guestIds.length ? safeRows(supabase.from('conversation_ai_state').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      guestIds.length ? safeRows(supabase.from('messages').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      guestIds.length ? safeRows(supabase.from('tickets').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      guestIds.length ? safeRows(supabase.from('ai_logs').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      guestIds.length ? safeRows(supabase.from('guest_memory').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      guestIds.length ? safeRows(supabase.from('guest_intelligence_profiles').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      reservationIds.length ? safeRows(supabase.from('scheduled_messages').select('*').in('reservation_id', reservationIds)).catch(() => []) : [],
      reservationIds.length ? safeRows(supabase.from('automation_runs').select('*').in('reservation_id', reservationIds)).catch(() => []) : []
    ]);
    const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const conversationsByGuestId = new Map(conversations.map((conversation) => [conversation.guest_id, conversation]));
    const statesByConversationId = new Map(states.map((state) => [state.conversation_id, state]));
    const byGuest = (rows) => rows.reduce((map, row) => {
      const list = map.get(row.guest_id) || [];
      list.push(row);
      map.set(row.guest_id, list);
      return map;
    }, new Map());
    const messagesByGuest = byGuest(messages);
    const ticketsByGuest = byGuest(tickets);
    const aiLogsByGuest = byGuest(aiLogs);
    const memoryByGuest = byGuest(guestMemory);
    const profilesByGuest = byGuest(profiles);

    for (const reservation of reservations) {
      const hotel = hotelsById.get(reservation.hotel_id) || { id: reservation.hotel_id };
      const guest = guestsById.get(reservation.guest_id) || null;
      const conversation = conversationsByGuestId.get(reservation.guest_id) || null;
      const conversationState = conversation ? statesByConversationId.get(conversation.id) : null;
      const profile = profilesByGuest.get(reservation.guest_id)?.[0] || null;
      const analysis = analyzePostStayReviewStrategy({
        hotel,
        reservation,
        guest,
        messages: messagesByGuest.get(reservation.guest_id) || [],
        tickets: ticketsByGuest.get(reservation.guest_id) || [],
        aiLogs: aiLogsByGuest.get(reservation.guest_id) || [],
        guestMemory: memoryByGuest.get(reservation.guest_id) || [],
        intelligenceProfile: profile
      });

      logger.info('post_stay_review_analysis_completed', {
        hotelId: reservation.hotel_id,
        reservationId: reservation.id,
        strategy: analysis.reviewStrategy,
        staySentiment: analysis.staySentiment,
        confidence: analysis.confidence
      });

      if (analysis.staySentiment === 'positive') result.positiveStays += 1;
      if (analysis.staySentiment === 'negative') result.negativeStays += 1;
      if (analysis.reviewRiskScore >= 60 || analysis.reviewStrategy === 'alert_quality_team') result.reviewRiskDetected += 1;

      const decision = evaluatePostStayReviewIntelligence({
        hotel,
        reservation,
        guest,
        conversationState,
        existingScheduledMessages: existingMessages,
        existingRuns,
        analysis,
        now
      });

      if (!decision.eligible) {
        result.skippedCount += 1;
        result.skippedReasons[decision.reason] = (result.skippedReasons[decision.reason] || 0) + 1;
        logger.info('post_stay_review_skipped', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          reason: decision.reason
        });
        await insertAutomationRun({
          supabase,
          hotel,
          reservation,
          guest,
          conversation,
          analysis,
          status: 'skipped',
          reason: decision.reason,
          now
        });
        continue;
      }

      result.eligibleGuests += 1;

      if (decision.strategy === 'alert_quality_team') {
        const alert = await createQualityAlert({ supabase, hotel, reservation, guest, conversation, analysis });
        if (alert) result.qualityAlertsCreated += 1;
        await insertAutomationRun({
          supabase,
          hotel,
          reservation,
          guest,
          conversation,
          analysis,
          status: 'quality_alert_created',
          now
        });
        continue;
      }

      const record = {
        hotel_id: reservation.hotel_id,
        reservation_id: reservation.id,
        guest_id: reservation.guest_id || null,
        conversation_id: conversation?.id || null,
        automation_rule_id: null,
        automation_type: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
        channel: 'whatsapp',
        scheduled_for: now.toISOString(),
        send_to: decision.sendTo,
        language: decision.language,
        message_preview: decision.message,
        status: 'preview',
        ai_provider: 'none',
        ai_model: 'post_stay_review_intelligence_template',
        automation_fallback: false,
        metadata: {
          source: 'post_stay_review_intelligence',
          preview_only: true,
          strategy: decision.strategy,
          stay_sentiment: analysis.staySentiment,
          confidence: analysis.confidence,
          review_risk_score: analysis.reviewRiskScore,
          reasons: analysis.reasons,
          ask_ai_assistance_feedback: analysis.config.askAiAssistanceFeedback,
          live_sending_disabled: true
        },
        updated_at: now.toISOString()
      };

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(record)
        .select('*')
        .single();

      if (error) throw error;

      existingMessages.push(data);
      result.scheduledMessages.push(data);

      if (decision.strategy === 'request_public_review') {
        result.publicReviewPreviews += 1;
        logger.info('public_review_request_preview_generated', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          scheduledMessageId: data.id
        });
      }

      if (decision.strategy === 'request_private_feedback') {
        result.privateFeedbackPreviews += 1;
        logger.info('private_feedback_request_sent', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          scheduledMessageId: data.id,
          mode: 'preview'
        });
      }

      await insertAutomationRun({
        supabase,
        hotel,
        reservation,
        guest,
        conversation,
        scheduledMessage: data,
        analysis,
        status: 'preview',
        now
      });
    }

    return result;
  } catch (error) {
    if (isMissingAutomationTables(error)) {
      logger.warn('post_stay_review_scheduler_skipped_missing_tables', { message: error.message });
      return result;
    }
    throw error;
  }
};
