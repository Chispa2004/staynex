const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const tokenize = (value = '') => normalize(value)
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter((token) => token.length > 2);

const unique = (items = []) => [...new Set(items.filter(Boolean))];

const chooseVariant = (variants = [], seed = 0) => {
  if (!variants.length) return '';
  return variants[Math.abs(Number(seed || 0)) % variants.length];
};

export const AI_STYLE_PROFILES = {
  luxury_concierge: {
    id: 'luxury_concierge',
    label: 'Luxury Concierge',
    tone: 'premium, elegant, subtle, calm, non-pushy',
    maxSentences: 2,
    emojiPolicy: 'at most one subtle emoji when it feels natural'
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    tone: 'friendly, concise, relaxed',
    maxSentences: 2,
    emojiPolicy: 'light use only'
  },
  business_hotel: {
    id: 'business_hotel',
    label: 'Business Hotel',
    tone: 'efficient, calm, professional',
    maxSentences: 2,
    emojiPolicy: 'rare'
  },
  family_resort: {
    id: 'family_resort',
    label: 'Family Resort',
    tone: 'warm, practical, helpful',
    maxSentences: 2,
    emojiPolicy: 'warm but not excessive'
  }
};

const offerCooldownHours = {
  romantic_package: 24,
  late_checkout: 12,
  spa: 24,
  airport_transfer: 24,
  room_upgrade: 12,
  dinner: 12,
  breakfast_upgrade: 12,
  early_checkin: 12,
  luggage_storage: 12,
  shower_room: 12,
  wine: 24,
  family_activities: 24,
  extra_bed: 12,
  babysitting: 24,
  kids_menu: 12,
  vip_welcome: 24,
  boat_tour: 24,
  sunset_cruise: 24,
  snorkeling: 24,
  beach_club: 24,
  water_park: 24,
  romantic_dinner: 24,
  spa_couple: 24,
  wine_tasting: 24,
  yacht_experience: 24,
  private_transfer: 24,
  premium_dining: 24,
  golf: 24,
  cultural_tour: 24,
  gastronomy_tour: 24,
  museum_visit: 24,
  indoor_spa: 24,
  local_experiences: 24
};

const offerIntentMap = {
  room_upgrade_interest: 'room_upgrade',
  late_checkout_interest: 'late_checkout',
  airport_transfer_interest: 'airport_transfer',
  romantic_package_interest: 'romantic_package',
  spa_interest: 'spa',
  restaurant_interest: 'dinner'
};

const offerKeywords = {
  romantic_package: ['romantic', 'romantico', 'romantica', 'anniversary', 'aniversario', 'honeymoon', 'luna de miel', 'celebrating', 'celebramos'],
  late_checkout: ['late checkout', 'leave later', 'salir mas tarde', 'salida tarde', 'checkout tarde', 'check out tarde'],
  spa: ['spa', 'massage', 'masaje', 'wellness', 'relax', 'relaj'],
  airport_transfer: ['airport transfer', 'airport', 'aeropuerto', 'transfer', 'traslado', 'flight', 'vuelo'],
  room_upgrade: ['upgrade', 'suite', 'better room', 'habitacion mejor', 'mejor habitacion'],
  dinner: ['restaurant', 'restaurante', 'dinner', 'cena', 'table', 'mesa'],
  breakfast_upgrade: ['breakfast included', 'add breakfast', 'anadir desayuno', 'desayuno incluido'],
  early_checkin: ['arrive early', 'early arrival', 'flight lands early', 'check in before', 'early check-in', 'early checkin', 'llegamos pronto', 'llegamos temprano', 'entrar antes'],
  luggage_storage: ['luggage', 'bags', 'equipaje', 'maletas'],
  shower_room: ['shower room', 'ducha'],
  wine: ['wine', 'vino', 'cava', 'champagne'],
  family_activities: ['children', 'kids', 'family', 'ninos', 'niños', 'familia'],
  extra_bed: ['extra bed', 'cama extra'],
  babysitting: ['babysitting', 'babysitter', 'canguro'],
  kids_menu: ['kids menu', 'menu infantil'],
  vip_welcome: ['vip', 'welcome amenity'],
  boat_tour: ['boat', 'catamaran', 'boat tour', 'excursion', 'barco', 'catamaran'],
  sunset_cruise: ['sunset cruise', 'sunset', 'atardecer'],
  snorkeling: ['snorkeling', 'snorkel', 'scuba', 'buceo'],
  beach_club: ['beach club', 'beach', 'playa', 'club de playa'],
  water_park: ['water park', 'parque acuatico'],
  romantic_dinner: ['romantic dinner', 'cena romantica', 'honeymoon', 'anniversary', 'luna de miel', 'aniversario'],
  spa_couple: ['couple spa', 'spa couple', 'spa pareja'],
  wine_tasting: ['wine tasting', 'cata', 'vino'],
  yacht_experience: ['yacht', 'yate', 'private boat', 'barco privado'],
  private_transfer: ['private transfer', 'transfer privado'],
  premium_dining: ['premium dining', 'fine dining', 'gastronomy', 'gastronomia'],
  golf: ['golf'],
  cultural_tour: ['museum', 'old town', 'culture', 'museo', 'casco antiguo', 'cultura'],
  gastronomy_tour: ['gastronomy tour', 'local food', 'gastronomia', 'comida local'],
  museum_visit: ['museum', 'museo'],
  indoor_spa: ['rain', 'rainy', 'bad weather', 'indoor', 'lluvia', 'mal tiempo', 'interior'],
  local_experiences: ['what to do', 'activities', 'plans', 'que hacer', 'actividades', 'planes']
};

const informationalKeywords = [
  'what time',
  'when is',
  'where is',
  'horario',
  'hora',
  'a que hora',
  'donde',
  'where',
  'breakfast',
  'desayuno',
  'wifi',
  'parking',
  'pool',
  'piscina',
  'checkout',
  'check-out',
  'check out',
  'checkin',
  'check-in',
  'check in',
  'restaurant hours',
  'horario restaurante'
];

const complaintKeywords = [
  'complaint',
  'angry',
  'upset',
  'terrible',
  'unacceptable',
  'refund',
  'noise',
  'noisy',
  'dirty',
  'ruido',
  'sucio',
  'muy mal',
  'queja',
  'reembolso',
  'enfadado',
  'enfadada'
];

