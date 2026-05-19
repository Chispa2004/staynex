export const INTELLIGENT_AUTOMATION_TYPES = [
  'welcome_message',
  'late_checkout_offer',
  'spa_upsell',
  'experience_recommendation',
  'restaurant_promotion',
  'transfer_offer',
  'weather_trigger',
  'vip_followup',
  'birthday_message',
  'abandoned_interest_followup'
];

export const LEGACY_AUTOMATION_TYPES = [
  'pre_arrival_7d',
  'pre_arrival_1d',
  'in_stay_upsell',
  'post_stay_review'
];

export const AUTOMATION_TYPE_OPTIONS = [
  ...LEGACY_AUTOMATION_TYPES,
  ...INTELLIGENT_AUTOMATION_TYPES
];

export const DEFAULT_INTELLIGENT_AUTOMATIONS = [
  ['welcome_message', 'Welcome message', 'check_in', 'checked_in_guests', 1440, 1, 0],
  ['late_checkout_offer', 'Late checkout offer', 'pre_checkout', 'departing_guests', 1440, 1, 45],
  ['spa_upsell', 'Spa / wellness upsell', 'high_spa_interest', 'wellness_interest', 720, 2, 85],
  ['experience_recommendation', 'Experience recommendation', 'experience_interest', 'experience_interest', 720, 2, 95],
  ['restaurant_promotion', 'Restaurant promotion', 'low_restaurant_occupancy', 'in_house_guests', 1440, 1, 55],
  ['transfer_offer', 'Transfer offer', 'pre_arrival_transfer_need', 'arriving_guests', 1440, 1, 60],
  ['weather_trigger', 'Rainy day indoor recommendation', 'weather', 'in_house_guests', 720, 1, 70],
  ['vip_followup', 'VIP follow-up', 'vip_high_value', 'vip_guests', 1440, 2, 120],
  ['birthday_message', 'Birthday message', 'birthday', 'celebration_guests', 1440, 1, 35],
  ['abandoned_interest_followup', 'Abandoned interest follow-up', 'abandoned_interest', 'interested_guests', 720, 1, 80]
].map(([type, name, triggerType, audienceType, cooldownMinutes, maxPerGuest, revenueEstimate]) => ({
  id: `default-${type}`,
  name,
  type,
  trigger_type: triggerType,
  active: true,
  audience_type: audienceType,
  cooldown_minutes: cooldownMinutes,
  max_per_guest: maxPerGuest,
  conditions: {},
  actions: {
    channel: 'whatsapp',
    estimated_revenue: revenueEstimate,
    message_tone: 'premium_concierge'
  },
  metadata: {
    source: 'default_intelligent_automation'
  }
}));

const normalizeLanguage = (value) => {
  const language = String(value || '').trim().toLowerCase();
  return ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(language) ? language : 'en';
};

const dateAtNoon = (value) => value ? `${value}T12:00:00.000Z` : null;

