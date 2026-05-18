import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

const toNullableText = (value) => (
  value === undefined || value === null || value === '' ? null : String(value)
);

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const isMissingHumanFields = (error) => (
  error?.message?.includes('needs_human')
  || error?.message?.includes('human_reason')
  || error?.details?.includes('needs_human')
  || error?.details?.includes('human_reason')
);

const isMissingOptionalMetadataFields = (error) => (
  isMissingHumanFields(error)
  || error?.message?.includes('ai_provider')
  || error?.message?.includes('ai_model')
  || error?.message?.includes('fallback_used')
  || error?.message?.includes('knowledge_hotel_id')
  || error?.message?.includes('upsell_detected')
  || error?.message?.includes('upsell_type')
  || error?.message?.includes('upsell_confidence')
  || error?.message?.includes('memory_used')
  || error?.message?.includes('memory_keys_used')
  || error?.message?.includes('automation_triggered')
  || error?.message?.includes('automation_type')
  || error?.message?.includes('automation_sent')
  || error?.message?.includes('automation_fallback')
  || error?.message?.includes('concierge_intent')
  || error?.message?.includes('offer_created')
  || error?.message?.includes('offer_type')
  || error?.message?.includes('offer_status')
  || error?.message?.includes('openai_concierge_used')
  || error?.message?.includes('openai_concierge_model')
  || error?.message?.includes('openai_concierge_fallback')
  || error?.message?.includes('ai_summary')
  || error?.message?.includes('ai_reasoning')
  || error?.message?.includes('ai_satisfaction_estimate')
  || error?.message?.includes('ai_resolution_estimate')
  || error?.message?.includes('provider_experience_intent')
  || error?.message?.includes('provider_booking_created')
  || error?.message?.includes('provider_used')
  || error?.message?.includes('provider_experience_used')
  || error?.message?.includes('hotel_id')
  || error?.message?.includes('hotel_name')
  || error?.message?.includes('provider_experiences_count')
  || error?.message?.includes('hotel_experiences_count')
  || error?.message?.includes('response_language')
  || error?.message?.includes('translated_for_staff')
  || error?.message?.includes('translated_for_guest')
  || error?.message?.includes('translation_provider')
  || error?.message?.includes('source_priority')
  || error?.message?.includes('blocked_cross_tenant_experiences')
  || error?.message?.includes('provider_names_loaded')
  || error?.message?.includes('final_experience_source_used')
  || error?.message?.includes('provider_booking_detected')
  || error?.message?.includes('booking_ready')
  || error?.message?.includes('booking_block_reason')
  || error?.message?.includes('matched_provider_experience_id')
  || error?.message?.includes('last_provider_experience_id')
  || error?.message?.includes('provider_lead_status')
  || error?.message?.includes('provider_email_status')
  || error?.details?.includes('ai_provider')
  || error?.details?.includes('ai_model')
  || error?.details?.includes('fallback_used')
  || error?.details?.includes('knowledge_hotel_id')
  || error?.details?.includes('upsell_detected')
  || error?.details?.includes('upsell_type')
  || error?.details?.includes('upsell_confidence')
  || error?.details?.includes('memory_used')
  || error?.details?.includes('memory_keys_used')
  || error?.details?.includes('automation_triggered')
  || error?.details?.includes('automation_type')
  || error?.details?.includes('automation_sent')
  || error?.details?.includes('automation_fallback')
  || error?.details?.includes('concierge_intent')
  || error?.details?.includes('offer_created')
  || error?.details?.includes('offer_type')
  || error?.details?.includes('offer_status')
  || error?.details?.includes('openai_concierge_used')
  || error?.details?.includes('openai_concierge_model')
  || error?.details?.includes('openai_concierge_fallback')
  || error?.details?.includes('ai_summary')
  || error?.details?.includes('ai_reasoning')
  || error?.details?.includes('ai_satisfaction_estimate')
  || error?.details?.includes('ai_resolution_estimate')
  || error?.details?.includes('provider_experience_intent')
  || error?.details?.includes('provider_booking_created')
  || error?.details?.includes('provider_used')
  || error?.details?.includes('provider_experience_used')
  || error?.details?.includes('hotel_id')
  || error?.details?.includes('hotel_name')
  || error?.details?.includes('provider_experiences_count')
  || error?.details?.includes('hotel_experiences_count')
  || error?.details?.includes('response_language')
  || error?.details?.includes('translated_for_staff')
  || error?.details?.includes('translated_for_guest')
  || error?.details?.includes('translation_provider')
  || error?.details?.includes('source_priority')
  || error?.details?.includes('blocked_cross_tenant_experiences')
  || error?.details?.includes('provider_names_loaded')
  || error?.details?.includes('final_experience_source_used')
  || error?.details?.includes('provider_booking_detected')
  || error?.details?.includes('booking_ready')
  || error?.details?.includes('booking_block_reason')
  || error?.details?.includes('matched_provider_experience_id')
  || error?.details?.includes('last_provider_experience_id')
  || error?.details?.includes('provider_lead_status')
  || error?.details?.includes('provider_email_status')
);

