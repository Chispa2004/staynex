const normalize = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const LANGUAGE_SIGNALS = {
  de: [
    'was',
    'welche',
    'ausfluge',
    'empfehlen',
    'ich brauche',
    'handtucher',
    'zimmer',
    'bitte',
    'wlan',
    'passwort',
    'wie lautet',
    'rauch',
    'klimaanlage',
    'flughafen'
  ],
  fr: [
    'quelles',
    'excursions',
    'recommandez',
    'activites',
    'j ai besoin',
    'jai besoin',
    'serviettes',
    'chambre',
    'mot de passe',
    'quelle est',
    'bonjour',
    'piscine',
    'climatisation',
    'aeroport'
  ],
  en: [
    'what tours',
    'what excursions',
    'what activities',
    'recommend',
    'activities',
    'excursions',
    'can you',
    'could you',
    'please',
    'towels',
    'room',
    'breakfast',
    'wifi',
    'checkout',
    'taxi',
    'airport'
  ],
  es: [
    'que excursiones',
    'excursiones',
    'actividades',
    'recomendais',
    'recomiendas',
    'necesito',
    'habitacion',
    'hab ',
    'toallas',
    'desayuno',
    'contrasena',
    'recepcion',
    'aeropuerto',
    'piscina'
  ]
};

export const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'de'];

export const detectGuestLanguage = (message, fallbackLanguage = 'es') => {
  const text = normalize(message);
  const scoredLanguages = SUPPORTED_LANGUAGES.map((language) => ({
    language,
    score: LANGUAGE_SIGNALS[language].filter((signal) => text.includes(normalize(signal))).length
  })).sort((a, b) => b.score - a.score);

  const bestMatch = scoredLanguages[0];

  if (bestMatch.score > 0) {
    return bestMatch.language;
  }

  return SUPPORTED_LANGUAGES.includes(fallbackLanguage) ? fallbackLanguage : 'es';
};

export const normalizeLanguage = (language) => (
  SUPPORTED_LANGUAGES.includes(language) ? language : 'es'
);
