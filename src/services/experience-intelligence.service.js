import { getDefaultUpsellAmount } from './revenue.service.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text, words = []) => words.some((word) => text.includes(normalize(word)));

export const EXPERIENCE_CONTEXT_TYPES = {
  SEA_BEACH: 'sea_beach',
  FAMILY: 'family_experience',
  COUPLES: 'couples_experience',
  VIP_LUXURY: 'vip_luxury',
  CULTURE: 'culture_local',
  BAD_WEATHER: 'bad_weather',
  BUSINESS: 'business_traveler',
  DESTINATION: 'destination_personality'
};

const experienceDefaults = {
  boat_tour: 95,
  sunset_cruise: 120,
  snorkeling: 65,
  beach_club: 85,
  family_activities: 50,
  water_park: 45,
  romantic_dinner: 110,
  spa_couple: 140,
  wine_tasting: 75,
  yacht_experience: 350,
  private_transfer: 80,
  premium_dining: 150,
  golf: 120,
  cultural_tour: 55,
  gastronomy_tour: 80,
  museum_visit: 30,
  indoor_spa: 80,
  local_experiences: 60
};

const complaintWords = [
  'complaint',
  'angry',
  'upset',
  'terrible',
  'unacceptable',
  'refund',
  'noise',
  'noisy',
  'dirty',
  'emergency',
  'queja',
  'enfadado',
  'ruido',
  'sucio',
  'muy mal',
  'reembolso',
  'emergencia'
];

const recommendationWords = [
  'what to do',
  'recommend',
  'recommendation',
  'activities',
  'plans',
  'excursions',
  'things to do',
  'restaurants',
  'beaches',
  'nightlife',
  'local',
  'experiences',
  'que hacer',
  'recomiendas',
  'recomendacion',
  'actividades',
  'planes',
  'excursiones',
  'restaurantes',
  'playas',
  'sitios',
  'ocio'
];

const positiveWords = [
  'thank you',
  'thanks',
  'great',
  'perfect',
  'sounds good',
  'excited',
  'gracias',
  'perfecto',
  'genial',
  'me encanta',
  'ilusion'
];

const getMemoryKeys = (guestMemory = []) => new Set((guestMemory || []).map((item) => item.memory_key));

const hasRejectedExperienceMemory = (memoryKeys, offerType) => [
  `rejected_${offerType}_recently`,
  `declined_${offerType}`,
  `${offerType}_declined`,
  `${offerType}_rejected`,
  offerType === 'boat_tour' ? 'rejected_boat_tour_recently' : null,
  offerType === 'beach_club' ? 'beach_club_declined' : null,
  offerType === 'romantic_dinner' ? 'romantic_dinner_declined' : null,
  offerType === 'spa_couple' ? 'rejected_spa_recently' : null,
  offerType === 'family_activities' ? 'family_activities_declined' : null
].filter(Boolean).some((key) => memoryKeys.has(key));

const hasExperienceInterestMemory = (memoryKeys, offerType) => [
  `interested_${offerType}`,
  offerType === 'boat_tour' ? 'interested_boat_tour' : null,
  offerType === 'family_activities' ? 'family_activities_interest' : null,
  offerType === 'beach_club' ? 'nightlife_interest' : null,
  offerType === 'yacht_experience' ? 'luxury_experiences_interest' : null,
  offerType === 'golf' ? 'golf_interest' : null,
  offerType === 'private_transfer' ? 'transfer_interest' : null
].filter(Boolean).some((key) => memoryKeys.has(key));

export const calculateExperienceFatigueScore = ({
  conversationState = null,
  guestMemory = [],
  offerType = null,
  message = ''
} = {}) => {
  const text = normalize(message);
  const memoryKeys = getMemoryKeys(guestMemory);
  let score = 0;

  if (conversationState?.previousState?.last_offer_type) {
    score += conversationState.previousState.last_offer_type === offerType ? 35 : 8;
  }

  if (conversationState?.suppressedOffer) {
    score += 25;
  }

  if (hasRejectedExperienceMemory(memoryKeys, offerType)) {
    score += 60;
  }

  if (includesAny(text, ['not interested', 'no thanks', 'no thank you', 'no gracias', 'no me interesa'])) {
    score += 65;
  }

  return Math.min(100, score);
};