const maintenanceKeywords = [
  'ducha',
  'agua',
  'grifo',
  'bano',
  'baño',
  'aire acondicionado',
  'climatizacion',
  'tv',
  'television',
  'electricidad',
  'luz',
  'cerradura',
  'wifi no funciona',
  'no funciona',
  'roto',
  'rota',
  'averia',
  'mantenimiento',
  'shower',
  'water',
  'tap',
  'bathroom',
  'air conditioning',
  'broken',
  'not working',
  'electricity',
  'lock',
  'douche',
  'eau',
  'climatisation',
  'ne fonctionne pas',
  'kaputt',
  'funktioniert nicht'
];

const housekeepingKeywords = [
  'toalla',
  'toallas',
  'limpieza',
  'limpiar',
  'limpien',
  'sabanas',
  'sabana',
  'almohada',
  'amenities',
  'towel',
  'towels',
  'cleaning',
  'clean my room',
  'housekeeping',
  'sheet',
  'sheets',
  'pillow',
  'serviette',
  'serviettes',
  'menage',
  'nettoyer',
  'handtuch',
  'reinigung'
];

const emergencyKeywords = [
  'humo',
  'fuego',
  'incendio',
  'emergencia',
  'urgente',
  'peligro',
  'fuga',
  'inundacion',
  'puerta bloqueada',
  'smoke',
  'fire',
  'emergency',
  'urgent',
  'danger',
  'leak',
  'flood',
  'locked door',
  'fumee',
  'feu',
  'urgence',
  'rauch',
  'feuer',
  'notfall'
];

const genericFallbackPatterns = [
  /de acuerdo.*lo reviso.*siguiente paso/,
  /lo reviso.*te indico/,
  /para no darte.*respuesta incorrecta/,
  /paso esta consulta.*recepcion/,
  /recepcion.*te ayudara/,
  /recepcion.*se pondra en contacto/,
  /he avisado.*recepcion/,
  /lo consulto internamente/,
  /lo paso.*equipo/,
  /equipo.*revisarlo/,
  /vamos paso.*solicitud.*proveedor/,
  /preparo.*solicitud.*proveedor/,
  /paso nota/,
  /i will check.*next step/,
  /forwarding.*reception/,
  /pass this.*reception/,
  /reception.*will help/,
  /to avoid giving.*wrong answer/
];

const hoursSince = (value) => {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (Date.now() - time) / 3600000;
};

export const getOfferCooldownHours = (offerType) => offerCooldownHours[offerType] || 12;

export const detectMessageFocus = (message = '') => {
  const text = normalize(message);
  const mentionedOfferTypes = Object.entries(offerKeywords)
    .filter(([, words]) => includesAny(text, words))
    .map(([type]) => type);

  if (includesAny(text, complaintKeywords)) {
    return {
      type: 'complaint',
      mentionedOfferTypes,
      informational: false,
      revenueSafe: false
    };
  }

  const informational = /[?¿]/.test(message) || includesAny(text, informationalKeywords);

  return {
    type: informational ? 'informational' : mentionedOfferTypes.length ? 'offer_interest' : 'general',
    mentionedOfferTypes,
    informational,
    revenueSafe: !informational || mentionedOfferTypes.length > 0
  };
};

export const isOfferExplicitlyRequested = ({ message = '', offerType = null, intent = null } = {}) => {
  if (!offerType) {
    return false;
  }

  const text = normalize(message);

  return includesAny(text, offerKeywords[offerType] || []);
};

export const shouldSuppressOfferForNaturalConversation = ({
  message = '',
  offerType = null,
  intent = null,
  opportunity = null,
  conversationState = null,
  risk = null,
  sentiment = null
} = {}) => {
  if (!offerType) {
    return {
      suppress: false,
      reason: null
    };
  }

  const focus = detectMessageFocus(message);

  if (risk?.hasRisk || ['negative', 'urgent'].includes(sentiment) || focus.type === 'complaint') {
    return {
      suppress: true,
      reason: 'guest_needs_resolution'
    };
  }

  if (conversationState?.suppressedOffer) {
    return {
      suppress: true,
      reason: 'conversation_cooldown'
    };
  }

  const explicit = isOfferExplicitlyRequested({
    message,
    offerType,
    intent
  });

  if (!explicit && focus.informational) {
    return {
      suppress: true,
      reason: 'answer_question_first'
    };
  }

  if (!explicit && ['guest_memory', 'reservation_board_basis', 'reservation_room_type', 'pre_arrival', 'departure_timing'].includes(opportunity?.triggerSource)) {
    return {
      suppress: true,
      reason: 'passive_context_only'
    };
  }

  if (opportunity?.timing && !opportunity.timing.allowed) {
    return {
      suppress: true,
      reason: opportunity.timing.reason || 'revenue_timing_blocked'
    };
  }

  return {
    suppress: false,
    reason: null
  };
};

export const stripRepeatedOfferFromResponse = ({
  response = '',
  baseResponse = '',
  offerType = null,
  allowOffer = true
} = {}) => {
  if (!response) {
    return baseResponse || response;
  }

  if (allowOffer) {
    return response;
  }

  const text = normalize(response);
  const blockedKeywords = offerType
    ? offerKeywords[offerType] || []
    : Object.values(offerKeywords).flat();
  const hasOfferLanguage = includesAny(text, [
    ...blockedKeywords,
    'would you like me to',
    'quieres que',
    'puedo ofrecer',
    'we also offer',
    'tambien ofrecemos',
    'from €',
    'desde '
  ]);

  return hasOfferLanguage && baseResponse ? baseResponse : response;
};

export const chooseNaturalConciergeResponse = ({
  baseResponse = null,
  openAiSuggestedResponse = null,
  conciergeResponse = null,
  offerType = null,
  offerAllowed = false,
  risk = null
} = {}) => {
  if (risk?.hasRisk) {
    return conciergeResponse || openAiSuggestedResponse || baseResponse;
  }

  if (!offerAllowed) {
    const candidate = stripRepeatedOfferFromResponse({
      response: openAiSuggestedResponse || baseResponse,
      baseResponse,
      offerType,
      allowOffer: false
    });

    return candidate || baseResponse || null;
  }

  return openAiSuggestedResponse || conciergeResponse || baseResponse || null;
};

export const getClarificationCount = (conversationState = {}) => (
  Number(conversationState?.previousState?.state_metadata?.smart_response?.clarification_count || 0)
);

