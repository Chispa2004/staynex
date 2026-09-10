import { sendStaffMessage } from '../services/message.service.js';
import { getSupabase } from '../services/supabase.service.js';
import { detectLanguage, translateText } from '../services/translation.service.js';
import { normalizeLanguage } from '../services/language.service.js';
import { logger } from '../utils/logger.js';
import { manualDelivery, manualDeliveryText } from '../../shared/manual-send/contract.js';

const isMissingTranslationFields = (error) => (
  error?.message?.includes('original_language')
  || error?.message?.includes('translated_language')
  || error?.message?.includes('translated_text')
  || error?.message?.includes('translation_provider')
  || error?.message?.includes('translation_confidence')
  || error?.message?.includes('metadata')
  || error?.details?.includes('original_language')
  || error?.details?.includes('translated_language')
  || error?.details?.includes('translated_text')
  || error?.details?.includes('translation_provider')
  || error?.details?.includes('translation_confidence')
  || error?.details?.includes('metadata')
);

const getMessageForTranslation = async ({ messageId, hotelId }) => {
  const supabase = getSupabase();
  // Authorize identity and conversation before selecting message content or cache.
  const { data: identity, error: identityError } = await supabase.from('messages')
    .select('id, conversation_id').eq('id', messageId).eq('hotel_id', hotelId).maybeSingle();
  if (identityError) throw identityError;
  if (!identity || await getConversationHotelId(identity.conversation_id, hotelId) !== hotelId) return null;
  const baseSelect = 'id, conversation_id, sender_type, content, created_at';
  const extendedSelect = `${baseSelect}, original_language, translated_language, translated_text, translation_provider, translation_confidence, metadata`;
  let { data, error } = await supabase
    .from('messages')
    .select(extendedSelect)
    .eq('id', messageId)
    .eq('hotel_id', hotelId)
    .eq('conversation_id', identity.conversation_id)
    .maybeSingle();

  if (error && isMissingTranslationFields(error)) {
    const fallback = await supabase
      .from('messages')
      .select(baseSelect)
      .eq('id', messageId)
      .eq('hotel_id', hotelId)
      .eq('conversation_id', identity.conversation_id)
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return data;
};

const getConversationHotelId = async (conversationId, hotelId) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .select('hotel_id')
    .eq('id', conversationId)
    .eq('hotel_id', hotelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.hotel_id || null;
};

const updateMessageTranslationCache = async ({ message, hotelId, translation }) => {
  const supabase = getSupabase();
  const targetLanguage = translation.targetLanguage;
  const metadata = {
    ...(message.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
    translations: {
      ...(message.metadata?.translations && typeof message.metadata.translations === 'object'
        ? message.metadata.translations
        : {}),
      [targetLanguage]: {
        cache_scope: 'hotel-v1',
        hotel_id: hotelId,
        translated_text: translation.translatedText,
        source_language: translation.sourceLanguage,
        target_language: targetLanguage,
        provider: translation.provider,
        confidence: translation.confidence,
        created_at: new Date().toISOString()
      }
    }
  };

  const { error } = await supabase
    .from('messages')
    .update({
      metadata,
      original_language: message.original_language || translation.sourceLanguage,
      translated_language: targetLanguage,
      translated_text: translation.translatedText,
      translation_provider: translation.provider,
      translation_confidence: translation.confidence
    })
    .eq('id', message.id)
    .eq('hotel_id', hotelId)
    .eq('conversation_id', message.conversation_id);

  if (error && isMissingTranslationFields(error)) {
    return null;
  }

  if (error) {
    throw error;
  }

  return metadata;
};

export const handleSendMessage = async (req, res, next) => {
  try {
    const result = await sendStaffMessage(req.body);

    return res.status(200).json(result);
  } catch (error) {
    const delivery = error.manualSendSafe
      ? manualDelivery('failed', error.code, error.retryable)
      : manualDelivery('unknown', 'response_unknown');
    return res.status(error.manualSendSafe ? error.statusCode : 500).json({ delivery, error: manualDeliveryText(delivery) });
  }
};

export const handleTranslateMessage = async (req, res, next) => {
  try {
    const {
      text,
      sourceLanguage,
      targetLanguage,
      hotelId,
      messageId
    } = req.body;
    // This internal endpoint receives the server-authorized hotel from /api/translate.
    if (typeof hotelId !== 'string' || !hotelId.trim()) {
      return res.status(400).json({ error: 'Authorized hotel context required' });
    }
    const normalizedTarget = normalizeLanguage(targetLanguage || 'es');
    let message = null;
    let sourceText = String(text || '').trim();

    if (messageId) {
      message = await getMessageForTranslation({ messageId, hotelId });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      sourceText = message.content;
      const cached = message.metadata?.translations?.[normalizedTarget];

      // Older cache entries may have come from the formerly shared translator
      // cache. Recompute on demand instead of trusting unverifiable provenance.
      if (cached?.translated_text && cached.cache_scope === 'hotel-v1' && cached.hotel_id === hotelId
        && cached.target_language === normalizedTarget) {
        logger.info('message_translation_cache_hit', {
          hotelId,
          messageId,
          targetLanguage: normalizedTarget,
          provider: cached.provider || null
        });

        return res.status(200).json({
          cache_scope: 'hotel-v1',
          hotelId,
          messageId,
          translatedText: cached.translated_text,
          sourceLanguage: cached.source_language || message.original_language || sourceLanguage || null,
          targetLanguage: normalizedTarget,
          provider: cached.provider || 'cache',
          cached: true
        });
      }
    }

    const normalizedSource = normalizeLanguage(sourceLanguage || message?.original_language || detectLanguage(sourceText, normalizedTarget));

    logger.info('message_translation_requested', {
      hotelId: hotelId || null,
      messageId: messageId || null,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget
    });

    const translation = await translateText({
      hotelId,
      text: sourceText,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      purpose: 'inbox_staff_translation'
    });

    let metadata = null;

    if (message && translation.translatedText) {
      metadata = await updateMessageTranslationCache({
        message,
        hotelId,
        translation
      });
    }

    logger.info('message_translation_created', {
      hotelId: hotelId || null,
      messageId: messageId || null,
      sourceLanguage: translation.sourceLanguage,
      targetLanguage: translation.targetLanguage,
      provider: translation.provider,
      cached: Boolean(translation.cached)
    });

    return res.status(200).json({
      cache_scope: 'hotel-v1',
      hotelId,
      messageId: messageId || null,
      translatedText: translation.translatedText,
      sourceLanguage: translation.sourceLanguage,
      targetLanguage: translation.targetLanguage,
      provider: translation.provider,
      confidence: translation.confidence,
      cached: Boolean(translation.cached),
      metadata
    });
  } catch (error) {
    return next(error);
  }
};
