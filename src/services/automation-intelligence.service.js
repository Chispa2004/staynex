export const INTELLIGENT_AUTOMATION_TYPES = {
  WELCOME_MESSAGE: 'welcome_message',
  LATE_CHECKOUT_OFFER: 'late_checkout_offer',
  SPA_UPSELL: 'spa_upsell',
  EXPERIENCE_RECOMMENDATION: 'experience_recommendation',
  RESTAURANT_PROMOTION: 'restaurant_promotion',
  TRANSFER_OFFER: 'transfer_offer',
  WEATHER_TRIGGER: 'weather_trigger',
  VIP_FOLLOWUP: 'vip_followup',
  BIRTHDAY_MESSAGE: 'birthday_message',
  ABANDONED_INTEREST_FOLLOWUP: 'abandoned_interest_followup',
  PRE_CHECKOUT_FOLIO_REMINDER: 'pre_checkout_folio_reminder',
  POST_STAY_REVIEW_INTELLIGENCE: 'post_stay_review_intelligence'
};

export const DEFAULT_INTELLIGENT_AUTOMATIONS = [
  {
    type: INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE,
    name: 'Welcome message',
    triggerType: 'check_in',
    audienceType: 'checked_in_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 0
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.LATE_CHECKOUT_OFFER,
    name: 'Late checkout offer',
    triggerType: 'pre_checkout',
    audienceType: 'departing_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 45
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL,
    name: 'Spa / wellness upsell',
    triggerType: 'high_spa_interest',
    audienceType: 'wellness_interest',
    cooldownMinutes: 720,
    maxPerGuest: 2,
    revenueEstimate: 85
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.EXPERIENCE_RECOMMENDATION,
    name: 'Experience recommendation',
    triggerType: 'experience_interest',
    audienceType: 'experience_interest',
    cooldownMinutes: 720,
    maxPerGuest: 2,
    revenueEstimate: 95
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.RESTAURANT_PROMOTION,
    name: 'Restaurant promotion',
    triggerType: 'low_restaurant_occupancy',
    audienceType: 'in_house_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 55
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.TRANSFER_OFFER,
    name: 'Transfer offer',
    triggerType: 'pre_arrival_transfer_need',
    audienceType: 'arriving_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 60
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.WEATHER_TRIGGER,
    name: 'Rainy day indoor recommendation',
    triggerType: 'weather',
    audienceType: 'in_house_guests',
    cooldownMinutes: 720,
    maxPerGuest: 1,
    revenueEstimate: 70
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.VIP_FOLLOWUP,
    name: 'VIP follow-up',
    triggerType: 'vip_high_value',
    audienceType: 'vip_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 2,
    revenueEstimate: 120
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.BIRTHDAY_MESSAGE,
    name: 'Birthday message',
    triggerType: 'birthday',
    audienceType: 'celebration_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 35
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.ABANDONED_INTEREST_FOLLOWUP,
    name: 'Abandoned interest follow-up',
    triggerType: 'abandoned_interest',
    audienceType: 'interested_guests',
    cooldownMinutes: 720,
    maxPerGuest: 1,
    revenueEstimate: 80
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.PRE_CHECKOUT_FOLIO_REMINDER,
    name: 'Pre-checkout Folio Reminder',
    triggerType: 'pre_checkout_folio',
    audienceType: 'departing_guests_with_balance',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 0
  },
  {
    type: INTELLIGENT_AUTOMATION_TYPES.POST_STAY_REVIEW_INTELLIGENCE,
    name: 'Post-stay Review Intelligence',
    triggerType: 'post_checkout_24h',
    audienceType: 'checked_out_guests',
    cooldownMinutes: 1440,
    maxPerGuest: 1,
    revenueEstimate: 0
  }
];

const DAY_MS = 86400000;