export const buildClarificationReply = ({
  language = 'es',
  message = '',
  providerIntent = null,
  variantIndex = 0
} = {}) => {
  const text = normalize(message);
  const looksLikeExperience = providerIntent?.intentType
    || includesAny(text, ['excursion', 'excursiones', 'actividad', 'actividades', 'tour', 'experiencia', 'local experience', 'local experiences']);
  const templates = {
    es: looksLikeExperience
      ? [
        'Creo que hablas de una experiencia. ¿Quieres informacion o quieres que envie una solicitud de disponibilidad?',
        'Para ayudarte bien: ¿buscas detalles de la excursion o quieres iniciar una solicitud de reserva?'
      ]
      : [
        'Disculpa, no estoy seguro de haber entendido bien. ¿Te refieres a una reserva, una incidencia o informacion del hotel?',
        '¿Me puedes dar un poco mas de detalle para ayudarte mejor?',
        'Quiero ayudarte bien. ¿Puedes decirme si es sobre tu habitacion, una reserva o algun servicio del hotel?'
      ],
    en: looksLikeExperience
      ? [
        'I think you mean an experience. Would you like details, or would you like me to send an availability request?',
        'Just to help properly: are you asking for tour details or would you like to start a booking request?'
      ]
      : [
        'Could you share one more detail so I can help properly: is it about your room, a reservation, or a hotel service?',
        'I want to help accurately. Is this about your room, a booking, or general hotel information?',
        'Could you clarify the service you mean? I can help with the room, reservations, hotel information or local recommendations.'
      ],
    fr: looksLikeExperience
      ? [
        'Je pense que vous parlez d une experience. Souhaitez-vous des details ou envoyer une demande de disponibilite?',
        'Pour vous aider correctement: souhaitez-vous des informations ou commencer une demande de reservation?'
      ]
      : [
        'Pardon, je ne suis pas certain d avoir bien compris. Parlez-vous d une reservation, d un probleme ou d une information hotel?',
        'Pouvez-vous me donner un peu plus de details pour mieux vous aider?',
        'Je veux vous repondre correctement. Est-ce au sujet de votre chambre, d une reservation ou d un service de l hotel?'
      ],
    de: looksLikeExperience
      ? [
        'Ich glaube, Sie meinen ein Erlebnis. Moechten Sie Details oder soll ich eine Verfuegbarkeitsanfrage senden?',
        'Damit ich richtig helfen kann: Geht es um Informationen zur Tour oder um eine Buchungsanfrage?'
      ]
      : [
        'Entschuldigung, ich bin nicht ganz sicher, ob ich Sie richtig verstanden habe. Geht es um eine Reservierung, ein Problem oder Hotelinformationen?',
        'Koennen Sie mir bitte etwas mehr Details geben, damit ich besser helfen kann?',
        'Ich moechte genau helfen. Geht es um Ihr Zimmer, eine Reservierung oder einen Hotelservice?'
      ]
  };

  return chooseVariant(templates[language] || templates.es, variantIndex);
};

export const buildEscalationReply = ({ language = 'es', reason = null, variantIndex = 0 } = {}) => {
  const incidentType = detectOperationalIncident({ message: '', enhancedRisk: { category: null, reason }, humanEscalation: { humanReason: reason } }).type;

  if (incidentType) {
    return buildOperationalIncidentReply({ language, incidentType, variantIndex });
  }

  if (reason === 'emergency_detected') {
    return {
      es: 'Lo tratamos como urgente. Contacta ahora con recepcion o emergencias si hay riesgo inmediato; lo escalo al equipo del hotel.',
      en: 'We are treating this as urgent. Please contact reception or emergency services now if there is immediate danger; I am escalating it to the hotel team.',
      fr: 'Nous traitons cela comme urgent. Contactez la reception ou les urgences s il y a un danger immediat; je transmets cela a l equipe.',
      de: 'Wir behandeln dies als dringend. Bitte kontaktieren Sie sofort die Rezeption oder den Notdienst, wenn Gefahr besteht; ich leite es an das Hotelteam weiter.'
    }[language] || null;
  }

  if (['complaint_noise', 'negative_sentiment', 'complaint_detected'].includes(reason)) {
    return {
      es: 'Siento mucho la molestia. Lo escalo al equipo del hotel para que puedan ayudarte con prioridad.',
      en: "I'm sorry about the inconvenience. I am escalating this to the hotel team so they can help with priority.",
      fr: 'Je suis desole pour ce desagrement. Je transmets cela a l equipe de l hotel pour une aide prioritaire.',
      de: 'Es tut mir leid fuer die Unannehmlichkeit. Ich leite dies an das Hotelteam weiter, damit es prioritaer behandelt wird.'
    }[language] || null;
  }

  if (['maintenance_issue', 'technical_issue_detected'].includes(reason)) {
    return {
      es: 'Siento mucho la molestia. Marco la incidencia como prioritaria para que el equipo revise la habitacion cuanto antes.',
      en: "I'm sorry for the inconvenience. I am marking this as priority so the team can check the room as soon as possible.",
      fr: 'Je suis desole pour ce desagrement. Je marque cela comme prioritaire afin que l equipe verifie la chambre au plus vite.',
      de: 'Es tut mir leid fuer die Unannehmlichkeit. Ich markiere dies als prioritaer, damit das Team das Zimmer schnell prueft.'
    }[language] || null;
  }

  const templates = {
    es: [
      'Para no darte una respuesta incorrecta, paso esta consulta a recepcion para que puedan ayudarte bien.',
      'Lo derivo a recepcion para revisarlo con cuidado y darte una respuesta correcta.'
    ],
    en: [
      'To avoid giving you the wrong answer, I am forwarding this to reception so they can help properly.',
      'I will pass this to reception so they can review it carefully and give you the right answer.'
    ],
    fr: [
      'Pour eviter de vous donner une mauvaise reponse, je transmets cela a la reception afin qu elle vous aide correctement.',
      'Je transmets cela a la reception pour verifier avec attention et vous repondre correctement.'
    ],
    de: [
      'Damit ich Ihnen keine falsche Antwort gebe, leite ich das an die Rezeption weiter.',
      'Ich gebe das an die Rezeption weiter, damit es sorgfaeltig geprueft wird.'
    ]
  };

  return chooseVariant(templates[language] || templates.es, variantIndex);
};