export const evaluateExperienceTiming = ({
  message = '',
  risk = null,
  sentiment = 'neutral',
  conversationState = null,
  guestMemory = [],
  offerType = null
} = {}) => {
  const text = normalize(message);
  const memoryKeys = getMemoryKeys(guestMemory);
  const fatigueScore = calculateExperienceFatigueScore({
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
      reason: 'experience_fatigue',
      fatigueScore
    };
  }

  if (hasRejectedExperienceMemory(memoryKeys, offerType)) {
    return {
      allowed: false,
      reason: 'recently_rejected',
      fatigueScore
    };
  }

  const explicitRecommendation = includesAny(text, recommendationWords);
  const positiveContext = includesAny(text, positiveWords) || hasExperienceInterestMemory(memoryKeys, offerType);

  return {
    allowed: true,
    reason: explicitRecommendation ? 'guest_asked_recommendation' : positiveContext ? 'positive_experience_context' : 'contextual_experience_moment',
    fatigueScore
  };
};

const destinationHints = ({ hotel = {}, hotelKnowledge = [] } = {}) => {
  const text = normalize([
    hotel.name,
    hotel.brand_name,
    hotel.address,
    hotel.description,
    ...hotelKnowledge.map((item) => `${item.key || ''} ${item.value || ''} ${item.category || ''}`)
  ].join(' '));

  if (includesAny(text, ['ibiza', 'beach club', 'nightlife', 'sunset'])) {
    return {
      destination: 'ibiza',
      preferred: ['beach_club', 'sunset_cruise', 'boat_tour']
    };
  }

  if (includesAny(text, ['mallorca', 'palma', 'cala', 'catamaran'])) {
    return {
      destination: 'mallorca',
      preferred: ['boat_tour', 'cultural_tour', 'beach_club']
    };
  }

  if (includesAny(text, ['boutique', 'old town', 'gastronomy', 'mercado', 'market'])) {
    return {
      destination: 'boutique_local',
      preferred: ['gastronomy_tour', 'cultural_tour', 'wine_tasting']
    };
  }

  return {
    destination: 'general',
    preferred: ['local_experiences']
  };
};

const baseExperienceRules = [
  {
    context: EXPERIENCE_CONTEXT_TYPES.SEA_BEACH,
    offerType: 'boat_tour',
    triggerIntent: 'experience_sea_beach',
    confidence: 0.86,
    memoryKey: 'interested_boat_tour',
    words: [
      'boat',
      'catamaran',
      'sunset cruise',
      'snorkeling',
      'scuba',
      'beach club',
      'beach',
      'sea',
      'calas',
      'barco',
      'catamaran',
      'snorkel',
      'buceo',
      'playa',
      'club de playa'
    ],
    suggestedMessage: {
      en: 'If you like, reception can also suggest boat excursions or beach experiences that fit your plans.',
      es: 'Si os apetece, recepcion tambien puede recomendar excursiones en barco o planes de playa segun vuestro estilo.'
    }
  },
  {
    context: EXPERIENCE_CONTEXT_TYPES.FAMILY,
    offerType: 'family_activities',
    triggerIntent: 'experience_family',
    confidence: 0.84,
    memoryKey: 'family_activities_interest',
    words: [
      'children',
      'kids',
      'family',
      'baby',
      'water park',
      'aquarium',
      'zoo',
      'ninos',
      'familia',
      'bebe',
      'parque acuatico',
      'acuario'
    ],
    suggestedMessage: {
      en: 'There are also family-friendly activities nearby; reception can share a few easy options if helpful.',
      es: 'Tambien hay planes familiares cerca; recepcion puede pasaros algunas opciones sencillas si os ayuda.'
    }
  },
  {
    context: EXPERIENCE_CONTEXT_TYPES.COUPLES,
    offerType: 'romantic_dinner',
    triggerIntent: 'experience_couples',
    confidence: 0.88,
    memoryKey: 'romantic_dinner_interest',
    words: [
      'honeymoon',
      'anniversary',
      'romantic',
      'romantic dinner',
      'sunset',
      'couple',
      'luna de miel',
      'aniversario',
      'romantica',
      'romantico',
      'cena romantica',
      'atardecer',
      'pareja'
    ],
    suggestedMessage: {
      en: 'If you would like, reception can also help with sunset experiences or a romantic dinner during your stay.',
      es: 'Si os apetece, recepcion tambien puede ayudaros con una experiencia al atardecer o una cena romantica.'
    }
  },
  {
    context: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
    offerType: 'yacht_experience',
    triggerIntent: 'experience_vip_luxury',
    confidence: 0.78,
    memoryKey: 'luxury_experiences_interest',
    words: [
      'vip',
      'luxury',
      'private',
      'yacht',
      'golf',
      'premium table',
      'exclusive',
      'lujo',
      'privado',
      'yate',
      'golf',
      'mesa premium',
      'exclusivo'
    ],
    suggestedMessage: {
      en: 'Reception can also arrange more private experiences, such as premium dining, golf or yacht options, if that suits your stay.',
      es: 'Recepcion tambien puede organizar experiencias mas privadas, como gastronomia premium, golf o yate, si encaja con vuestra estancia.'
    }
  },
  {
    context: EXPERIENCE_CONTEXT_TYPES.CULTURE,
    offerType: 'cultural_tour',
    triggerIntent: 'experience_culture',
    confidence: 0.82,
    memoryKey: 'culture_interest',
    words: [
      'museum',
      'old town',
      'local market',
      'gastronomy',
      'culture',
      'tour',
      'local food',
      'museo',
      'casco antiguo',
      'mercado',
      'gastronomia',
      'cultura',
      'comida local'
    ],
    suggestedMessage: {
      en: 'Reception can also suggest local culture, gastronomy or old town plans if you would like something authentic.',
      es: 'Recepcion tambien puede recomendar planes de cultura, gastronomia o casco antiguo si quereis algo local.'
    }
  },
  {
    context: EXPERIENCE_CONTEXT_TYPES.BAD_WEATHER,
    offerType: 'indoor_spa',
    triggerIntent: 'experience_bad_weather',
    confidence: 0.78,
    memoryKey: 'indoor_activities_interest',
    words: [
      'rain',
      'rainy',
      'bad weather',
      'weather is bad',
      'indoor',
      'lluvia',
      'llueve',
      'mal tiempo',
      'interior'
    ],
    suggestedMessage: {
      en: 'If the weather changes, reception can suggest indoor plans such as spa, museums or wine tasting.',
      es: 'Si cambia el tiempo, recepcion puede sugerir planes de interior como spa, museos o catas.'
    }
  }
];

