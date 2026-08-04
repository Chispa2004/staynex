import { getSupabase } from './supabase.service.js';
import { isHumanControlledConversation } from './conversation-context.service.js';
import { logger } from '../utils/logger.js';
import {
  applyAutomationDecisionOverride,
  evaluateAutomationDecision
} from '../../shared/automations/runtime.js';
import { writeAutomationDecisionToQueue } from '../../shared/automations/queue-writer.js';

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
      es: `${prefix}gracias por alojarte con nosotros. Esperamos que hayas disfrutado de tu estancia en ${hotelName}. Tu opinion nos ayuda a seguir mejorando. Si tienes unos segundos, puedes valorar tu experiencia aqui:\n\n${reviewLink}\n\nMuchas gracias.`,
      en: `${prefix}thank you for staying with us. We hope you enjoyed your stay at ${hotelName}. Your feedback helps us improve. If you have a moment, would you mind sharing your experience here?\n\n${reviewLink}\n\nThank you very much.`,
      fr: `${prefix}merci d'avoir sejourne chez nous. Nous esperons que votre sejour a ${hotelName} s'est bien passe. Votre avis nous aide a nous ameliorer. Pourriez-vous partager votre experience ici ?\n\n${reviewLink}\n\nMerci beaucoup.`,
      de: `${prefix}vielen Dank fuer Ihren Aufenthalt bei uns. Wir hoffen, dass Sie Ihren Aufenthalt im ${hotelName} genossen haben. Ihre Rueckmeldung hilft uns, unseren Service weiter zu verbessern. Wenn Sie kurz Zeit haben, koennen Sie Ihre Erfahrung hier teilen:\n\n${reviewLink}\n\nVielen Dank.`
    };
    return templates[normalizedLanguage];
  }

  if (analysis?.reviewStrategy === 'request_private_feedback') {
    const privateLink = config.privateFeedbackLink ? `\n\n${config.privateFeedbackLink}` : '';
    const templates = {
      es: `${prefix}gracias por alojarte con nosotros. Nos gustaria conocer como fue tu experiencia para seguir mejorando nuestro servicio. Puedes compartir cualquier comentario o sugerencia respondiendo directamente a este mensaje.${privateLink}`,
      en: `${prefix}thank you for staying with us. We would like to understand how your experience was so we can continue improving our service. You can share any comments or suggestions by replying directly to this message.${privateLink}`,
      fr: `${prefix}merci d'avoir sejourne chez nous. Nous aimerions savoir comment s'est passee votre experience afin de continuer a ameliorer notre service. Vous pouvez partager vos commentaires ou suggestions en repondant directement a ce message.${privateLink}`,
      de: `${prefix}vielen Dank fuer Ihren Aufenthalt bei uns. Wir moechten gern erfahren, wie Ihre Erfahrung war, damit wir unseren Service weiter verbessern koennen. Sie koennen uns Ihre Hinweise oder Vorschlaege direkt als Antwort senden.${privateLink}`
    };
    return templates[normalizedLanguage];
  }

  if (analysis?.reviewStrategy === 'alert_quality_team') {
    const templates = {
      es: `${prefix}gracias por alojarte con nosotros. Nos gustaria conocer como fue tu experiencia para seguir mejorando nuestro servicio. Podrias compartir cualquier comentario o sugerencia que consideres importante?`,
      en: `${prefix}thank you for staying with us. We would like to understand how your experience was so we can continue improving our service. Would you mind sharing any comment or suggestion you consider important?`,
      fr: `${prefix}merci d'avoir sejourne chez nous. Nous aimerions savoir comment s'est passee votre experience afin de continuer a ameliorer notre service. Pourriez-vous partager tout commentaire ou suggestion que vous jugez important ?`,
      de: `${prefix}vielen Dank fuer Ihren Aufenthalt bei uns. Wir moechten gern erfahren, wie Ihre Erfahrung war, damit wir unseren Service weiter verbessern koennen. Koennten Sie uns mitteilen, was Ihnen wichtig erscheint?`
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
      const runtimeDecision = evaluateAutomationDecision({
        hotel,
        reservation,
        guest: {
          ...(guest || {}),
          sentiment: analysis.staySentiment
        },
        conversation,
        conversationState,
        automation: {
          type: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
          active: true
        },
        automationType: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
        legacyType: POST_STAY_REVIEW_INTELLIGENCE_TYPE,
        trigger: 'post_checkout_24h',
        executionMode: 'preview',
        now,
        recentScheduledMessages: existingMessages,
        recentRuns: existingRuns,
        metadata: {
          source: 'post_stay_review_intelligence',
          strategy: analysis.reviewStrategy,
          stay_sentiment: analysis.staySentiment,
          review_risk_score: analysis.reviewRiskScore,
          sendTo: decision.sendTo,
          language: decision.language || guest?.preferred_language || reservation.language || hotel.default_language || 'es',
          triggerOccurrence: `post_stay_review:${reservation.id || 'no-reservation'}:${reservation.departure_date || 'no-departure'}:${analysis.reviewStrategy || 'no-strategy'}`
        },
        source: 'post_stay_review_intelligence'
      });
      const writerMetadata = {
        strategy: analysis.reviewStrategy,
        stay_sentiment: analysis.staySentiment,
        confidence: analysis.confidence,
        review_risk_score: analysis.reviewRiskScore,
        reasons: analysis.reasons,
        ask_ai_assistance_feedback: analysis.config.askAiAssistanceFeedback
      };

      if (!decision.eligible) {
        result.skippedCount += 1;
        result.skippedReasons[decision.reason] = (result.skippedReasons[decision.reason] || 0) + 1;
        logger.info('post_stay_review_skipped', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          reason: decision.reason
        });
        await writeAutomationDecisionToQueue({
          supabase,
          decision: applyAutomationDecisionOverride(runtimeDecision, {
            eligible: false,
            skipReason: decision.reason,
            metadata: {
              domain_skip_reason: decision.reason
            }
          }),
          messagePreview: null,
          language: runtimeDecision.metadata?.language || 'es',
          source: 'post_stay_review_intelligence',
          creationReason: decision.reason,
          extraMetadata: writerMetadata
        });
        continue;
      }

      result.eligibleGuests += 1;

      if (decision.strategy === 'alert_quality_team') {
        const alert = await createQualityAlert({ supabase, hotel, reservation, guest, conversation, analysis });
        if (alert) result.qualityAlertsCreated += 1;
        await writeAutomationDecisionToQueue({
          supabase,
          decision: runtimeDecision,
          messagePreview: null,
          language: decision.language,
          source: 'post_stay_review_intelligence',
          creationReason: runtimeDecision.triggerReason || 'quality_alert_created',
          auditOnlyStatus: 'quality_alert_created',
          extraMetadata: {
            ...writerMetadata,
            quality_alert_created: Boolean(alert),
            quality_alert_id: alert?.id || null
          }
        });
        continue;
      }

      const writeResult = await writeAutomationDecisionToQueue({
        supabase,
        decision: runtimeDecision,
        messagePreview: decision.message,
        language: decision.language,
        source: 'post_stay_review_intelligence',
        creationReason: runtimeDecision.triggerReason || decision.strategy,
        extraMetadata: {
          ...writerMetadata,
          ai_provider: 'none',
          ai_model: 'post_stay_review_intelligence_template',
          automation_fallback: false
        }
      });

      if (writeResult.scheduledMessage) {
        existingMessages.push(writeResult.scheduledMessage);

        if (!writeResult.duplicate) {
          result.scheduledMessages.push(writeResult.scheduledMessage);
        }
      }

      if (decision.strategy === 'request_public_review') {
        result.publicReviewPreviews += writeResult.scheduledMessage && !writeResult.duplicate ? 1 : 0;
        logger.info('public_review_request_preview_generated', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          scheduledMessageId: writeResult.scheduledMessage?.id || null,
          duplicate: writeResult.duplicate
        });
      }

      if (decision.strategy === 'request_private_feedback') {
        result.privateFeedbackPreviews += writeResult.scheduledMessage && !writeResult.duplicate ? 1 : 0;
        logger.info('private_feedback_request_sent', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          scheduledMessageId: writeResult.scheduledMessage?.id || null,
          mode: 'preview'
        });
      }
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