export const detectOperationalIncident = ({
  message = '',
  aiResponse = {},
  enhancedRisk = {},
  humanEscalation = {}
} = {}) => {
  const text = normalize(message);
  const reason = enhancedRisk?.reason || humanEscalation?.humanReason || aiResponse?.intent || null;
  const category = enhancedRisk?.category || aiResponse?.ticket?.category || null;

  if (
    category === 'emergency'
    || reason === 'emergency_detected'
    || aiResponse?.emergency
    || includesAny(text, emergencyKeywords)
  ) {
    return { type: 'emergency', shouldEscalate: true };
  }

  if (
    category === 'maintenance'
    || ['maintenance_issue', 'technical_issue_detected'].includes(reason)
    || includesAny(text, maintenanceKeywords)
  ) {
    return { type: 'maintenance', shouldEscalate: true };
  }

  if (
    category === 'housekeeping'
    || reason === 'housekeeping_request'
    || aiResponse?.intent === 'housekeeping_request'
    || includesAny(text, housekeepingKeywords)
  ) {
    return { type: 'housekeeping', shouldEscalate: true };
  }

  if (
    category === 'complaint'
    || ['complaint_noise', 'negative_sentiment', 'complaint_detected'].includes(reason)
    || includesAny(text, complaintKeywords)
  ) {
    return { type: 'complaint', shouldEscalate: true };
  }

  return { type: null, shouldEscalate: false };
};

export const buildOperationalIncidentReply = ({
  language = 'es',
  incidentType = 'maintenance',
  variantIndex = 0
} = {}) => {
  const templates = {
    emergency: {
      es: [
        'Lo tratamos como urgente. Aviso ahora mismo al equipo del hotel; si hay riesgo inmediato, contacta tambien con recepcion o emergencias.',
        'He marcado esta incidencia como urgente para el equipo del hotel. Si hay peligro inmediato, por favor contacta con recepcion o emergencias ahora.'
      ],
      en: [
        'We are treating this as urgent. I am alerting the hotel team now; if there is immediate danger, please also contact reception or emergency services.',
        'I have marked this as urgent for the hotel team. If there is immediate danger, please contact reception or emergency services now.'
      ],
      fr: [
        'Nous traitons cela comme urgent. Je prevens tout de suite l equipe de l hotel; en cas de danger immediat, contactez aussi la reception ou les urgences.'
      ],
      de: [
        'Wir behandeln dies als dringend. Ich informiere sofort das Hotelteam; bei unmittelbarer Gefahr kontaktieren Sie bitte auch die Rezeption oder den Notdienst.'
      ]
    },
    maintenance: {
      es: [
        'Entendido. Voy a avisar al equipo de mantenimiento para que revisen la incidencia de la habitacion.',
        'Gracias por avisar. He enviado la incidencia al equipo de mantenimiento para que puedan revisarla cuanto antes.',
        'Lo comunico ahora mismo a mantenimiento para que puedan ayudarte.'
      ],
      en: [
        'Understood. I will notify maintenance so they can check the room issue.',
        'Thank you for letting us know. I have sent this to maintenance so they can review it as soon as possible.',
        'I am passing this to maintenance now so they can help.'
      ],
      fr: [
        'Bien compris. Je vais prevenir la maintenance afin qu elle verifie l incident dans la chambre.',
        'Merci de nous avoir prevenus. Je transmets l incident a la maintenance pour verification au plus vite.'
      ],
      de: [
        'Verstanden. Ich informiere die Wartung, damit sie das Problem im Zimmer pruefen kann.',
        'Danke fuer die Information. Ich habe dies an die Wartung weitergeleitet, damit es schnell geprueft wird.'
      ]
    },
    housekeeping: {
      es: [
        'Gracias por avisar. Lo comunico al equipo de limpieza para que puedan ayudarte.',
        'Entendido. Aviso ahora al equipo de housekeeping para revisar la solicitud.',
        'Lo paso al equipo de limpieza para que puedan atenderlo.'
      ],
      en: [
        'Thank you for letting us know. I will notify housekeeping so they can help.',
        'Understood. I am alerting housekeeping now to review the request.',
        'I will pass this to housekeeping so they can take care of it.'
      ],
      fr: [
        'Merci de nous avoir prevenus. Je transmets cela a l equipe housekeeping pour vous aider.',
        'Bien compris. Je prevens l equipe de menage pour traiter la demande.'
      ],
      de: [
        'Danke fuer die Information. Ich gebe das an das Housekeeping weiter, damit Ihnen geholfen wird.',
        'Verstanden. Ich informiere das Housekeeping, damit die Anfrage bearbeitet wird.'
      ]
    },
    complaint: {
      es: [
        'Siento mucho la molestia. Aviso al equipo del hotel para que revisen la situacion con prioridad.',
        'Gracias por contarnoslo. Lo escalo al equipo del hotel para que puedan ayudarte cuanto antes.'
      ],
      en: [
        "I'm sorry about the inconvenience. I am alerting the hotel team so they can review this with priority.",
        'Thank you for telling us. I am escalating this to the hotel team so they can help as soon as possible.'
      ],
      fr: [
        'Je suis desole pour ce desagrement. Je transmets cela a l equipe de l hotel pour une aide prioritaire.'
      ],
      de: [
        'Es tut mir leid fuer die Unannehmlichkeit. Ich leite dies an das Hotelteam weiter, damit es prioritaer behandelt wird.'
      ]
    }
  };

  return chooseVariant(
    templates[incidentType]?.[language] || templates[incidentType]?.es || templates.maintenance.es,
    variantIndex
  );
};

export const areResponsesSimilar = (first = '', second = '') => {
  const a = unique(tokenize(first));
  const b = unique(tokenize(second));

  if (!a.length || !b.length) return false;

  const overlap = a.filter((token) => b.includes(token)).length;
  const ratio = overlap / Math.max(a.length, b.length);

  return ratio >= 0.64 || normalize(first) === normalize(second);
};

export const detectRepeatedResponse = ({ response = '', recentMessages = [], previousResponse = null } = {}) => {
  const candidates = [
    previousResponse,
    ...(recentMessages || [])
      .filter((item) => ['ai', 'assistant'].includes(item.sender_type || item.senderType))
      .map((item) => item.content)
  ].filter(Boolean);

  return candidates.some((candidate) => areResponsesSimilar(response, candidate));
};

export const isGenericFallbackResponse = (response = '') => {
  const text = normalize(response);
  return genericFallbackPatterns.some((pattern) => pattern.test(text));
};

