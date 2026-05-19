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
    || includesAny(text, ['excursion', 'excursiones', 'actividad', 'actividades', 'tour', 'experiencia', 'book', 'reservar']);
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
        'Sorry, I am not completely sure I understood. Do you mean a reservation, an issue, or hotel information?',
        'Could you share a little more detail so I can help properly?',
        'I want to help accurately. Is this about your room, a reservation, or a hotel service?'
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
  if (reason === 'emergency_detected') {
    return {
      es: 'Hemos marcado tu mensaje como urgente. Por favor, contacta tambien inmediatamente con recepcion o emergencias si hay riesgo para tu seguridad. Lo derivo ahora a recepcion.',
      en: 'We have marked your message as urgent. Please also contact reception or emergency services immediately if there is any risk to your safety. I am forwarding this to reception now.',
      fr: 'Nous avons marque votre message comme urgent. Veuillez aussi contacter immediatement la reception ou les urgences s il y a un risque pour votre securite. Je le transmets maintenant.',
      de: 'Wir haben Ihre Nachricht als dringend markiert. Bitte kontaktieren Sie sofort auch die Rezeption oder den Notdienst, falls Gefahr besteht. Ich leite dies jetzt weiter.'
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
      es: ['De acuerdo, lo reviso y te indico el siguiente paso.'],
      en: ['Understood, I will check this and guide you with the next step.'],
      fr: ['Tres bien, je verifie cela et vous indique la prochaine etape.'],
      de: ['Verstanden, ich pruefe das und sage Ihnen den naechsten Schritt.']
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
  const previousClarifications = getClarificationCount(conversationState);
  const variantIndex = previousClarifications + (recentMessages?.length || 0);
  const explicitHuman = humanEscalation.humanReason === 'human_requested';
  const seriousEscalation = Boolean(
    explicitHuman
    || enhancedRisk?.hasRisk
    || ['emergency_detected', 'complaint_detected', 'technical_issue_detected'].includes(humanEscalation.humanReason)
  );
  const unclear = Boolean(
    !knowledgeUsed
    && !seriousEscalation
    && (
      confidence > 0 && confidence < 0.65
      || intent === 'unknown'
      || humanEscalation.humanReason === 'low_confidence'
      || humanEscalation.humanReason === 'fallback_response'
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
    reply = buildEscalationReply({
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

  if (repeated) {
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
      response_variant: variantIndex,
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
