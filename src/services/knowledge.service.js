import { validateAiResponse } from '../schemas/ai-response.schema.js';
import { getHotelKnowledge, getSupabase } from './supabase.service.js';
import { normalizeLanguage } from './language.service.js';
import { logger } from '../utils/logger.js';

const KNOWLEDGE_DEMO_ENTRIES = [
  { key: 'desayuno', value: 'El desayuno es de 07:30 a 10:30.' },
  { key: 'wifi', value: 'La red WiFi es StaynexGuest y la contraseña es staynex2026.' },
  { key: 'checkout', value: 'El checkout es a las 12:00.' },
  { key: 'piscina', value: 'La piscina abre de 10:00 a 19:00.' },
  { key: 'spa', value: 'El spa abre de 10:00 a 20:00.' },
  { key: 'parking', value: 'El parking cuesta 18€/día.' },
  { key: 'room service', value: 'El room service está disponible de 12:00 a 23:00.' },
  { key: 'restaurante', value: 'El restaurante sirve cenas de 19:30 a 23:00.' }
];

const KNOWLEDGE_MATCHERS = [
  {
    key: 'desayuno',
    words: ['desayuno', 'breakfast', 'petit dejeuner', 'fruhstuck']
  },
  {
    key: 'wifi',
    words: ['wifi', 'wi-fi', 'wlan', 'internet', 'contraseña', 'contrasena', 'clave', 'mot de passe', 'passwort']
  },
  {
    key: 'checkout',
    words: ['checkout', 'check out', 'salida', 'depart', 'abreise']
  },
  {
    key: 'piscina',
    words: ['piscina', 'pool', 'piscine', 'schwimmbad']
  },
  {
    key: 'spa',
    words: ['spa', 'masaje', 'tratamiento', 'massage', 'behandlung']
  },
  {
    key: 'parking',
    words: ['parking', 'aparcamiento', 'garaje', 'coche', 'garage', 'parkplatz']
  },
  {
    key: 'room service',
    words: ['room service', 'servicio de habitaciones', 'service en chambre', 'zimmer service']
  },
  {
    key: 'restaurante',
    words: ['restaurante', 'cena', 'cenar', 'restaurant', 'diner', 'abendessen']
  }
];

const KNOWLEDGE_TRANSLATIONS = {
  desayuno: {
    es: 'El desayuno es de 07:30 a 10:30.',
    en: 'Breakfast is served from 07:30 to 10:30.',
    fr: 'Le petit-déjeuner est servi de 07:30 à 10:30.',
    de: 'Das Frühstück wird von 07:30 bis 10:30 serviert.'
  },
  wifi: {
    es: 'La red WiFi es StaynexGuest y la contraseña es staynex2026.',
    en: 'The WiFi network is StaynexGuest and the password is staynex2026.',
    fr: 'Le réseau WiFi est StaynexGuest et le mot de passe est staynex2026.',
    de: 'Das WLAN heißt StaynexGuest und das Passwort lautet staynex2026.'
  },
  checkout: {
    es: 'El checkout es a las 12:00.',
    en: 'Checkout is at 12:00.',
    fr: 'Le checkout est à 12:00.',
    de: 'Der Checkout ist um 12:00 Uhr.'
  },
  piscina: {
    es: 'La piscina abre de 10:00 a 19:00.',
    en: 'The pool is open from 10:00 to 19:00.',
    fr: 'La piscine est ouverte de 10:00 à 19:00.',
    de: 'Der Pool ist von 10:00 bis 19:00 Uhr geöffnet.'
  },
  spa: {
    es: 'El spa abre de 10:00 a 20:00.',
    en: 'The spa is open from 10:00 to 20:00.',
    fr: 'Le spa est ouvert de 10:00 à 20:00.',
    de: 'Der Spa ist von 10:00 bis 20:00 Uhr geöffnet.'
  },
  parking: {
    es: 'El parking cuesta 18€/día.',
    en: 'Parking costs €18 per day.',
    fr: 'Le parking coûte 18 € par jour.',
    de: 'Das Parken kostet 18 € pro Tag.'
  },
  'room service': {
    es: 'El room service está disponible de 12:00 a 23:00.',
    en: 'Room service is available from 12:00 to 23:00.',
    fr: 'Le room service est disponible de 12:00 à 23:00.',
    de: 'Der Room Service ist von 12:00 bis 23:00 Uhr verfügbar.'
  },
  restaurante: {
    es: 'El restaurante sirve cenas de 19:30 a 23:00.',
    en: 'The restaurant serves dinner from 19:30 to 23:00.',
    fr: 'Le restaurant sert le dîner de 19:30 à 23:00.',
    de: 'Das Restaurant serviert Abendessen von 19:30 bis 23:00 Uhr.'
  }
};