export const countRecentFallbackResponses = ({ recentMessages = [], previousResponse = null } = {}) => {
  const candidates = [
    previousResponse,
    ...(recentMessages || [])
      .filter((item) => ['ai', 'assistant'].includes(item.sender_type || item.senderType))
      .map((item) => item.content)
  ].filter(Boolean);

  return candidates.filter(isGenericFallbackResponse).length;
};

export const isSimpleGreetingMessage = (message = '') => {
  const text = normalize(message)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return false;
  }

  return new Set([
    'hola',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'buenas noches',
    'hello',
    'hi',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'bonjour',
    'salut',
    'hallo',
    'guten tag'
  ]).has(text);
};

export const detectGuestRepairIntent = ({ message = '', providerIntent = null, conversationState = {} } = {}) => {
  const text = normalize(message);
  const bookingState = conversationState?.previousState?.state_metadata?.experience_booking_state || {};
  const providerBookingCompleted = Boolean(
    bookingState.status === 'completed'
    || bookingState.provider_flow_active === false
    || bookingState.provider_request_sent
    || bookingState.provider_email_sent
    || bookingState.provider_email_status === 'sent'
    || bookingState.closed_at
  );

  if (isSimpleGreetingMessage(message)) {
    return 'greeting_fallback';
  }

  if (providerBookingCompleted && isProviderBookingStatusQuestion(message)) {
    return 'completed_booking_status';
  }

  if (providerBookingCompleted && providerIntent?.matchedExperience) {
    return 'experience_fallback';
  }

  if (includesAny(text, ['excursion', 'excursiones', 'tour', 'tours', 'experiencia', 'experiencias', 'actividad', 'actividades', 'recomendais', 'recomiendas', 'recommend', 'things to do'])) {
    return 'experience_fallback';
  }

  if (
    !providerBookingCompleted
    && (providerIntent?.matchedExperience || bookingState?.detected_experience || bookingState?.awaiting_guest_confirmation || bookingState?.awaiting_guest_details)
  ) {
    return 'booking_fallback';
  }

  if (includesAny(text, ['emergencia', 'urgent', 'urgente', 'emergency', 'peligro', 'danger'])) {
    return 'emergency_fallback';
  }

  if (includesAny(text, ['aire acondicionado', 'ac', 'ruido', 'noise', 'limpieza', 'cleaning', 'roto', 'broken', 'maintenance', 'mantenimiento'])) {
    return 'maintenance_fallback';
  }

  if (includesAny(text, informationalKeywords)) {
    return 'hotel_info_fallback';
  }

  return 'unknown_fallback';
};

export const isProviderBookingStatusQuestion = (message = '') => {
  const text = normalize(message);

  return includesAny(text, [
    'como va',
    'como sigue',
    'que paso',
    'hay respuesta',
    'han confirmado',
    'confirmacion',
    'disponibilidad',
    'estado',
    'status',
    'solicitud',
    'request',
    'booking',
    'reserva',
    'excursion enviada',
    'excursion',
    'tour'
  ]) && includesAny(text, [
    'va',
    'estado',
    'status',
    'confirm',
    'respuesta',
    'respondido',
    'sent',
    'enviada',
    'solicitud',
    'request',
    'reserva'
  ]);
};

const getCompletedProviderBookingState = (conversationState = {}) => {
  const bookingState = conversationState?.previousState?.state_metadata?.experience_booking_state || {};
  const completed = Boolean(
    bookingState.status === 'completed'
    || bookingState.provider_flow_active === false
    || bookingState.provider_request_sent
    || bookingState.provider_email_sent
    || bookingState.provider_email_status === 'sent'
    || bookingState.closed_at
  );

  return completed ? bookingState : null;
};

const buildCompletedBookingSummaryReply = ({ language = 'es', bookingState = {} } = {}) => {
  const experienceTitle = bookingState.detected_experience || bookingState.experience_title || 'la experiencia';
  const provider = bookingState.provider || bookingState.provider_source || 'el proveedor';
  const requestedDate = bookingState.requested_date ? ` para ${bookingState.requested_date}` : '';
  const guests = bookingState.guest_count || bookingState.guests_count
    ? ` para ${bookingState.guest_count || bookingState.guests_count} personas`
    : '';

  return {
    es: `La solicitud de ${experienceTitle}${requestedDate}${guests} ya fue enviada a ${provider}. Te avisaremos cuando tengamos confirmacion de disponibilidad.`,
    en: `The request for ${experienceTitle}${requestedDate}${guests} has already been sent to ${provider}. We will let you know when availability is confirmed.`,
    fr: `La demande pour ${experienceTitle}${requestedDate}${guests} a deja ete envoyee a ${provider}. Nous vous informerons des que la disponibilite sera confirmee.`,
    de: `Die Anfrage fuer ${experienceTitle}${requestedDate}${guests} wurde bereits an ${provider} gesendet. Wir informieren Sie, sobald die Verfuegbarkeit bestaetigt ist.`
  }[language] || `The request for ${experienceTitle}${requestedDate}${guests} has already been sent to ${provider}. We will let you know when availability is confirmed.`;
};

const buildRestoredConciergeReply = ({ language = 'es' } = {}) => ({
  es: 'Hola, te ayudo. Quieres informacion sobre experiencias, restaurante, transfer o algun servicio del hotel?',
  en: 'Hello, I can help. Would you like information about experiences, restaurant, transfer or another hotel service?',
  fr: 'Bonjour, je peux vous aider. Souhaitez-vous des informations sur experiences, restaurant, transfer ou un autre service de l hotel?',
  de: 'Hallo, ich helfe gern. Moechten Sie Informationen zu Erlebnissen, Restaurant, Transfer oder einem anderen Hotelservice?'
}[language] || 'Hello, I can help. Would you like information about experiences, restaurant, transfer or another hotel service?');

const buildPostBookingConciergeReply = ({ language = 'es', message = '', bookingState = {} } = {}) => (
  isProviderBookingStatusQuestion(message)
    ? {
      reply: buildCompletedBookingSummaryReply({ language, bookingState }),
      intent: 'completed_booking_status'
    }
    : {
      reply: buildRestoredConciergeReply({ language }),
      intent: 'concierge_mode_restored'
    }
);

const hasResidualProviderState = (conversationState = {}) => {
  const metadata = conversationState?.previousState?.state_metadata || {};
  const bookingState = metadata.experience_booking_state || {};

  return Boolean(
    bookingState.detected_experience
    || bookingState.awaiting_guest_details
    || bookingState.awaiting_guest_confirmation
    || bookingState.awaiting_confirmation
    || bookingState.provider_flow_active
    || metadata.provider_booking_repair_mode
    || metadata.fallback_context
    || metadata.pending_provider_flow
    || metadata.pending_handoff
    || metadata.soft_handoff
    || metadata.low_confidence_recovery
    || metadata.repair_mode
  );
};

