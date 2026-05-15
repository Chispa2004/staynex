import { getDefaultUpsellAmount } from './revenue.service.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

export const CONTEXTUAL_REVENUE_TYPES = {
  EARLY_ARRIVAL: 'early_arrival',
  LATE_DEPARTURE: 'late_departure',
  ROMANTIC_STAY: 'romantic_stay',
  FAMILY_TRAVEL: 'family_travel',
  VIP_REPEAT_GUEST: 'vip_repeat_guest',
  BAD_WEATHER: 'bad_weather'
};

const contextualRevenueDefaults = {
  early_checkin: 45,
  luggage_storage: 15,
  shower_room: 35,
  romantic_package: 150,
  dinner: 90,
  wine: 55,
  spa: 80,
  late_checkout: 40,
  airport_transfer: 60,
  room_upgrade: 120,
  family_activities: 50,
  extra_bed: 35,
  babysitting: 80,
  kids_menu: 25,
  vip_welcome: 75
};

const contextRules = [
  {
    context: CONTEXTUAL_REVENUE_TYPES.EARLY_ARRIVAL,
    offerType: 'early_checkin',
    triggerIntent: 'early_arrival',
    confidence: 0.88,
    words: [
      'arrive at 10',
      'arrive early',
      'early arrival',
      'flight lands early',
      'lands early',
      'check in before',
      'early check-in',
      'early checkin',
      'llegamos pronto',
      'llegamos temprano',
      'check in antes',
      'entrar antes'
    ],
    suggestedMessage: {
      en: 'If you arrive early, reception can check early check-in availability or store your luggage for you.',
      es: 'Si llegais pronto, recepcion puede revisar early check-in o guardar vuestro equipaje.'
    }
  },
  {
    context: CONTEXTUAL_REVENUE_TYPES.LATE_DEPARTURE,
    offerType: 'late_checkout',
    triggerIntent: 'late_departure',
    confidence: 0.9,
    words: [
      'flight at night',
      'late flight',
      'leaving late',
      'leave later',
      'checkout later',
      'late checkout',
      'salimos tarde',
      'vuelo por la noche',
      'salir mas tarde',
      'checkout tarde'
    ],
    suggestedMessage: {
      en: 'We can also help with late checkout or luggage storage if needed.',
      es: 'Tambien podemos ayudaros con late checkout o guardar el equipaje si lo necesitais.'
    }
  },
  {
    context: CONTEXTUAL_REVENUE_TYPES.ROMANTIC_STAY,
    offerType: 'romantic_package',
    triggerIntent: 'romantic_stay',
    confidence: 0.9,
    words: [
      'anniversary',
      'honeymoon',
      'romantic stay',
      'romantic weekend',
      'celebrating',
      'aniversario',
      'luna de miel',
      'escapada romantica',
      'celebramos'
    ],
    suggestedMessage: {
      en: 'If you like, reception can also prepare a small romantic setup for the room.',
      es: 'Si os apetece, recepcion puede preparar un detalle romantico en la habitacion.'
    }
  },
  {
    context: CONTEXTUAL_REVENUE_TYPES.FAMILY_TRAVEL,
    offerType: 'family_activities',
    triggerIntent: 'family_travel',
    confidence: 0.82,
    words: [
      'children',
      'kids',
      'family',
      'baby',
      'ninos',
      'niños',
      'familia',
      'bebe',
      'bebé'
    ],
    suggestedMessage: {
      en: 'Reception can also share family-friendly activities or help with transfer options if useful.',
      es: 'Recepcion tambien puede recomendar planes para familias o ayudaros con opciones de transfer.'
    }
  }
];

const complaintWords = [
  'complaint',
  'angry',
  'upset',
  'terrible',
  'unacceptable',
  'noise',
  'noisy',
  'dirty',
  'refund',
  'queja',
  'enfadado',
  'enfadada',
  'ruido',
  'sucio',
  'muy mal',
  'reembolso'
];

const positiveWords = [
  'thank you',
  'thanks',
  'great',
  'perfect',
  'sounds good',
  'gracias',
  'perfecto',
  'genial',
  'me encanta'
];

const getMemoryKeys = (guestMemory = []) => new Set((guestMemory || []).map((item) => item.memory_key));

const hasRejectedMemory = (memoryKeys, offerType) => [
  `rejected_${offerType}_recently`,
  `declined_${offerType}`,
  `${offerType}_declined`,
  `${offerType}_rejected`,
  offerType === 'spa' ? 'rejected_spa_recently' : null,
  offerType === 'romantic_package' ? 'romantic_package_declined' : null
].filter(Boolean).some((key) => memoryKeys.has(key));

const hasAcceptedMemory = (memoryKeys, offerType) => [
  `accepted_${offerType}_before`,
  `interested_${offerType}`,
  offerType === 'room_upgrade' ? 'accepted_upgrade_before' : null,
  offerType === 'airport_transfer' ? 'interested_transfer' : null
].filter(Boolean).some((key) => memoryKeys.has(key));

