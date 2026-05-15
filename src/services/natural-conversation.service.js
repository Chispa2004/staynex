const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

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
  breakfast_upgrade: 12
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
  vip_welcome: ['vip', 'welcome amenity']
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