const contextFromStay = ({ reservation = {}, guestMemory = [] } = {}) => {
  const memoryKeys = getMemoryKeys(guestMemory);
  const matches = [];
  const arrival = reservation?.arrival_date ? new Date(reservation.arrival_date) : null;
  const departure = reservation?.departure_date ? new Date(reservation.departure_date) : null;
  const stayLength = arrival && departure
    ? Math.max(0, Math.round((departure.getTime() - arrival.getTime()) / 86400000))
    : 0;

  if (stayLength >= 4) {
    matches.push({
      context: EXPERIENCE_CONTEXT_TYPES.DESTINATION,
      offerType: 'local_experiences',
      triggerIntent: 'experience_long_stay',
      confidence: 0.68,
      memoryKey: 'local_experiences_interest',
      suggestedMessage: {
        en: 'For a longer stay, reception can also share a few local experiences worth planning in advance.',
        es: 'Para una estancia mas larga, recepcion tambien puede compartir experiencias locales que merece la pena reservar con tiempo.'
      }
    });
  }

  if (memoryKeys.has('anniversary_trip') || memoryKeys.has('traveling_with_partner')) {
    matches.push({
      context: EXPERIENCE_CONTEXT_TYPES.COUPLES,
      offerType: 'romantic_dinner',
      triggerIntent: 'experience_memory_couples',
      confidence: 0.7,
      memoryKey: 'romantic_dinner_interest',
      suggestedMessage: {
        en: 'Reception can also help with romantic dinner or sunset ideas if you would like.',
        es: 'Recepcion tambien puede ayudar con ideas de cena romantica o atardecer si os apetece.'
      }
    });
  }

  if (memoryKeys.has('high_spender') || memoryKeys.has('repeat_guest') || memoryKeys.has('accepted_upgrade_before')) {
    matches.push({
      context: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
      offerType: 'premium_dining',
      triggerIntent: 'experience_memory_vip',
      confidence: 0.68,
      memoryKey: 'luxury_experiences_interest',
      suggestedMessage: {
        en: 'Reception can also suggest premium dining or private local experiences that match your preferences.',
        es: 'Recepcion tambien puede sugerir gastronomia premium o experiencias privadas segun tus preferencias.'
      }
    });
  }

  return matches;
};