export const calculateOfferFatigueScore = ({
  conversationState = null,
  guestMemory = [],
  offerType = null,
  message = ''
} = {}) => {
  const memoryKeys = getMemoryKeys(guestMemory);
  const text = normalize(message);
  let score = 0;

  if (conversationState?.previousState?.last_offer_type) {
    score += conversationState.previousState.last_offer_type === offerType ? 35 : 12;
  }

  if (conversationState?.suppressedOffer) {
    score += 28;
  }

  if (hasRejectedMemory(memoryKeys, offerType)) {
    score += 55;
  }

  if (includesAny(text, ['not interested', 'no thanks', 'no thank you', 'no gracias', 'no me interesa'])) {
    score += 60;
  }

  return Math.min(100, score);
};

export const evaluateRevenueTiming = ({
  message = '',
  risk = null,
  sentiment = 'neutral',
  conversationState = null,
  guestMemory = [],
  offerType = null
} = {}) => {
  const text = normalize(message);
  const memoryKeys = getMemoryKeys(guestMemory);
  const fatigueScore = calculateOfferFatigueScore({
    conversationState,
    guestMemory,
    offerType,
    message
  });

  if (risk?.hasRisk || ['negative', 'urgent'].includes(sentiment) || includesAny(text, complaintWords)) {
    return {
      allowed: false,
      reason: 'operational_resolution_first',
      fatigueScore
    };
  }

  if (fatigueScore >= 60) {
    return {
      allowed: false,
      reason: 'offer_fatigue',
      fatigueScore
    };
  }

  if (hasRejectedMemory(memoryKeys, offerType)) {
    return {
      allowed: false,
      reason: 'recently_rejected',
      fatigueScore
    };
  }

  const positiveSignal = includesAny(text, positiveWords) || hasAcceptedMemory(memoryKeys, offerType);

  return {
    allowed: true,
    reason: positiveSignal ? 'positive_context' : 'contextual_moment',
    fatigueScore
  };
};

const buildOpportunity = ({
  rule,
  language,
  reservation,
  guestMemory,
  conversationState,
  risk,
  sentiment,
  message
}) => {
  const timing = evaluateRevenueTiming({
    message,
    risk,
    sentiment,
    conversationState,
    guestMemory,
    offerType: rule.offerType
  });
  const memoryKeys = [...getMemoryKeys(guestMemory)];
  const confidence = timing.allowed
    ? rule.confidence
    : Math.max(0.3, rule.confidence - 0.3);

  return {
    offerType: rule.offerType,
    suggestedPrice: contextualRevenueDefaults[rule.offerType] || getDefaultUpsellAmount(rule.offerType),
    currency: 'EUR',
    confidence,
    aiReason: `${rule.context} detected from guest timing/context. Revenue timing: ${timing.reason}.`,
    triggerIntent: rule.triggerIntent,
    triggerSource: 'contextual_revenue',
    detectedContext: rule.context,
    suggestedMessage: rule.suggestedMessage?.[language] || rule.suggestedMessage?.en || null,
    timing,
    fatigueScore: timing.fatigueScore,
    metadata: {
      contextual_revenue: true,
      detected_context: rule.context,
      revenue_timing_reason: timing.reason,
      fatigue_score: timing.fatigueScore,
      reservation_id: reservation?.id || null,
      memory_keys: memoryKeys.slice(0, 12)
    }
  };
};

export const detectContextualRevenueOpportunities = ({
  message = '',
  reservation = null,
  guestMemory = [],
  conversationState = null,
  risk = null,
  sentiment = 'neutral',
  language = 'en'
} = {}) => {
  const text = normalize(message);
  const memoryKeys = getMemoryKeys(guestMemory);
  const directMatches = contextRules
    .filter((rule) => includesAny(text, rule.words))
    .map((rule) => buildOpportunity({
      rule,
      language,
      reservation,
      guestMemory,
      conversationState,
      risk,
      sentiment,
      message
    }));
  const memoryMatches = [];

  if (memoryKeys.has('accepted_upgrade_before') || memoryKeys.has('high_spender') || memoryKeys.has('repeat_guest')) {
    memoryMatches.push(buildOpportunity({
      rule: {
        context: CONTEXTUAL_REVENUE_TYPES.VIP_REPEAT_GUEST,
        offerType: 'room_upgrade',
        triggerIntent: 'vip_repeat_guest',
        confidence: 0.72,
        suggestedMessage: {
          en: 'Reception can also check premium room options that fit your preferences.',
          es: 'Recepcion tambien puede revisar opciones de habitacion premium segun tus preferencias.'
        }
      },
      language,
      reservation,
      guestMemory,
      conversationState,
      risk,
      sentiment,
      message
    }));
  }

  const opportunities = [...directMatches, ...memoryMatches]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.offerType === item.offerType) === index)
    .sort((a, b) => Number(b.timing.allowed) - Number(a.timing.allowed) || b.confidence - a.confidence)
    .slice(0, 4);

  return {
    opportunities,
    primaryOpportunity: opportunities.find((item) => item.timing.allowed) || opportunities[0] || null,
    contexts: [...new Set(opportunities.map((item) => item.detectedContext))]
  };
};