const addHours = (dateValue, hours) => {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

export const isMissingAutomationEngineTables = (error) => (
  error?.message?.includes('automations')
  || error?.message?.includes('automation_runs')
  || error?.details?.includes('automations')
  || error?.details?.includes('automation_runs')
  || error?.hint?.includes('automations')
  || error?.hint?.includes('automation_runs')
);

export const isMissingAutomationColumn = (error) => (
  error?.code === '42703'
  || error?.message?.includes('column')
  || error?.details?.includes('column')
  || error?.hint?.includes('column')
);

export const mergeAutomationDefaults = (rows = []) => {
  const byType = new Map((rows || []).map((item) => [item.type || item.automation_type, item]));

  return DEFAULT_INTELLIGENT_AUTOMATIONS.map((definition) => ({
    ...definition,
    ...(byType.get(definition.type) || {}),
    metadata: {
      ...definition.metadata,
      ...(byType.get(definition.type)?.metadata || {})
    },
    actions: {
      ...definition.actions,
      ...(byType.get(definition.type)?.actions || {})
    },
    conditions: {
      ...definition.conditions,
      ...(byType.get(definition.type)?.conditions || {})
    }
  }));
};

export const isRealAutomationId = (id) => (
  typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
);

export const buildAutomationPreview = ({ automationType, hotel, reservation, language = 'en' }) => {
  const normalizedLanguage = normalizeLanguage(language);
  const hotelName = hotel?.name || 'the hotel';
  const firstName = reservation?.guest_name?.split(' ')[0] || '';
  const prefix = firstName ? `${firstName}, ` : '';
  const templates = {
    welcome_message: {
      es: `${prefix}bienvenido/a a ${hotelName}. Si necesitas recomendaciones, traslados o ayuda durante tu estancia, estamos aqui para ayudarte.`,
      en: `${prefix}welcome to ${hotelName}. If you need recommendations, transfers or anything during your stay, we are here to help.`
    },
    late_checkout_offer: {
      es: `${prefix}como manana es tu ultimo dia, podemos revisar disponibilidad de late checkout para una salida mas tranquila.`,
      en: `${prefix}as tomorrow is your last day, we can check late checkout availability so you can leave more comfortably.`
    },
    spa_upsell: {
      es: `${prefix}si te apetece un momento de bienestar, podemos ayudarte a consultar opciones de spa o hammam durante tu estancia.`,
      en: `${prefix}if you would like a wellness moment, we can help check spa or hammam options during your stay.`
    },
    experience_recommendation: {
      es: `${prefix}si aun te interesan excursiones o experiencias locales, puedo ayudarte con detalles o disponibilidad.`,
      en: `${prefix}if you are still interested in local tours or experiences, I can help with details or availability.`
    },
    restaurant_promotion: {
      es: `${prefix}esta noche podemos ayudarte con recomendaciones de restaurante o una mesa tranquila cerca del hotel.`,
      en: `${prefix}tonight we can help with restaurant recommendations or a quiet table near the hotel.`
    },
    transfer_offer: {
      es: `${prefix}si necesitas traslado para tu llegada o salida, podemos ayudarte a organizarlo de forma sencilla.`,
      en: `${prefix}if you need a transfer for arrival or departure, we can help arrange it easily.`
    },
    weather_trigger: {
      es: `${prefix}si el tiempo no acompana, podemos recomendarte planes indoor, spa o experiencias tranquilas cerca del hotel.`,
      en: `${prefix}if the weather is not ideal, we can recommend indoor plans, spa options or calm local experiences.`
    },
    vip_followup: {
      es: `${prefix}si quieres que preparemos algo especial para tu estancia, nuestro equipo puede ayudarte con opciones premium.`,
      en: `${prefix}if you would like us to prepare something special for your stay, our team can help with premium options.`
    },
    birthday_message: {
      es: `${prefix}hemos visto que celebras una ocasion especial. Si quieres, podemos ayudarte a preparar un detalle durante tu estancia.`,
      en: `${prefix}we noticed you are celebrating a special occasion. We can help arrange a thoughtful touch during your stay.`
    },
    abandoned_interest_followup: {
      es: `${prefix}si sigues interesado/a, puedo retomar la recomendacion y ayudarte a confirmar los detalles.`,
      en: `${prefix}if you are still interested, I can pick this back up and help confirm the details.`
    }
  };

  return templates[automationType]?.[normalizedLanguage] || templates[automationType]?.en || templates.welcome_message.en;
};

export const scheduledForAutomation = ({ automationType, reservation }) => {
  const arrival = dateAtNoon(reservation?.arrival_date);
  const departure = dateAtNoon(reservation?.departure_date);

  if (automationType === 'welcome_message') return arrival;
  if (automationType === 'late_checkout_offer') return departure ? addHours(departure, -20) : null;
  if (automationType === 'transfer_offer') return arrival ? addHours(arrival, -24) : null;
  if (automationType === 'post_stay_review') return departure ? addHours(departure, 24) : null;
  if (automationType === 'pre_arrival_7d') return arrival ? addHours(arrival, -24 * 7) : null;
  if (automationType === 'pre_arrival_1d') return arrival ? addHours(arrival, -24) : null;
  if (automationType === 'in_stay_upsell') return arrival;
  return addHours(new Date().toISOString(), 2);
};

export const normalizeAutomationForInsert = ({ hotelId, automation, userId = null }) => ({
  hotel_id: hotelId,
  name: automation.name,
  type: automation.type,
  trigger_type: automation.trigger_type || automation.triggerType || 'manual',
  active: automation.active !== false,
  audience_type: automation.audience_type || automation.audienceType || 'all_guests',
  conditions: automation.conditions || {},
  actions: automation.actions || {},
  cooldown_minutes: Number(automation.cooldown_minutes || automation.cooldownMinutes || 1440),
  max_per_guest: Number(automation.max_per_guest || automation.maxPerGuest || 1),
  created_by: userId,
  updated_at: new Date().toISOString()
});

export const calculateAutomationCenterMetrics = ({ automations = [], runs = [], scheduledMessages = [] }) => {
  const activeAutomations = automations.filter((item) => item.active !== false && item.is_active !== false).length;
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
    runs,
    aiSuggestions: [
      'Create a Hammam upsell automation for rainy days.',
      'Late checkout automation performs best for one-night departures.',
      'Follow up abandoned experience interest within 12 hours.'
    ]
  };
};