const categoryToOfferType = {
  boat_tour: 'boat_tour',
  beach_club: 'beach_club',
  restaurant: 'premium_dining',
  nightlife: 'beach_club',
  romantic: 'romantic_dinner',
  family: 'family_activities',
  kids: 'family_activities',
  culture: 'cultural_tour',
  golf: 'golf',
  wellness: 'spa',
  spa: 'spa_couple',
  transfer: 'private_transfer',
  adventure: 'local_experiences',
  luxury: 'yacht_experience',
  indoor: 'indoor_spa',
  rainy_day: 'indoor_spa'
};

const experienceContextMap = {
  boat_tour: EXPERIENCE_CONTEXT_TYPES.SEA_BEACH,
  beach_club: EXPERIENCE_CONTEXT_TYPES.SEA_BEACH,
  restaurant: EXPERIENCE_CONTEXT_TYPES.CULTURE,
  nightlife: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
  romantic: EXPERIENCE_CONTEXT_TYPES.COUPLES,
  family: EXPERIENCE_CONTEXT_TYPES.FAMILY,
  kids: EXPERIENCE_CONTEXT_TYPES.FAMILY,
  culture: EXPERIENCE_CONTEXT_TYPES.CULTURE,
  golf: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
  wellness: EXPERIENCE_CONTEXT_TYPES.BAD_WEATHER,
  spa: EXPERIENCE_CONTEXT_TYPES.BAD_WEATHER,
  transfer: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
  adventure: EXPERIENCE_CONTEXT_TYPES.DESTINATION,
  luxury: EXPERIENCE_CONTEXT_TYPES.VIP_LUXURY,
  indoor: EXPERIENCE_CONTEXT_TYPES.BAD_WEATHER,
  rainy_day: EXPERIENCE_CONTEXT_TYPES.BAD_WEATHER
};

const wordsForExperience = (experience) => [
  experience.title,
  experience.slug,
  experience.description,
  experience.category,
  experience.partner_name,
  ...(experience.tags || []),
  ...(experience.target_guest_types || [])
].filter(Boolean);

const ruleFromHotelExperience = ({ experience, message, guestMemory }) => {
  const text = normalize(message);
  const memoryKeys = getMemoryKeys(guestMemory);
  const words = wordsForExperience(experience);
  const category = experience.category || 'local_experiences';
  const targets = new Set((experience.target_guest_types || []).map(normalize));
  const tags = new Set((experience.tags || []).map(normalize));
  const directMatch = includesAny(text, words);
  const recommendationMatch = includesAny(text, recommendationWords);
  const familyMatch = includesAny(text, ['children', 'kids', 'family', 'ninos', 'familia']) && (targets.has('family') || targets.has('kids') || ['family', 'kids'].includes(category));
  const romanticMatch = includesAny(text, ['honeymoon', 'anniversary', 'romantic', 'luna de miel', 'aniversario', 'romantico']) && (targets.has('couples') || tags.has('romantic') || category === 'romantic');
  const vipMatch = (memoryKeys.has('high_spender') || memoryKeys.has('repeat_guest') || includesAny(text, ['vip', 'luxury', 'private', 'premium', 'lujo'])) && (experience.vip_only || targets.has('vip') || category === 'luxury');
  const rainMatch = includesAny(text, ['rain', 'rainy', 'bad weather', 'indoor', 'lluvia', 'mal tiempo']) && (experience.indoor || category === 'indoor' || category === 'rainy_day');

  if (!directMatch && !recommendationMatch && !familyMatch && !romanticMatch && !vipMatch && !rainMatch) {
    return null;
  }

  const context = experienceContextMap[category] || EXPERIENCE_CONTEXT_TYPES.DESTINATION;
  const confidence = Math.min(0.94, 0.66
    + (directMatch ? 0.16 : 0)
    + (familyMatch || romanticMatch || vipMatch || rainMatch ? 0.12 : 0)
    + Math.min(0.1, Number(experience.priority || 0) / 1000));

  return {
    context,
    offerType: categoryToOfferType[category] || category,
    triggerIntent: `hotel_experience_${category}`,
    confidence,
    memoryKey: experience.metadata?.memory_key || `interested_${categoryToOfferType[category] || category}`,
    hotelExperience: experience,
    suggestedMessage: {
      en: `If you like, reception can also help with ${experience.title}.`,
      es: `Si os apetece, recepcion tambien puede ayudaros con ${experience.title}.`
    }
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
  message,
  hotel,
  hotelKnowledge
}) => {
  const timing = evaluateExperienceTiming({
    message,
    risk,
    sentiment,
    conversationState,
    guestMemory,
    offerType: rule.offerType
  });
  const destination = destinationHints({ hotel, hotelKnowledge });
  const destinationBoost = destination.preferred.includes(rule.offerType) ? 0.05 : 0;
  const confidence = timing.allowed
    ? Math.min(0.96, Number(rule.confidence || 0.72) + destinationBoost)
    : Math.max(0.3, Number(rule.confidence || 0.72) - 0.28);
  const memoryKeys = [...getMemoryKeys(guestMemory)];

  return {
    offerType: rule.offerType,
    suggestedPrice: rule.hotelExperience?.price || experienceDefaults[rule.offerType] || getDefaultUpsellAmount(rule.offerType),
    currency: 'EUR',
    confidence,
    aiReason: rule.hotelExperience
      ? `${rule.context} matched hotel experience "${rule.hotelExperience.title}". Timing: ${timing.reason}. Destination: ${destination.destination}.`
      : `${rule.context} experience context detected. Timing: ${timing.reason}. Destination: ${destination.destination}.`,
    triggerIntent: rule.triggerIntent,
    triggerSource: 'experience_intelligence',
    detectedContext: rule.context,
    suggestedMessage: rule.suggestedMessage?.[language] || rule.suggestedMessage?.en || null,
    timing,
    fatigueScore: timing.fatigueScore,
    metadata: {
      experience_intelligence: true,
      experience_category: rule.context,
      experience_memory_key: rule.memoryKey || `interested_${rule.offerType}`,
      hotel_experience_id: rule.hotelExperience?.id || null,
      hotel_experience_title: rule.hotelExperience?.title || null,
      hotel_experience_category: rule.hotelExperience?.category || null,
      partner_name: rule.hotelExperience?.partner_name || null,
      commission_percentage: rule.hotelExperience?.commission_percentage || null,
      booking_url: rule.hotelExperience?.booking_url || null,
      destination_personality: destination.destination,
      revenue_timing_reason: timing.reason,
      fatigue_score: timing.fatigueScore,
      reservation_id: reservation?.id || null,
      memory_keys: memoryKeys.slice(0, 12),
      future_partner_marketplace: true
    }
  };
};