export const buildRepairModeReply = ({
  language = 'es',
  message = '',
  providerIntent = null,
  conversationState = {},
  variantIndex = 0
} = {}) => {
  const repairIntent = detectGuestRepairIntent({ message, providerIntent, conversationState });
  const bookingState = conversationState?.previousState?.state_metadata?.experience_booking_state || {};
  const completedExperienceTitle = bookingState.detected_experience || bookingState.experience_title || 'la experiencia';
  const completedProvider = bookingState.provider || bookingState.provider_source || 'el proveedor';
  const completedDate = bookingState.requested_date ? ` para ${bookingState.requested_date}` : '';
  const completedGuests = bookingState.guest_count || bookingState.guests_count
    ? ` para ${bookingState.guest_count || bookingState.guests_count} personas`
    : '';
  const templates = {
    completed_booking_status: {
      es: [
        `La solicitud de ${completedExperienceTitle}${completedDate}${completedGuests} ya ha sido enviada a ${completedProvider}. Te avisaremos cuando tengamos confirmacion de disponibilidad.`
      ],
      en: [
        `The request for ${completedExperienceTitle}${completedDate}${completedGuests} has already been sent to ${completedProvider}. We will let you know when availability is confirmed.`
      ],
      fr: [
        `Bonjour, je peux vous aider. La demande pour ${completedExperienceTitle}${completedDate}${completedGuests} a deja ete envoyee a ${completedProvider}. Nous vous informerons des que la disponibilite sera confirmee.`
      ],
      de: [
        `Hallo, ich helfe gern. Die Anfrage fuer ${completedExperienceTitle}${completedDate}${completedGuests} wurde bereits an ${completedProvider} gesendet. Wir informieren Sie, sobald die Verfuegbarkeit bestaetigt ist.`
      ]
    },
    experience_fallback: {
      es: [
        'Te ayudo con excursiones. Puedo mostrarte opciones disponibles o, si ya tienes una en mente, dime la excursion, fecha y numero de personas.',
        'Ahora te explico las opciones de experiencias. Si quieres reservar alguna, necesito excursion, fecha y numero de personas.'
      ],
      en: [
        'I can help with local experiences. I can show available options, or if you already have one in mind, send me the tour, date and number of people.',
        'Let me help with the experience options. To request one, I need the experience, preferred date and number of people.'
      ],
      fr: [
        'Je peux vous aider avec les experiences. Je peux montrer les options ou, si vous en avez une en tete, envoyez-moi experience, date et nombre de personnes.'
      ],
      de: [
        'Ich helfe gern mit Erlebnissen. Ich kann Optionen zeigen oder, wenn Sie schon eines im Kopf haben, brauche ich Erlebnis, Datum und Personenzahl.'
      ]
    },
    booking_fallback: {
      es: [
        'Perdona, no quiero repetirme. Para enviar la solicitud al proveedor necesito tener claro: excursion, fecha y numero de personas. Lo intentamos de nuevo con esos datos.',
        'Vamos paso a paso: dime la excursion, fecha y numero de personas, y preparo de nuevo la solicitud al proveedor.'
      ],
      en: [
        'Sorry, I do not want to repeat myself. To send the provider request, I need the experience, date and number of people. We can try again with those details.',
        'Let us go step by step: send me the experience, date and number of people, and I will prepare the provider request again.'
      ],
      fr: [
        'Pardon, je ne veux pas me repeter. Pour envoyer la demande au prestataire, il me faut experience, date et nombre de personnes.'
      ],
      de: [
        'Entschuldigung, ich moechte mich nicht wiederholen. Fuer die Anfrage brauche ich Erlebnis, Datum und Personenzahl.'
      ]
    },
    greeting_fallback: {
      es: [
        'Hola, estoy aqui para ayudarte. Quieres informacion sobre experiencias, restaurante, late checkout o algun servicio del hotel?',
        'Hola, te ayudo. Puedes pedirme excursiones, restaurante, late checkout, tickets o informacion del hotel.'
      ],
      en: [
        'Hello, I am here to help. Would you like information about experiences, restaurant, late checkout or a hotel service?',
        'Hi, I can help. You can ask me about experiences, restaurant, late checkout, tickets or hotel information.'
      ],
      fr: [
        'Bonjour, je suis la pour vous aider. Souhaitez-vous des informations sur experiences, restaurant, late checkout ou un service de l hotel?'
      ],
      de: [
        'Hallo, ich helfe gern. Moechten Sie Informationen zu Erlebnissen, Restaurant, Late Check-out oder einem Hotelservice?'
      ]
    },
    maintenance_fallback: {
      es: ['Entiendo. Si es una incidencia de habitacion, dime que ocurre y tu habitacion para crear o actualizar el aviso al equipo.'],
      en: ['I understand. If this is a room issue, please tell me what happened and your room number so the team can follow it up.'],
      fr: ['Je comprends. Si c est un probleme de chambre, indiquez-moi ce qui se passe et votre numero de chambre.'],
      de: ['Ich verstehe. Wenn es ein Zimmerproblem ist, sagen Sie mir bitte, was passiert ist und Ihre Zimmernummer.']
    },
    hotel_info_fallback: {
      es: ['Te ayudo con informacion del hotel. Dime si buscas horarios, servicios, reservas, transporte o recomendaciones locales.'],
      en: ['I can help with hotel information. Tell me if you need opening hours, services, bookings, transport or local recommendations.'],
      fr: ['Je peux vous aider avec les informations hotel: horaires, services, reservations, transport ou recommandations locales.'],
      de: ['Ich helfe mit Hotelinformationen: Oeffnungszeiten, Services, Buchungen, Transfer oder lokale Empfehlungen.']
    },
    emergency_fallback: {
      es: ['Si es urgente o hay riesgo inmediato, contacta ahora con recepcion o emergencias. Tambien puedo avisar al equipo del hotel con prioridad.'],
      en: ['If this is urgent or there is immediate danger, please contact reception or emergency services now. I can also alert the hotel team with priority.'],
      fr: ['Si c est urgent ou dangereux, contactez maintenant la reception ou les urgences. Je peux aussi prevenir l equipe en priorite.'],
      de: ['Wenn es dringend ist oder Gefahr besteht, kontaktieren Sie bitte sofort Rezeption oder Notdienst. Ich kann auch das Hotelteam priorisieren.']
    },
    unknown_fallback: {
      es: [
        'Perdona, no quiero repetirme. Para ayudarte mejor, elige una opcion: excursiones, restaurante, late checkout, informacion del hotel o hablar con recepcion.',
        'Vamos a aclararlo: te refieres a reservar una excursion, pedir informacion del hotel o hablar con recepcion?'
      ],
      en: [
        'Sorry, I do not want to repeat myself. To help better, choose one option: experiences, restaurant, late checkout, hotel information or reception.',
        'Let us clarify it: do you mean booking an experience, hotel information, or speaking with reception?'
      ],
      fr: [
        'Pardon, je ne veux pas me repeter. Choisissez une option: experiences, restaurant, late checkout, information hotel ou reception.'
      ],
      de: [
        'Entschuldigung, ich moechte mich nicht wiederholen. Waehlen Sie bitte: Erlebnisse, Restaurant, Late Check-out, Hotelinfo oder Rezeption.'
      ]
    }
  };

  return {
    reply: chooseVariant(templates[repairIntent]?.[language] || templates[repairIntent]?.es || templates.unknown_fallback.es, variantIndex),
    repairIntent
  };
};

