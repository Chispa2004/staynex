import OpenAI from 'openai';
import { detectGuestLanguage, normalizeLanguage } from './language.service.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TRANSLATION_MODEL = 'gpt-4.1-mini';
const translationCache = new Map();

const normalizeText = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ');

const getOpenAiClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS || 15000)
  });
};

const getCacheKey = ({ text, sourceLanguage, targetLanguage }) => [
  normalizeLanguage(sourceLanguage || detectGuestLanguage(text)),
  normalizeLanguage(targetLanguage),
  normalizeText(text)
].join(':');

const mockTranslations = [
  {
    match: /wann beginnt das fruhstuck|wann beginnt das frühstück/i,
    translations: {
      es: '¿Cuándo empieza el desayuno?',
      en: 'What time does breakfast start?',
      fr: 'À quelle heure commence le petit-déjeuner?',
      de: 'Wann beginnt das Frühstück?'
    }
  },
  {
    match: /desayuno es de 7 a 10/i,
    translations: {
      de: 'Das Frühstück ist von 7 bis 10 Uhr.',
      en: 'Breakfast is from 7 to 10.',
      fr: 'Le petit-déjeuner est servi de 7 h à 10 h.',
      es: 'El desayuno es de 7 a 10.'
    }
  },
  {
    match: /desayuno es hasta las 10/i,
    translations: {
      de: 'Das Frühstück ist bis 10 Uhr verfügbar.',
      en: 'Breakfast is available until 10.',
      fr: 'Le petit-déjeuner est disponible jusqu’à 10 h.',
      es: 'El desayuno es hasta las 10.'
    }
  },
  {
    match: /закуска|стая|екскурзии|дейности/i,
    translations: {
      es: 'El huésped pide información del hotel.',
      en: 'The guest is asking for hotel information.',
      fr: 'Le client demande des informations sur l’hôtel.',
      de: 'Der Gast fragt nach Hotelinformationen.'
    }
  }
];

const translateWithMock = ({ text, sourceLanguage, targetLanguage }) => {
  const normalizedTarget = normalizeLanguage(targetLanguage);
  const exact = mockTranslations.find((item) => item.match.test(text));

  if (exact?.translations?.[normalizedTarget]) {
    return exact.translations[normalizedTarget];
  }

  const normalizedSource = normalizeLanguage(sourceLanguage || detectGuestLanguage(text));

  if (normalizedSource === normalizedTarget) {
    return text;
  }

  return `[${normalizedSource.toUpperCase()} → ${normalizedTarget.toUpperCase()}] ${text}`;
};

export const detectLanguage = (text, fallbackLanguage = 'es') => (
  detectGuestLanguage(text, fallbackLanguage)
);

export const translateText = async ({
  text,
  sourceLanguage = null,
  targetLanguage = 'es',
  purpose = 'staff',
  force = false
} = {}) => {
  const content = String(text || '').trim();
  const normalizedTarget = normalizeLanguage(targetLanguage);
  const normalizedSource = normalizeLanguage(sourceLanguage || detectLanguage(content, normalizedTarget));

  if (!content) {
    return {
      originalText: content,
      translatedText: null,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      provider: null,
      confidence: 0
    };
  }

  if (!force && normalizedSource === normalizedTarget) {
    return {
      originalText: content,
      translatedText: null,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      provider: 'none',
      confidence: 1
    };
  }

  const cacheKey = getCacheKey({
    text: content,
    sourceLanguage: normalizedSource,
    targetLanguage: normalizedTarget
  });

  if (translationCache.has(cacheKey)) {
    return {
      ...translationCache.get(cacheKey),
      cached: true
    };
  }

  const openai = process.env.USE_MOCK_AI === 'true' ? null : getOpenAiClient();

  if (!openai) {
    const result = {
      originalText: content,
      translatedText: translateWithMock({
        text: content,
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget
      }),
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      provider: 'mock',
      confidence: 0.7
    };

    translationCache.set(cacheKey, result);
    return result;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.TRANSLATION_OPENAI_MODEL || process.env.OPENAI_MODEL || DEFAULT_TRANSLATION_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a hotel concierge translation layer. Translate naturally, preserve meaning, names, times, room numbers and booking details. Return only the translated text.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            purpose,
            source_language: normalizedSource,
            target_language: normalizedTarget,
            text: content
          })
        }
      ],
      temperature: 0
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() || null;
    const result = {
      originalText: content,
      translatedText,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      provider: 'openai',
      confidence: translatedText ? 0.92 : 0
    };

    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn('translation_openai_failed', {
      message: error.message,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      purpose
    });

    const result = {
      originalText: content,
      translatedText: translateWithMock({
        text: content,
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget
      }),
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
      provider: 'mock_fallback',
      confidence: 0.55
    };

    translationCache.set(cacheKey, result);
    return result;
  }
};

export const translateForStaff = async ({
  text,
  guestLanguage,
  staffLanguage = 'es'
} = {}) => translateText({
  text,
  sourceLanguage: guestLanguage,
  targetLanguage: staffLanguage,
  purpose: 'guest_to_staff'
});

export const translateForGuest = async ({
  text,
  staffLanguage = 'es',
  guestLanguage = 'es'
} = {}) => translateText({
  text,
  sourceLanguage: staffLanguage,
  targetLanguage: guestLanguage,
  purpose: 'staff_to_guest'
});
