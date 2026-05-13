const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'de'];

const normalize = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

export const detectMessageLanguage = (message) => {
  const text = normalize(message);
  const scores = {
    de: [
      'ich brauche',
      'zimmer',
      'handtucher',
      'wlan',
      'passwort',
      'naturlich',
      'rezeption',
      'wartung',
      'flughafen'
    ],
    fr: [
      'j ai besoin',
      'jai besoin',
      'chambre',
      'serviettes',
      'mot de passe',
      'bien sur',
      'reception',
      'equipe',
      'aeroport'
    ],
    en: [
      'can you',
      'could you',
      'i need',
      'room',
      'towels',
      'of course',
      'wifi',
      'password',
      'reception',
      'airport'
    ],
    es: [
      'necesito',
      'habitacion',
      'toallas',
      'claro',
      'aviso',
      'recepcion',
      'contrasena',
      'aeropuerto'
    ]
  };

  const best = SUPPORTED_LANGUAGES
    .map((language) => ({
      language,
      score: scores[language].filter((signal) => text.includes(normalize(signal))).length
    }))
    .sort((a, b) => b.score - a.score)[0];

  return best.score > 0 ? best.language : null;
};

const extractRoom = (message) => {
  const match = message.match(/\b(?:habitaci[oó]n|hab\.?|room|chambre|zimmer)\s*(\d{1,5})\b/i);

  if (match?.[1]) {
    return match[1];
  }

  return message.match(/\b\d{3,5}\b/)?.[0] || null;
};

const extractWifi = (message) => {
  const patterns = [
    /(?:red wifi|wifi network)\s+(?:es|is)\s+(.+?)\s+(?:y la contraseña es|and the password is)\s+(.+?)\.?$/i,
    /(?:réseau wifi est)\s+(.+?)\s+et le mot de passe est\s+(.+?)\.?$/i,
    /(?:wlan heißt|wlan heisst)\s+(.+?)\s+und das passwort lautet\s+(.+?)\.?$/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1] && match?.[2]) {
      return {
        network: match[1].trim(),
        password: match[2].trim()
      };
    }
  }

  return null;
};

const classifyMessage = (message) => {
  const text = normalize(message);

  if (includesAny(text, ['handtucher', 'towels', 'toallas', 'serviettes'])) {
    return 'towels';
  }

  if (includesAny(text, ['wifi', 'wlan', 'passwort', 'password', 'contrasena', 'mot de passe'])) {
    return 'wifi';
  }

  if (includesAny(text, ['aire acondicionado', 'air conditioning', 'climatisation', 'klimaanlage'])) {
    return 'airConditioning';
  }

  if (includesAny(text, ['taxi', 'airport', 'aeropuerto', 'aeroport', 'flughafen'])) {
    return 'taxi';
  }

  if (includesAny(text, ['enfadado', 'nobody helps', 'personne ne m aide', 'niemand hilft', 'molestias', 'inconvenience', 'gene occasionnee', 'unannehmlichkeiten'])) {
    return 'complaint';
  }

  if (includesAny(text, ['humo', 'smoke', 'fumee', 'rauch im', 'rauch in', 'emergencia', 'emergency', 'urgence', 'notfall'])) {
    return 'emergency';
  }

  return null;
};

const roomText = (room, language) => ({
  es: room ? `en la habitación ${room}` : 'en la habitación',
  en: room ? `in room ${room}` : 'in the room',
  fr: room ? `dans la chambre ${room}` : 'dans la chambre',
  de: room ? `in Zimmer ${room}` : 'im Zimmer'
}[language]);

const buildTranslation = ({ intent, targetLanguage, room, wifi }) => {
  const translations = {
    towels: {
      es: `Necesito dos toallas ${roomText(room, 'es')}.`,
      en: `I need two towels ${roomText(room, 'en')}.`,
      fr: `J’ai besoin de deux serviettes ${roomText(room, 'fr')}.`,
      de: `Ich brauche zwei Handtücher ${roomText(room, 'de')}.`
    },
    wifi: {
      es: wifi
        ? `La red WiFi es ${wifi.network} y la contraseña es ${wifi.password}.`
        : 'Pregunta por la contraseña del WiFi.',
      en: wifi
        ? `The WiFi network is ${wifi.network} and the password is ${wifi.password}.`
        : 'Asks for the WiFi password.',
      fr: wifi
        ? `Le réseau WiFi est ${wifi.network} et le mot de passe est ${wifi.password}.`
        : 'Demande le mot de passe du WiFi.',
      de: wifi
        ? `Das WLAN heißt ${wifi.network} und das Passwort lautet ${wifi.password}.`
        : 'Fragt nach dem WLAN-Passwort.'
    },
    airConditioning: {
      es: `El aire acondicionado no funciona ${roomText(room, 'es')}.`,
      en: `The air conditioning is not working ${roomText(room, 'en')}.`,
      fr: `La climatisation ne fonctionne pas ${roomText(room, 'fr')}.`,
      de: `Die Klimaanlage funktioniert nicht ${roomText(room, 'de')}.`
    },
    taxi: {
      es: room ? `Necesita ayuda con un taxi desde la habitación ${room}.` : 'Necesita ayuda con un taxi o traslado.',
      en: room ? `Needs help with a taxi from room ${room}.` : 'Needs help with a taxi or transfer.',
      fr: room ? `A besoin d’aide pour un taxi depuis la chambre ${room}.` : 'A besoin d’aide pour un taxi ou transfert.',
      de: room ? `Benötigt Hilfe mit einem Taxi von Zimmer ${room}.` : 'Benötigt Hilfe mit einem Taxi oder Transfer.'
    },
    complaint: {
      es: 'El huésped está molesto y necesita atención prioritaria.',
      en: 'The guest is upset and needs priority attention.',
      fr: 'Le client est mécontent et nécessite une attention prioritaire.',
      de: 'Der Gast ist verärgert und benötigt priorisierte Unterstützung.'
    },
    emergency: {
      es: room ? `Emergencia o posible riesgo de seguridad en la habitación ${room}.` : 'Emergencia o posible riesgo de seguridad.',
      en: room ? `Emergency or possible safety risk in room ${room}.` : 'Emergency or possible safety risk.',
      fr: room ? `Urgence ou risque potentiel pour la sécurité dans la chambre ${room}.` : 'Urgence ou risque potentiel pour la sécurité.',
      de: room ? `Notfall oder mögliches Sicherheitsrisiko in Zimmer ${room}.` : 'Notfall oder mögliches Sicherheitsrisiko.'
    }
  };

  return translations[intent]?.[targetLanguage] || null;
};

export const translateMessageForStaff = ({ message, targetLanguage }) => {
  const safeTargetLanguage = SUPPORTED_LANGUAGES.includes(targetLanguage) ? targetLanguage : 'es';
  const sourceLanguage = detectMessageLanguage(message);

  if (!sourceLanguage || sourceLanguage === safeTargetLanguage) {
    return {
      sourceLanguage,
      targetLanguage: safeTargetLanguage,
      translation: null
    };
  }

  const intent = classifyMessage(message);

  if (!intent) {
    return {
      sourceLanguage,
      targetLanguage: safeTargetLanguage,
      translation: null
    };
  }

  return {
    sourceLanguage,
    targetLanguage: safeTargetLanguage,
    translation: buildTranslation({
      intent,
      targetLanguage: safeTargetLanguage,
      room: extractRoom(message),
      wifi: extractWifi(message)
    })
  };
};