export const createAiLog = async ({
  messageId = null,
  hotelId = null,
  hotelName = null,
  guestId = null,
  conversationId = null,
  detectedLanguage = null,
  detectedIntent = null,
  detectedRoom = null,
  confidenceScore = null,
  knowledgeUsed = false,
  knowledgeKey = null,
  knowledgeHotelId = null,
  ticketCreated = false,
  ticketId = null,
  ticketCategory = null,
  generatedResponse = null,
  rawGuestMessage = null,
  needsHuman = false,
  humanReason = null,
  aiProvider = null,
  aiModel = null,
  fallbackUsed = false,
  upsellDetected = false,
  upsellType = null,
  upsellConfidence = null,
  memoryUsed = false,
  memoryKeysUsed = [],
  automationTriggered = false,
  automationType = null,
  automationSent = false,
  automationFallback = false,
  conciergeIntent = null,
  offerCreated = false,
  offerType = null,
  offerStatus = null,
  openAiConciergeUsed = false,
  openAiConciergeModel = null,
  openAiConciergeFallback = false,
  aiSummary = null,
  aiReasoning = null,
  aiSatisfactionEstimate = null,
  aiResolutionEstimate = false,
  providerExperienceIntent = null,
  providerBookingCreated = false,
  providerUsed = null,
  providerExperienceUsed = null,
  providerExperiencesCount = null,
  hotelExperiencesCount = null,
  responseLanguage = null,
  sourcePriority = null,
  blockedCrossTenantExperiences = false,
  providerNamesLoaded = null,
  finalExperienceSourceUsed = null,
  providerBookingDetected = false,
  bookingReady = false,
  bookingBlockReason = null,
  matchedProviderExperienceId = null,
  lastProviderExperienceId = null,
  providerLeadStatus = null,
  providerEmailStatus = null,
  translatedForStaff = false,
  translatedForGuest = false,
  translationProvider = null,
  ai_provider = null,
  ai_model = null,
  fallback_used = false
} = {}) => {
  try {
    const supabase = getSupabase();
    const logRecord = {
      message_id: messageId,
      hotel_id: hotelId,
      hotel_name: toNullableText(hotelName),
      guest_id: guestId,
      conversation_id: conversationId,
      detected_language: toNullableText(detectedLanguage),
      detected_intent: toNullableText(detectedIntent),
      detected_room: toNullableText(detectedRoom),
      confidence_score: toNullableNumber(confidenceScore),
      knowledge_used: Boolean(knowledgeUsed),
      knowledge_key: toNullableText(knowledgeKey),
      knowledge_hotel_id: knowledgeHotelId,
      ticket_created: Boolean(ticketCreated),
      ticket_id: ticketId,
      ticket_category: toNullableText(ticketCategory),
      generated_response: toNullableText(generatedResponse),
      raw_guest_message: toNullableText(rawGuestMessage),
      needs_human: Boolean(needsHuman),
      human_reason: toNullableText(humanReason),
      ai_provider: toNullableText(aiProvider || ai_provider),
      ai_model: toNullableText(aiModel || ai_model),
      fallback_used: Boolean(fallbackUsed || fallback_used),
      upsell_detected: Boolean(upsellDetected),
      upsell_type: toNullableText(upsellType),
      upsell_confidence: toNullableNumber(upsellConfidence),
      memory_used: Boolean(memoryUsed),
      memory_keys_used: Array.isArray(memoryKeysUsed) ? memoryKeysUsed.map(String) : [],
      automation_triggered: Boolean(automationTriggered),
      automation_type: toNullableText(automationType),
      automation_sent: Boolean(automationSent),
      automation_fallback: Boolean(automationFallback),
      concierge_intent: toNullableText(conciergeIntent),
      offer_created: Boolean(offerCreated),
      offer_type: toNullableText(offerType),
      offer_status: toNullableText(offerStatus),
      openai_concierge_used: Boolean(openAiConciergeUsed),
      openai_concierge_model: toNullableText(openAiConciergeModel),
      openai_concierge_fallback: Boolean(openAiConciergeFallback),
      ai_summary: toNullableText(aiSummary),
      ai_reasoning: toNullableText(aiReasoning),
      ai_satisfaction_estimate: toNullableNumber(aiSatisfactionEstimate),
      ai_resolution_estimate: Boolean(aiResolutionEstimate),
      provider_experience_intent: toNullableText(providerExperienceIntent),
      provider_booking_created: Boolean(providerBookingCreated),
      provider_used: toNullableText(providerUsed),
      provider_experience_used: toNullableText(providerExperienceUsed),
      provider_experiences_count: toNullableNumber(providerExperiencesCount),
      hotel_experiences_count: toNullableNumber(hotelExperiencesCount),
      response_language: toNullableText(responseLanguage),
      source_priority: toNullableText(sourcePriority),
      blocked_cross_tenant_experiences: Boolean(blockedCrossTenantExperiences),
      provider_names_loaded: toNullableText(providerNamesLoaded),
      final_experience_source_used: toNullableText(finalExperienceSourceUsed),
      provider_booking_detected: Boolean(providerBookingDetected),
      booking_ready: Boolean(bookingReady),
      booking_block_reason: toNullableText(bookingBlockReason),
      matched_provider_experience_id: toNullableText(matchedProviderExperienceId),
      last_provider_experience_id: toNullableText(lastProviderExperienceId),
      provider_lead_status: toNullableText(providerLeadStatus),
      provider_email_status: toNullableText(providerEmailStatus),
      translated_for_staff: Boolean(translatedForStaff),
      translated_for_guest: Boolean(translatedForGuest),
      translation_provider: toNullableText(translationProvider)
    };

    let { data, error } = await supabase
      .from('ai_logs')
      .insert(logRecord)
      .select('*')
      .single();

    if (error && isMissingOptionalMetadataFields(error)) {
      logger.warn('AI log optional fields missing, retrying with legacy metadata', {
        message: error.message
      });

      const {
        needs_human,
        human_reason,
        ai_provider,
        ai_model,
        fallback_used,
        knowledge_hotel_id,
        upsell_detected,
        upsell_type,
        upsell_confidence,
        memory_used,
        memory_keys_used,
        automation_triggered,
        automation_type,
        automation_sent,
        automation_fallback,
        concierge_intent,
        offer_created,
        offer_type,
        offer_status,
        openai_concierge_used,
        openai_concierge_model,
        openai_concierge_fallback,
        ai_summary,
        ai_reasoning,
        ai_satisfaction_estimate,
        ai_resolution_estimate,
        provider_experience_intent,
        provider_booking_created,
        provider_used,
        provider_experience_used,
        hotel_id,
        hotel_name,
        provider_experiences_count,
        hotel_experiences_count,
        response_language,
        source_priority,
        blocked_cross_tenant_experiences,
        provider_names_loaded,
        final_experience_source_used,
        provider_booking_detected,
        booking_ready,
        booking_block_reason,
        matched_provider_experience_id,
        last_provider_experience_id,
        provider_lead_status,
        provider_email_status,
        translated_for_staff,
        translated_for_guest,
        translation_provider,
        ...fallbackRecord
      } = logRecord;
      const fallbackResult = await supabase
        .from('ai_logs')
        .insert(fallbackRecord)
        .select('*')
        .single();

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }

    logger.info('AI log created', {
      aiLogId: data.id,
      conversationId,
      detectedIntent,
      ticketCreated: Boolean(ticketCreated),
      needsHuman: Boolean(needsHuman),
      humanReason,
      aiProvider,
      aiModel,
      fallbackUsed
    });

    return data;
  } catch (error) {
    logger.warn('AI log write failed', {
      message: error.message
    });

    return null;
  }
};

export const getRecentAiLogs = async ({ limit = 50 } = {}) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ai_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
};
