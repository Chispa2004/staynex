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
  ticketCreated = false,
  ticketId = null,
  ticketCategory = null,
  generatedResponse = null,
  rawGuestMessage = null,
  needsHuman = false,
  humanReason = null
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
      ticket_created: Boolean(ticketCreated),
      ticket_id: ticketId,
      ticket_category: toNullableText(ticketCategory),
      generated_response: toNullableText(generatedResponse),
      raw_guest_message: toNullableText(rawGuestMessage),
      needs_human: Boolean(needsHuman),
      human_reason: toNullableText(humanReason)
    };

    let { data, error } = await supabase
      .from('ai_logs')
      .insert(logRecord)
      .select('*')
      .single();

    if (error && isMissingHumanFields(error)) {
      logger.warn('AI log human fields missing, retrying without needs_human metadata', {
        message: error.message
      });

      const { needs_human, human_reason, ...fallbackRecord } = logRecord;
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
      humanReason
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