export const improveRepeatedResponse = ({
  response = '',
  language = 'es',
  strategy = 'confirmation',
  variantIndex = 0
} = {}) => {
  const alternatives = {
    clarification: {
      es: ['¿Me puedes concretar un poco mas para ayudarte sin equivocarme?'],
      en: ['Could you clarify one detail so I can help without guessing?'],
      fr: ['Pouvez-vous preciser un peu pour que je vous aide sans me tromper?'],
      de: ['Koennen Sie das kurz genauer sagen, damit ich richtig helfen kann?']
    },
    escalation: {
      es: ['Lo paso al equipo para revisarlo con cuidado y responderte correctamente.'],
      en: ['I will pass this to the team so they can review it carefully and answer correctly.'],
      fr: ['Je transmets cela a l equipe pour verification et reponse correcte.'],
      de: ['Ich gebe das an das Team weiter, damit es sorgfaeltig geprueft wird.']
    },
    confirmation: {
      es: ['Te ayudo. Dime el dato concreto que falta y avanzamos desde aqui.'],
      en: ['I can help. Send me the missing detail and we will move forward from here.'],
      fr: ['Je peux vous aider. Envoyez-moi le detail manquant et nous avancerons ensuite.'],
      de: ['Ich helfe gern. Senden Sie mir das fehlende Detail, dann machen wir weiter.']
    }
  };

  return chooseVariant(alternatives[strategy]?.[language] || alternatives.confirmation.es, variantIndex) || response;
};