export const detectExperienceOpportunities = ({
  message = '',
  hotel = {},
  hotelKnowledge = [],
  hotelExperiences = [],
  reservation = null,
  guestMemory = [],
  conversationState = null,
  risk = null,
  sentiment = 'neutral',
  language = 'en'
} = {}) => {
  const text = normalize(message);
  const catalogRules = (hotelExperiences || [])
    .filter((experience) => experience.active !== false)
    .map((experience) => ruleFromHotelExperience({ experience, message, guestMemory }))
    .filter(Boolean);
  const matchedRules = baseExperienceRules
    .filter((rule) => includesAny(text, rule.words));
  const genericRecommendationRules = !matchedRules.length && includesAny(text, recommendationWords)
    ? [{
      context: EXPERIENCE_CONTEXT_TYPES.DESTINATION,
      offerType: destinationHints({ hotel, hotelKnowledge }).preferred[0] || 'local_experiences',
      triggerIntent: 'experience_recommendation_request',
      confidence: 0.74,
      memoryKey: 'local_experiences_interest',
      suggestedMessage: {
        en: 'Reception can share a short list of local experiences, restaurants and plans that fit your stay.',
        es: 'Recepcion puede compartir una lista breve de experiencias locales, restaurantes y planes que encajen con vuestra estancia.'
      }
    }]
    : [];
  const directMatches = [...catalogRules, ...matchedRules, ...genericRecommendationRules]
    .map((rule) => buildOpportunity({
      rule,
      language,
      reservation,
      guestMemory,
      conversationState,
      risk,
      sentiment,
      message,
      hotel,
      hotelKnowledge
    }));
  const stayMatches = contextFromStay({ reservation, guestMemory })
    .map((rule) => buildOpportunity({
      rule,
      language,
      reservation,
      guestMemory,
      conversationState,
      risk,
      sentiment,
      message,
      hotel,
      hotelKnowledge
    }));

  const opportunities = [...directMatches, ...stayMatches]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.offerType === item.offerType) === index)
    .sort((a, b) => Number(b.timing.allowed) - Number(a.timing.allowed) || b.confidence - a.confidence)
    .slice(0, 5);

  return {
    opportunities,
    primaryOpportunity: opportunities.find((item) => item.timing.allowed) || opportunities[0] || null,
    contexts: [...new Set(opportunities.map((item) => item.detectedContext))],
    destination: destinationHints({ hotel, hotelKnowledge }).destination
  };
};
