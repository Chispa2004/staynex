const languageCode = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const code = Intl.getCanonicalLocales(value.trim())[0]?.split('-')[0];
    return code && !['und', 'mul', 'zxx'].includes(code) ? code : null;
  } catch {
    return null;
  }
};

// Row ownership alone does not establish translation provenance. Only the
// authorized translation endpoint writes this marker after the scoped flow.
export const getVerifiedMessageTranslation = (message, targetLanguage, hotelId) => {
  const target = languageCode(targetLanguage);
  const cached = message?.metadata?.translations?.[target];
  if (!hotelId || message?.hotel_id !== hotelId || !target
    || cached?.cache_scope !== 'hotel-v1' || cached.hotel_id !== hotelId
    || cached.target_language !== target
    || typeof cached.translated_text !== 'string' || !cached.translated_text.trim()) return null;
  return {
    translation: cached.translated_text,
    sourceLanguage: cached.source_language || message.original_language || null,
    targetLanguage: target,
    provider: cached.provider || 'cache'
  };
};

// Response projection only: stored originals, translations and history are not
// changed. Do not send unverifiable derived translations to the Inbox client.
export const sanitizeInboxMessageTranslations = (message, hotelId) => {
  const translations = Object.fromEntries(Object.entries(message.metadata?.translations || {})
    .filter(([target]) => target === languageCode(target) && getVerifiedMessageTranslation(message, target, hotelId)));
  const verified = getVerifiedMessageTranslation(message, message.translated_language, hotelId);
  return {
    ...message,
    translated_text: verified?.translation || null,
    translated_language: verified?.targetLanguage || null,
    translation_provider: verified?.provider || null,
    translation_confidence: verified ? message.translation_confidence : null,
    metadata: { ...message.metadata, translations }
  };
};

// Presentation only: an inferred language must never establish a match.
export const shouldCompactOriginalMessage = ({
  sourceLanguage,
  readingLanguage,
  hasTranslation = false,
  isTranslating = false
} = {}) => {
  const source = languageCode(sourceLanguage);
  const target = languageCode(readingLanguage);
  return Boolean(source && target && source === target && !hasTranslation && !isTranslating);
};
