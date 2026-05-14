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
  || error?.details?.includes('ai_provider')
  || error?.details?.includes('ai_model')
  || error?.details?.includes('fallback_used')
  || error?.details?.includes('knowledge_hotel_id')
);

export const createAiLog = async ({
  messageId = null,
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
  ai_provider = null,
  ai_model = null,
  fallback_used = false
} = {}) => {
  try {
    const supabase = getSupabase();
    const logRecord = {
      message_id: messageId,
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
      fallback_used: Boolean(fallbackUsed || fallback_used)
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
