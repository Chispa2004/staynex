const normalize = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const LANGUAGE_SIGNALS = {
  bg: [
    'zakuska',
    'staya',
    'koga',
    'molya',
    'blagodarya',
    'rezerviram',
    'ekskurzii',
    'дейности',
    'екскурзии',
    'стая',
    'закуска',
    'моля',
    'благодаря'
  ],
  ru: [
    'spasibo',
    'nomer',
    'zavtrak',
    'pozhaluysta',
    'ekskursii',
    'комната',
    'номер',
    'завтрак',
    'пожалуйста',
    'экскурсии'
  ],
  ar: [
    'غرفة',
    'فطور',
    'شكرا',
    'من فضلك',
    'رحلات',
    'حجز'
  ],
  it: [
    'colazione',
    'camera',
    'asciugamani',
    'per favore',
    'escursioni',
    'prenotare',
    'wifi'
  ],
  pt: [
    'pequeno almoço',
    'pequeno-almoco',
    'cafe da manha',
    'quarto',
    'toalhas',
    'por favor',
    'excursões',
    'excursao'
  ],
  nl: [
    'ontbijt',
    'kamer',
    'handdoeken',
    'alsjeblieft',
    'excursies',
    'boeken'
  ],
  pl: [
    'sniadanie',
    'pokoj',
    'reczniki',
    'prosze',
    'wycieczki',
    'zarezerwowac'
  ],
  de: [
    'was',
    'welche',
    'ausfluge',
    'empfehlen',
    'ich brauche',
    'handtucher',
    'zimmer',
    'bitte',
    'wann',
    'wann beginnt',
    'fruhstuck',
    'frühstück',
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

export const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'de', 'it', 'pt', 'bg', 'ru', 'ar', 'nl', 'pl'];

const detectByScript = (value = '') => {
  if (/[\u0600-\u06ff]/.test(value)) {
    return 'ar';
  }

  if (/[а-яё]/i.test(value)) {
    const normalizedValue = normalize(value);
    const bgSignals = LANGUAGE_SIGNALS.bg.filter((signal) => normalizedValue.includes(normalize(signal))).length;
    const ruSignals = LANGUAGE_SIGNALS.ru.filter((signal) => normalizedValue.includes(normalize(signal))).length;

    return bgSignals >= ruSignals ? 'bg' : 'ru';
  }

  return null;
};

export const detectGuestLanguage = (message, fallbackLanguage = 'es') => {
  const scriptLanguage = detectByScript(message);

  if (scriptLanguage) {
    return scriptLanguage;
  }

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