export const chooseSmarterConciergeResponse = ({
  message = '',
  aiResponse = {},
  language = 'es',
  conversationState = {},
  humanEscalation = { needsHuman: false, humanReason: null },
  enhancedRisk = { hasRisk: false },
  providerIntent = null,
  knowledgeUsed = false,
  recentMessages = []
} = {}) => {
  const confidence = Number(aiResponse?.confidence || 0);
  const intent = aiResponse?.intent || null;
  const originalReply = aiResponse?.reply || '';
  const originalIsGenericFallback = isGenericFallbackResponse(originalReply);
  const previousClarifications = getClarificationCount(conversationState);
  const variantIndex = previousClarifications + (recentMessages?.length || 0);
  const simpleGreeting = isSimpleGreetingMessage(message);
  const explicitHuman = humanEscalation.humanReason === 'human_requested';
  const operationalIncident = detectOperationalIncident({
    message,
    aiResponse,
    enhancedRisk,
    humanEscalation
  });
  const seriousEscalation = Boolean(
    explicitHuman
    || operationalIncident.shouldEscalate
    || enhancedRisk?.hasRisk
    || ['emergency_detected', 'complaint_detected', 'technical_issue_detected'].includes(humanEscalation.humanReason)
  );
  const unclear = Boolean(
    !simpleGreeting
    && (
    !knowledgeUsed
    && !seriousEscalation
    && (
      confidence > 0 && confidence < 0.65
      || intent === 'unknown'
      || humanEscalation.humanReason === 'low_confidence'
      || humanEscalation.humanReason === 'fallback_response'
    )
    )
  );

  let responseStrategy = 'direct_answer';
  let reply = aiResponse?.reply || '';
  let needsHuman = Boolean(humanEscalation.needsHuman);
  let humanReason = humanEscalation.humanReason || null;
  let clarificationUsed = false;
  let escalationReason = humanReason;

  if (seriousEscalation) {
    responseStrategy = explicitHuman ? 'requested_handoff' : 'human_escalation';
    needsHuman = true;
    humanReason = humanReason || enhancedRisk?.reason || 'human_required';
    reply = operationalIncident.type
      ? buildOperationalIncidentReply({
        language,
        incidentType: operationalIncident.type,
        variantIndex
      })
      : buildEscalationReply({
        language,
        reason: humanReason,
        variantIndex
      }) || reply;
  } else if (unclear && previousClarifications >= 1) {
    responseStrategy = 'escalate_after_repeated_unclear';
    needsHuman = true;
    humanReason = 'repeated_unclear_request';
    escalationReason = humanReason;
    reply = buildEscalationReply({
      language,
      reason: humanReason,
      variantIndex
    });
  } else if (unclear) {
    responseStrategy = 'clarification';
    needsHuman = false;
    humanReason = null;
    escalationReason = null;
    clarificationUsed = true;
    reply = buildClarificationReply({
      language,
      message,
      providerIntent,
      variantIndex
    });
  }

  const repeated = detectRepeatedResponse({
    response: reply,
    recentMessages,
    previousResponse: conversationState?.previousState?.last_ai_response
  });
  const recentFallbackCount = countRecentFallbackResponses({
    recentMessages,
    previousResponse: conversationState?.previousState?.last_ai_response
  });
  const currentIsGenericFallback = isGenericFallbackResponse(reply);
  const fallbackLikeTurn = currentIsGenericFallback
    || originalIsGenericFallback
    || ['low_confidence', 'fallback_response'].includes(humanEscalation.humanReason);
  const repeatedFallbackDetected = fallbackLikeTurn && recentFallbackCount >= 1;
  const conversationLoopDetected = recentFallbackCount >= 2 || (repeated && fallbackLikeTurn);
  const completedProviderBookingState = getCompletedProviderBookingState(conversationState);
  const completedBookingFallbackState = Boolean(completedProviderBookingState && fallbackLikeTurn);
  const residualProviderState = hasResidualProviderState(conversationState);
  let repairModeActivated = false;
  let fallbackBlockedDueToRepetition = false;
  let alternativeResponseUsed = false;
  let repairIntent = null;
  let repairModeExpired = false;
  let conciergeModeRestored = false;
  let fallbackStateClearedAfterBooking = false;
  let providerBookingSummaryUsed = false;
  let residualProviderStateIgnoredForGreeting = false;
  let providerRepairModeSuppressedForGreeting = false;
  let conciergeGreetingReturned = false;

  if (!seriousEscalation && simpleGreeting && fallbackLikeTurn) {
    reply = buildRestoredConciergeReply({ language });
    repairIntent = 'greeting_fallback';
    responseStrategy = 'greeting';
    needsHuman = false;
    humanReason = null;
    escalationReason = null;
    clarificationUsed = false;
    repairModeExpired = true;
    conciergeModeRestored = true;
    conciergeGreetingReturned = true;
    fallbackBlockedDueToRepetition = true;
    fallbackStateClearedAfterBooking = residualProviderState;
    residualProviderStateIgnoredForGreeting = residualProviderState;
    providerRepairModeSuppressedForGreeting = residualProviderState;
    alternativeResponseUsed = true;
  } else if (!seriousEscalation && completedBookingFallbackState && !providerIntent?.matchedExperience) {
    const restored = buildPostBookingConciergeReply({
      language,
      message,
      bookingState: completedProviderBookingState
    });
    reply = restored.reply;
    repairIntent = restored.intent;
    responseStrategy = restored.intent === 'completed_booking_status'
      ? 'provider_booking_summary'
      : 'concierge_mode_restored';
    needsHuman = false;
    humanReason = null;
    escalationReason = null;
    clarificationUsed = false;
    repairModeExpired = true;
    conciergeModeRestored = restored.intent === 'concierge_mode_restored';
    providerBookingSummaryUsed = restored.intent === 'completed_booking_status';
    fallbackBlockedDueToRepetition = true;
    fallbackStateClearedAfterBooking = true;
    alternativeResponseUsed = true;
  } else if (!seriousEscalation && (repeatedFallbackDetected || conversationLoopDetected)) {
    const repaired = buildRepairModeReply({
      language,
      message,
      providerIntent,
      conversationState,
      variantIndex: variantIndex + recentFallbackCount + 1
    });
    reply = repaired.reply;
    repairIntent = repaired.repairIntent;
    responseStrategy = 'repair_mode';
    needsHuman = false;
    humanReason = null;
    escalationReason = null;
    clarificationUsed = false;
    repairModeActivated = true;
    fallbackBlockedDueToRepetition = true;
    alternativeResponseUsed = true;
  } else if (repeated || repeatedFallbackDetected) {
    reply = improveRepeatedResponse({
      response: reply,
      language,
      strategy: responseStrategy === 'clarification'
        ? 'clarification'
        : responseStrategy.includes('escalation') || responseStrategy.includes('handoff')
          ? 'escalation'
          : 'confirmation',
      variantIndex: variantIndex + 1
    });
    alternativeResponseUsed = true;
  }

  const nextClarificationCount = clarificationUsed
    ? previousClarifications + 1
    : responseStrategy === 'direct_answer'
      ? 0
      : previousClarifications;

  return {
    aiResponse: {
      ...aiResponse,
      reply,
      confidence: clarificationUsed ? Math.max(confidence, 0.68) : confidence,
      intent: clarificationUsed ? 'clarification_needed' : aiResponse.intent,
      concierge_intent: clarificationUsed ? 'clarification_needed' : aiResponse.concierge_intent,
      escalate_to_human: needsHuman,
      create_ticket: clarificationUsed ? false : aiResponse.create_ticket,
      fallbackUsed: Boolean(aiResponse.fallbackUsed ?? aiResponse.fallback_used),
      fallback_used: Boolean(aiResponse.fallback_used ?? aiResponse.fallbackUsed)
    },
    humanEscalation: {
      needsHuman,
      humanReason
    },
    metadata: {
      response_strategy: responseStrategy,
      clarification_used: clarificationUsed,
      clarification_count: nextClarificationCount,
      escalation_reason: escalationReason,
      repeated_response_detected: repeated,
      repeated_fallback_detected: repeatedFallbackDetected,
      conversation_loop_detected: conversationLoopDetected,
      repair_mode_activated: repairModeActivated,
      repair_mode_expired: repairModeExpired,
      concierge_mode_restored: conciergeModeRestored,
      fallback_state_cleared_after_booking: fallbackStateClearedAfterBooking,
      provider_booking_summary_used: providerBookingSummaryUsed,
      residual_provider_state_ignored_for_greeting: residualProviderStateIgnoredForGreeting,
      provider_repair_mode_suppressed_for_greeting: providerRepairModeSuppressedForGreeting,
      concierge_greeting_returned: conciergeGreetingReturned,
      fallback_blocked_due_to_repetition: fallbackBlockedDueToRepetition,
      alternative_response_used: alternativeResponseUsed,
      recent_fallback_count: recentFallbackCount,
      repair_intent: repairIntent,
      response_variant: variantIndex,
      operational_incident_type: operationalIncident.type,
      operational_incident_wording: Boolean(operationalIncident.type),
      confidence,
      language
    }
  };
};

export const buildResponseGuidance = ({
  message,
  conversationState,
  offerType = null,
  offerSuppression = null,
  styleProfile = AI_STYLE_PROFILES.luxury_concierge
} = {}) => {
  const focus = detectMessageFocus(message);

  return {
    style_profile: styleProfile,
    message_focus: focus.type,
    answer_question_first: true,
    memory_is_passive_context: true,
    offer_type_under_review: offerType || null,
    offer_suppressed: Boolean(offerSuppression?.suppress || conversationState?.suppressedOffer),
    offer_suppression_reason: offerSuppression?.reason || (conversationState?.suppressedOffer ? 'conversation_cooldown' : null),
    offer_cooldown_hours: offerType ? getOfferCooldownHours(offerType) : null,
    last_offer_type: conversationState?.previousState?.last_offer_type || null,
    last_offer_sent_hours_ago: hoursSince(conversationState?.previousState?.last_offer_sent_at)
  };
};