const normalize = (value) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const translateKnowledgeReplyMock = ({ key, reply, language }) => {
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedKey = normalize(key);
  const matchedKey = Object.keys(KNOWLEDGE_TRANSLATIONS)
    .find((item) => normalize(item) === normalizedKey);
  const wifiMatch = reply.match(/la red wifi es\s+(.+?)\s+y la contrase(?:ñ|n)a es\s+(.+?)\.?$/i);

  if (matchedKey === 'wifi' && wifiMatch) {
    const [, network, password] = wifiMatch;

    return {
      es: reply,
      en: `The WiFi network is ${network} and the password is ${password}.`,
      fr: `Le réseau WiFi est ${network} et le mot de passe est ${password}.`,
      de: `Das WLAN heißt ${network} und das Passwort lautet ${password}.`
    }[normalizedLanguage];
  }

  const knownSpanishValue = KNOWLEDGE_TRANSLATIONS[matchedKey]?.es;

  if (!knownSpanishValue || normalize(reply) !== normalize(knownSpanishValue)) {
    return reply;
  }

  return KNOWLEDGE_TRANSLATIONS[matchedKey]?.[normalizedLanguage] || reply;
};

const buildKnowledgeResponse = (reply) => validateAiResponse({
  intent: 'hotel_info',
  confidence: 0.96,
  reply,
  create_ticket: false,
  ticket: {
    category: null,
    title: null,
    description: null,
    priority: null
  },
  escalate_to_human: false,
  emergency: false,
  upsell_opportunity: false
});

export const findKnowledgeAnswerWithMetadata = async (hotelId, message, language = 'es') => {
  const knowledge = await getHotelKnowledge(hotelId);
  const normalizedMessage = normalize(message);

  const matchedRule = KNOWLEDGE_MATCHERS.find((rule) => (
    rule.words.some((word) => normalizedMessage.includes(normalize(word)))
  ));

  if (!matchedRule) {
    return null;
  }

  const matchedEntry = knowledge.find((item) => normalize(item.key) === normalize(matchedRule.key));

  if (!matchedEntry?.value) {
    logger.info('Knowledge intent detected but no answer found', {
      hotelId,
      key: matchedRule.key
    });
    return null;
  }

  logger.info('Knowledge answer found', {
    hotelId,
    key: matchedEntry.key,
    language
  });

  return {
    aiResponse: buildKnowledgeResponse(translateKnowledgeReplyMock({
      key: matchedEntry.key,
      reply: matchedEntry.value,
      language
    })),
    metadata: {
      knowledgeUsed: true,
      knowledgeKey: matchedEntry.key,
      knowledgeValue: matchedEntry.value
    }
  };
};

export const findKnowledgeAnswer = async (hotelId, message, language = 'es') => {
  const result = await findKnowledgeAnswerWithMetadata(hotelId, message, language);

  return result?.aiResponse || null;
};

export const seedDemoKnowledge = async (hotel) => {
  const supabase = getSupabase();

  const existingKnowledge = await getHotelKnowledge(hotel.id);
  const existingKeys = new Set(existingKnowledge.map((item) => normalize(item.key)));
  const missingEntries = KNOWLEDGE_DEMO_ENTRIES
    .filter((entry) => !existingKeys.has(normalize(entry.key)))
    .map((entry) => ({
      hotel_id: hotel.id,
      key: entry.key,
      value: entry.value
    }));

  if (missingEntries.length === 0) {
    return existingKnowledge;
  }

  const { data, error } = await supabase
    .from('hotel_knowledge')
    .insert(missingEntries)
    .select('key, value');

  if (error) {
    throw error;
  }

  logger.info('Demo hotel knowledge seeded', {
    hotelId: hotel.id,
    inserted: missingEntries.length
  });

  return [
    ...existingKnowledge,
    ...(data || [])
  ];
};
