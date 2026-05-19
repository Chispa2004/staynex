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
  ABANDONED_INTEREST_FOLLOWUP: 'abandoned_interest_followup'
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
      es: `${prefix}como manana es tu ultimo dia, podemos revisar disponibilidad de late checkout para que disfrutes la salida con mas calma.`,
      en: `${prefix}as tomorrow is your last day, we can check late checkout availability so you can leave more comfortably.`,
      fr: `${prefix}comme demain est votre dernier jour, nous pouvons verifier la disponibilite d'un late checkout.`,
      de: `${prefix}da morgen Ihr letzter Tag ist, koennen wir gern einen Late Check-out pruefen.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL]: {
      es: `${prefix}si te apetece un momento de bienestar, podemos ayudarte a consultar opciones de spa o hammam durante tu estancia.`,
      en: `${prefix}if you would like a wellness moment, we can help check spa or hammam options during your stay.`,
      fr: `${prefix}si vous souhaitez un moment bien-etre, nous pouvons vous aider avec les options spa ou hammam.`,
      de: `${prefix}wenn Sie einen Wellness-Moment wuenschen, helfen wir gern mit Spa- oder Hammam-Optionen.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.EXPERIENCE_RECOMMENDATION]: {
      es: `${prefix}si aun te interesa ${destination}, puedo ayudarte a ver detalles o enviar una solicitud de disponibilidad.`,
      en: `${prefix}if you are still interested in ${destination}, I can help with details or send an availability request.`,
      fr: `${prefix}si ${destination} vous interesse toujours, je peux vous aider avec les details ou une demande de disponibilite.`,
      de: `${prefix}wenn Sie noch Interesse an ${destination} haben, helfe ich gern mit Details oder einer Anfrage.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.RESTAURANT_PROMOTION]: {
      es: `${prefix}esta noche podemos ayudarte con recomendaciones de restaurante o una mesa tranquila cerca del hotel.`,
      en: `${prefix}tonight we can help with restaurant recommendations or a quiet table near the hotel.`,
      fr: `${prefix}ce soir, nous pouvons vous aider avec des recommandations de restaurant ou une table calme pres de l'hotel.`,
      de: `${prefix}heute Abend helfen wir gern mit Restaurantempfehlungen oder einem ruhigen Tisch in der Naehe.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.TRANSFER_OFFER]: {
      es: `${prefix}si necesitas traslado para tu llegada o salida, podemos ayudarte a organizarlo de forma sencilla.`,
      en: `${prefix}if you need a transfer for arrival or departure, we can help arrange it easily.`,
      fr: `${prefix}si vous avez besoin d'un transfert pour votre arrivee ou depart, nous pouvons vous aider.`,
      de: `${prefix}wenn Sie einen Transfer fuer Anreise oder Abreise brauchen, helfen wir gern.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.WEATHER_TRIGGER]: {
      es: `${prefix}si el tiempo no acompana, podemos recomendarte planes indoor, spa o experiencias tranquilas cerca del hotel.`,
      en: `${prefix}if the weather is not ideal, we can recommend indoor plans, spa options or calm local experiences.`,
      fr: `${prefix}si la meteo n'est pas ideale, nous pouvons recommander des activites indoor, spa ou experiences locales.`,
      de: `${prefix}falls das Wetter nicht ideal ist, empfehlen wir gern Indoor-Optionen, Spa oder ruhige Erlebnisse.`
    },
    [INTELLIGENT_AUTOMATION_TYPES.VIP_FOLLOWUP]: {
      es: `${prefix}si quieres que preparemos algo especial para tu estancia, nuestro equipo puede ayudarte con opciones premium.`,
      en: `${prefix}if you would like us to prepare something special for your stay, our team can help with premium options.`,
      fr: `${prefix}si vous souhaitez preparer quelque chose de special, notre equipe peut vous aider avec des options premium.`,
      de: `${prefix}wenn wir etwas Besonderes fuer Ihren Aufenthalt vorbereiten duerfen, helfen wir mit Premium-Optionen.`
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
  now = new Date(),
  weather = null,
  recentRuns = [],
  recentScheduledMessages = []
}) => {
  const type = automation.type || automation.automation_type;
  const guestId = reservation.guest_id || guest?.id || null;
  const fatigueScore = calculateFatigueScore({ recentRuns, recentScheduledMessages, guestId });
  const cooldown = shouldRespectCooldown({ automation, guestId, recentRuns, now });

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
    [INTELLIGENT_AUTOMATION_TYPES.SPA_UPSELL]: /spa|wellness|hammam|massage|relax|bienestar|masaje/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.EXPERIENCE_RECOMMENDATION]: /tour|excursion|experience|actividad|excursion|agafay|atlas|boat|catamaran/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.RESTAURANT_PROMOTION]: /restaurant|dinner|cena|comer|gastronomy|food/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.TRANSFER_OFFER]: daysToArrival !== null && daysToArrival <= 2 && /transfer|airport|taxi|arrival|traslado|aeropuerto/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.WEATHER_TRIGGER]: ['rain', 'rainy', 'storm', 'wind'].includes(String(weather?.condition || '').toLowerCase()),
    [INTELLIGENT_AUTOMATION_TYPES.VIP_FOLLOWUP]: Number(pmsIntelligenceContext?.vipScore || pmsIntelligenceContext?.vip_score || 0) >= 70 || guest?.vip || Number(guest?.score || 0) >= 80 || /vip|premium|luxury|suite|anniversary|honeymoon/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.BIRTHDAY_MESSAGE]: /birthday|cumple|anniversary|honeymoon|celebration|celebramos/.test(combinedSignals),
    [INTELLIGENT_AUTOMATION_TYPES.ABANDONED_INTEREST_FOLLOWUP]: /interested|me interesa|tell me more|cuentame|details|availability/.test(combinedSignals)
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