const normalizeLanguage = (value) => {
  const language = String(value || '').trim().toLowerCase();
  return ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(language) ? language : 'en';
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysBetween = (from, to) => {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

export const isQuietHour = ({ date = new Date(), startHour = 23, endHour = 8 } = {}) => {
  const hour = date.getHours();
  return startHour > endHour
    ? hour >= startHour || hour < endHour
    : hour >= startHour && hour < endHour;
};

export const calculateFatigueScore = ({
  recentRuns = [],
  recentScheduledMessages = [],
  guestId = null
} = {}) => {
  const guestRuns = recentRuns.filter((run) => !guestId || run.guest_id === guestId);
  const guestMessages = recentScheduledMessages.filter((message) => !guestId || message.guest_id === guestId);
  const failedPenalty = guestRuns.filter((run) => run.status === 'failed').length * 0.2;
  const recentVolume = (guestRuns.length + guestMessages.length) * 0.18;
  return Math.min(1, Number((recentVolume + failedPenalty).toFixed(2)));
};

export const shouldRespectCooldown = ({
  automation,
  guestId,
  recentRuns = [],
  now = new Date()
}) => {
  if (!guestId || !automation) {
    return { blocked: false, reason: null };
  }

  const cooldownMinutes = Number(automation.cooldown_minutes || automation.cooldownMinutes || 0);
  const maxPerGuest = Number(automation.max_per_guest || automation.maxPerGuest || 999);
  const matchingRuns = recentRuns.filter((run) => (
    run.guest_id === guestId
    && (run.automation_type === automation.type || run.automation_id === automation.id)
  ));

  if (matchingRuns.length >= maxPerGuest) {
    return { blocked: true, reason: 'max_per_guest_reached' };
  }

  const latestRun = matchingRuns
    .map((run) => new Date(run.created_at || run.updated_at || 0))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (latestRun && cooldownMinutes > 0) {
    const elapsedMinutes = (now.getTime() - latestRun.getTime()) / 60000;
    if (elapsedMinutes < cooldownMinutes) {
      return { blocked: true, reason: 'cooldown_active' };
    }
  }

  return { blocked: false, reason: null };
};

const hasWelcomeAlreadyDeliveredForStay = ({
  reservation = {},
  guest = {},
  guestId = null,
  recentRuns = [],
  recentScheduledMessages = []
} = {}) => {
  if (
    guest?.welcome_sent_for_stay
    || reservation?.welcome_sent_for_stay
    || guest?.metadata?.welcome_sent_for_stay
    || reservation?.metadata?.welcome_sent_for_stay
  ) {
    return true;
  }

  const reservationId = reservation.id || reservation.reservation_id || reservation.pms_reservation_id || null;
  const stayKey = reservationId || `${guestId || guest?.id || 'guest'}:${reservation.arrival_date || guest?.arrival_date || guest?.checkIn || 'unknown'}`;
  const isWelcomeRecord = (record = {}) => (
    record.automation_type === INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE
    || record.type === INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE
  );
  const sameStay = (record = {}) => (
    (reservationId && (record.reservation_id === reservationId || record.metadata?.reservation_id === reservationId))
    || record.metadata?.stay_key === stayKey
    || (guestId && record.guest_id === guestId && String(record.created_at || record.scheduled_for || '').slice(0, 10) >= String(reservation.arrival_date || guest?.arrival_date || guest?.checkIn || '').slice(0, 10))
  );

  return [...recentRuns, ...recentScheduledMessages].some((record) => (
    isWelcomeRecord(record)
    && sameStay(record)
    && !['failed', 'cancelled', 'skipped'].includes(record.status)
  ));
};

export const getAutomationDefinition = (type) => (
  DEFAULT_INTELLIGENT_AUTOMATIONS.find((automation) => automation.type === type)
);

export const buildAutomationMessagePreview = ({
  automationType,
  hotel = {},
  reservation = {},
  language = 'en',
  context = {}
}) => {
  const normalizedLanguage = normalizeLanguage(language);
  const hotelName = hotel?.name || 'the hotel';
  const firstName = String(reservation.guest_name || '').split(' ')[0];
  const prefix = firstName ? `${firstName}, ` : '';
  const destination = context.destination || context.topExperience || 'a local experience';
  const templates = {
    [INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE]: {
      es: `${prefix}bienvenido/a a ${hotelName}. Si necesitas recomendaciones, traslados o ayuda durante tu estancia, estamos aqui para ayudarte.`,
      en: `${prefix}welcome to ${hotelName}. If you need recommendations, transfers or anything during your stay, we are here to help.`,
      fr: `${prefix}bienvenue a ${hotelName}. Si vous souhaitez des recommandations, un transfert ou de l'aide pendant votre sejour, nous sommes la.`,
      de: `${prefix}willkommen im ${hotelName}. Wenn Sie Empfehlungen, Transfer oder Hilfe brauchen, sind wir gern da.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.LATE_CHECKOUT_OFFER]: {
      es: `${prefix}si deseas disfrutar de una salida mas relajada, podemos revisar la disponibilidad de late checkout para tu estancia.`,
      en: `${prefix}if you would like a more relaxed departure, we can check late checkout availability for your stay.`,
      fr: `${prefix}si vous souhaitez profiter d'un depart plus confortable, nous pouvons verifier la disponibilite d'un late checkout pour votre sejour.`,
      de: `${prefix}wenn Sie eine entspanntere Abreise wuenschen, pruefen wir gern die Verfuegbarkeit eines Late Check-outs fuer Ihren Aufenthalt.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL]: {
      es: `${prefix}si te apetece disfrutar de un momento de bienestar durante tu estancia, podemos ayudarte a consultar opciones de spa, hammam o tratamientos disponibles.`,
      en: `${prefix}if you would like to enjoy a moment of wellbeing during your stay, we can help check available spa, hammam or treatment options.`,
      fr: `${prefix}si vous souhaitez profiter d'un moment de bien-etre pendant votre sejour, nous pouvons vous aider a consulter les options spa, hammam ou soins disponibles.`,
      de: `${prefix}wenn Sie waehrend Ihres Aufenthalts einen Moment der Erholung geniessen moechten, helfen wir gern mit verfuegbaren Spa-, Hammam- oder Behandlungsoptionen.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.EXPERIENCE_RECOMMENDATION]: {
      es: `${prefix}si te apetece descubrir ${destination}, experiencias locales o actividades recomendadas, estaremos encantados de ayudarte a encontrar la opcion que mejor encaje contigo.`,
      en: `${prefix}if you would like to discover ${destination}, local experiences or recommended activities, we will be happy to help you find the option that best suits you.`,
      fr: `${prefix}si vous souhaitez decouvrir ${destination}, des experiences locales ou des activites recommandees, nous serons ravis de vous aider a trouver l'option qui vous convient le mieux.`,
      de: `${prefix}wenn Sie ${destination}, lokale Erlebnisse oder empfohlene Aktivitaeten entdecken moechten, helfen wir gern, die passende Option fuer Sie zu finden.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.RESTAURANT_PROMOTION]: {
      es: `${prefix}si deseas reservar una mesa para esta noche o recibir recomendaciones gastronomicas cercanas, nuestro equipo estara encantado de ayudarte.`,
      en: `${prefix}if you would like to reserve a table for this evening or receive nearby dining recommendations, our team will be happy to help.`,
      fr: `${prefix}si vous souhaitez reserver une table pour ce soir ou recevoir des recommandations gastronomiques a proximite, notre equipe sera ravie de vous aider.`,
      de: `${prefix}wenn Sie fuer heute Abend einen Tisch reservieren oder Restaurantempfehlungen in der Naehe wuenschen, hilft unser Team Ihnen gern.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.TRANSFER_OFFER]: {
      es: `${prefix}si necesitas organizar tu traslado al aeropuerto o cualquier transporte durante tu estancia, estaremos encantados de ayudarte.`,
      en: `${prefix}if you need to arrange an airport transfer or any transportation during your stay, we will be happy to help.`,
      fr: `${prefix}si vous souhaitez organiser un transfert aeroport ou tout autre transport pendant votre sejour, nous serons ravis de vous aider.`,
      de: `${prefix}wenn Sie einen Flughafentransfer oder andere Fahrten waehrend Ihres Aufenthalts organisieren moechten, helfen wir Ihnen gern.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.WEATHER_TRIGGER]: {
      es: `${prefix}si el tiempo no acompana, podemos recomendarte planes indoor, spa o experiencias tranquilas cerca del hotel.`,
      en: `${prefix}if the weather is not ideal, we can recommend indoor plans, spa options or calm local experiences.`,
      fr: `${prefix}si la meteo n'est pas ideale, nous pouvons recommander des activites indoor, spa ou experiences locales.`,
      de: `${prefix}falls das Wetter nicht ideal ist, empfehlen wir gern Indoor-Optionen, Spa oder ruhige Erlebnisse.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.VIP_FOLLOWUP]: {
      es: `${prefix}como huesped preferente, estaremos encantados de ayudarte con peticiones especiales o recomendaciones personalizadas durante tu estancia.`,
      en: `${prefix}as a preferred guest, we will be happy to help with special requests or personalised recommendations during your stay.`,
      fr: `${prefix}en tant qu'hote privilegie, nous serons ravis de vous aider avec des demandes speciales ou des recommandations personnalisees pendant votre sejour.`,
      de: `${prefix}als bevorzugter Gast helfen wir Ihnen waehrend Ihres Aufenthalts gern mit besonderen Wuenschen oder persoenlichen Empfehlungen.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.BIRTHDAY_MESSAGE]: {
      es: `${prefix}hemos visto que celebras una ocasion especial. Si quieres, podemos ayudarte a preparar un detalle durante tu estancia.`,
      en: `${prefix}we noticed you are celebrating a special occasion. We can help arrange a thoughtful touch during your stay.`,
      fr: `${prefix}nous avons note une occasion speciale. Nous pouvons vous aider a preparer une attention pendant votre sejour.`,
      de: `${prefix}wir haben gesehen, dass Sie einen besonderen Anlass feiern. Wir helfen gern mit einer kleinen Aufmerksamkeit.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.ABANDONED_INTEREST_FOLLOWUP]: {
      es: `${prefix}si sigues interesado/a, puedo retomar la recomendacion y ayudarte a confirmar los detalles.`,
      en: `${prefix}if you are still interested, I can pick this back up and help confirm the details.`,
      fr: `${prefix}si cela vous interesse toujours, je peux reprendre la recommandation et confirmer les details.`,
      de: `${prefix}wenn Sie weiterhin interessiert sind, kann ich die Empfehlung aufgreifen und Details klaeren.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.PRE_CHECKOUT_FOLIO_REMINDER]: {
      es: `${prefix}te recordamos que manana esta prevista tu salida del hotel. Actualmente existe un saldo pendiente estimado asociado a tu estancia. Si tienes cualquier duda, nuestro equipo de recepcion estara encantado de ayudarte.`,
      en: `${prefix}this is a friendly reminder that your departure from the hotel is scheduled for tomorrow. There is currently an estimated pending balance associated with your stay. If you have any questions, our reception team will be happy to help.`,
      fr: `${prefix}nous vous rappelons que votre depart de l'hotel est prevu demain. Un solde estime est actuellement associe a votre sejour. Si vous avez la moindre question, notre equipe de reception sera ravie de vous aider.`,
      de: `${prefix}wir moechten Sie daran erinnern, dass Ihre Abreise aus dem Hotel fuer morgen vorgesehen ist. Derzeit ist ein geschaetzter offener Betrag mit Ihrem Aufenthalt verbunden. Bei Fragen hilft Ihnen unser Rezeptionsteam gern.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.POST_STAY_REVIEW_INTELLIGENCE]: {
      es: `${prefix}gracias por alojarte con nosotros. Esperamos que hayas disfrutado de tu estancia. Tu opinion nos ayuda a seguir mejorando. Podrias dedicar unos segundos a valorar tu experiencia?`,
      en: `${prefix}thank you for staying with us. We hope you enjoyed your stay. Your feedback helps us improve. Would you mind sharing your experience with us?`,
      fr: `${prefix}merci d'avoir sejourne chez nous. Nous esperons que votre sejour s'est bien passe. Votre avis nous aide a nous ameliorer. Pourriez-vous partager votre experience ?`,
      de: `${prefix}vielen Dank fuer Ihren Aufenthalt bei uns. Wir hoffen, dass Sie Ihren Aufenthalt genossen haben. Ihre Rueckmeldung hilft uns, unseren Service weiter zu verbessern. Moechten Sie Ihre Erfahrung mit uns teilen?`
    }
  };

  return templates[automationType]?.[normalizedLanguage]
    || templates[automationType]?.en
    || templates[INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE].en;
};

export const evaluateAutomationOpportunity = ({
  automation,
  reservation = {},
  guest = {},
  conversation = null,
  guestMemory = [],
  aiState = null,
  pmsIntelligenceContext = null,
  guestIntelligenceContext = null,
  now = new Date(),
  weather = null,
  recentRuns = [],
  recentScheduledMessages = []
}) => {
  const type = automation.type || automation.automation_type;
  const guestId = reservation.guest_id || guest?.id || null;
  const fatigueScore = calculateFatigueScore({ recentRuns, recentScheduledMessages, guestId });
  const cooldown = shouldRespectCooldown({ automation, guestId, recentRuns, now });

  if (
    type === INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE
    && hasWelcomeAlreadyDeliveredForStay({
      reservation,
      guest,
      guestId,
      recentRuns,
      recentScheduledMessages
    })
  ) {
    return {
      shouldRun: false,
      reason: 'welcome_already_delivered',
      fatigueScore,
      cooldownApplied: false,
      duplicateBlocked: true
    };
  }

  if (cooldown.blocked) {
    return {
      shouldRun: false,
      reason: cooldown.reason,
      fatigueScore,
      cooldownApplied: true
    };
  }

  if (fatigueScore >= 0.75) {
    return {
      shouldRun: false,
      reason: 'fatigue_score_high',
      fatigueScore,
      cooldownApplied: false
    };
  }

  if (isQuietHour({ date: now })) {
    return {
      shouldRun: false,
      reason: 'quiet_hours',
      fatigueScore,
      cooldownApplied: false
    };
  }

  const today = now.toISOString().slice(0, 10);
  const daysToArrival = daysBetween(today, reservation.arrival_date);
  const daysToDeparture = daysBetween(today, reservation.departure_date);
  const status = reservation.status || '';
  const stayPhase = pmsIntelligenceContext?.stayPhase || pmsIntelligenceContext?.stay_phase || null;
  const guestProfile = guestIntelligenceContext?.profile || guestIntelligenceContext || {};
  const revenuePrediction = guestIntelligenceContext?.revenuePrediction || guestIntelligenceContext?.prediction || {};
  const affinities = guestIntelligenceContext?.affinities || {};
  const memoryText = guestMemory.map((item) => `${item.memory_key} ${item.memory_value}`).join(' ').toLowerCase();
  const aiIntent = String(aiState?.current_intent || '').toLowerCase();
  const sentiment = String(aiState?.sentiment || '').toLowerCase();
  const conversationText = conversation?.last_message || conversation?.lastMessage?.content || '';
  const combinedSignals = `${memoryText} ${aiIntent} ${conversationText}`.toLowerCase();

  if (sentiment === 'negative') {
    return { shouldRun: false, reason: 'negative_sentiment', fatigueScore, cooldownApplied: false };
  }

  const decisions = {
    [INTELLIGENT_AUTOMATION_TYPES.WELCOME_MESSAGE]: status === 'checked_in' || status === 'in_house' || stayPhase === 'in_house' || daysToArrival === 0,
    [INTELLIGENT_AUTOMATION_TYPES.LATE_CHECKOUT_OFFER]: Boolean(pmsIntelligenceContext?.lateCheckoutEligible) || stayPhase === 'pre_checkout' || daysToDeparture === 1 || daysToDeparture === 0,
    [INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL]: Number(affinities.spa_affinity || affinities.wellness_affinity || 0) >= 65 || Number(revenuePrediction.likelyToBuySpa || revenuePrediction.likely_to_buy_spa || 0) >= 0.55 || /spa|wellness|hammam|massage|relax|bienestar|masaje/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.EXPERIENCE_RECOMMENDATION]: Number(affinities.adventure_affinity || 0) >= 60 || Number(revenuePrediction.likelyToBuyExperience || revenuePrediction.likely_to_buy_experience || 0) >= 0.55 || /tour|excursion|experience|actividad|excursion|agafay|atlas|boat|catamaran/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.RESTAURANT_PROMOTION]: Number(affinities.restaurant_affinity || 0) >= 60 || /restaurant|dinner|cena|comer|gastronomy|food/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.TRANSFER_OFFER]: (daysToArrival !== null && daysToArrival <= 2 && /transfer|airport|taxi|arrival|traslado|aeropuerto/.test(combinedSignals)) || Number(revenuePrediction.likelyToBuyTransfer || revenuePrediction.likely_to_buy_transfer || 0) >= 0.58,
    [INTELLIGENT_AUTOMATION_TYPES.WEATHER_TRIGGER]: ['rain', 'rainy', 'storm', 'wind'].includes(String(weather?.condition || '').toLowerCase()),
    [INTELLIGENT_AUTOMATION_TYPES.VIP_FOLLOWUP]: Number(guestProfile.vipScore || guestProfile.vip_score || 0) >= 70 || Number(pmsIntelligenceContext?.vipScore || pmsIntelligenceContext?.vip_score || 0) >= 70 || guest?.vip || Number(guest?.score || 0) >= 80 || /vip|premium|luxury|suite|anniversary|honeymoon/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.BIRTHDAY_MESSAGE]: /birthday|cumple|anniversary|honeymoon|celebration|celebramos/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.ABANDONED_INTEREST_FOLLOWUP]: /interested|me interesa|tell me more|cuentame|details|availability/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.PRE_CHECKOUT_FOLIO_REMINDER]: false,
    [INTELLIGENT_AUTOMATION_TYPES.POST_STAY_REVIEW_INTELLIGENCE]: false
  };

  return {
    shouldRun: Boolean(decisions[type]),
    reason: decisions[type] ? 'trigger_matched' : 'conditions_not_met',
    triggerType: automation.trigger_type || automation.triggerType,
    fatigueScore,
    cooldownApplied: false
  };
};

export const calculateAutomationMetrics = ({
  automations = [],
  runs = [],
  scheduledMessages = []
} = {}) => {
  const activeAutomations = automations.filter((automation) => automation.active !== false && automation.is_active !== false).length;
  const revenueGenerated = runs.reduce((total, run) => total + Number(run.revenue_generated || 0), 0);
  const convertedRuns = runs.filter((run) => run.converted || run.status === 'converted').length;
  const conversionRate = runs.length ? Math.round((convertedRuns / runs.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const scheduledToday = scheduledMessages.filter((message) => String(message.scheduled_for || '').slice(0, 10) === today).length;

  return {
    activeAutomations,
    revenueGenerated,
    conversionRate,
    scheduledToday,
    totalRuns: runs.length
  };
};
