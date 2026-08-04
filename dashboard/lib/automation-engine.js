import {
  getAutomationDefinition,
  getAutomationTypeFamily,
  getAutomationTypeOptions,
  getDefaultAutomationConfigs,
  getEngineAutomationTypes,
  getLegacyRuleAutomationTypes,
  normalizeAutomationType
} from '../../shared/automations/catalog.js';

export { scheduledForAutomation } from '../../shared/automations/runtime.js';

export const INTELLIGENT_AUTOMATION_TYPES = getEngineAutomationTypes();
export const LEGACY_AUTOMATION_TYPES = getLegacyRuleAutomationTypes();
export const AUTOMATION_TYPE_OPTIONS = getAutomationTypeOptions().filter((type) => type !== 'all');
export const DEFAULT_INTELLIGENT_AUTOMATIONS = getDefaultAutomationConfigs();

const normalizeLanguage = (value) => {
  const language = String(value || '').trim().toLowerCase();
  return ['es', 'en', 'fr', 'de', 'it', 'pt'].includes(language) ? language : 'en';
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
  const findPersistedAutomation = (definition) => {
    const family = getAutomationTypeFamily(definition.type);
    return (rows || []).find((item) => {
      const rowTypes = [
        item.type,
        item.automation_type,
        item.canonical_type,
        item.canonicalType,
        item.metadata?.canonical_type
      ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

      return rowTypes.some((type) => family.includes(type));
    });
  };

  return DEFAULT_INTELLIGENT_AUTOMATIONS.map((definition) => ({
    ...definition,
    ...(findPersistedAutomation(definition) || {}),
    canonical_type: definition.canonical_type,
    canonicalType: definition.canonicalType,
    aliases: definition.aliases,
    metadata: {
      ...definition.metadata,
      ...(findPersistedAutomation(definition)?.metadata || {}),
      canonical_type: definition.canonical_type,
      aliases: definition.aliases
    },
    actions: {
      ...definition.actions,
      ...(findPersistedAutomation(definition)?.actions || {})
    },
    conditions: {
      ...definition.conditions,
      ...(findPersistedAutomation(definition)?.conditions || {})
    }
  }));
};

export const isRealAutomationId = (id) => (
  typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
);

export const buildAutomationPreview = ({ automationType, hotel, reservation, language = 'en' }) => {
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedType = normalizeAutomationType(automationType);
  const templateType = normalizedType.definition?.templateType
    || normalizedType.legacyType
    || normalizedType.canonicalType
    || automationType;
  const hotelName = hotel?.name || 'the hotel';
  const firstName = reservation?.guest_name?.split(' ')[0] || '';
  const prefix = firstName ? `${firstName}, ` : '';
  const templates = {
    welcome_message: {
      es: `${prefix}bienvenido/a a ${hotelName}. Si necesitas recomendaciones, traslados o ayuda durante tu estancia, estamos aqui para ayudarte.`,
      en: `${prefix}welcome to ${hotelName}. If you need recommendations, transfers or anything during your stay, we are here to help.`
    },
    late_checkout_offer: {
      es: `${prefix}si deseas disfrutar de una salida mas relajada, podemos revisar la disponibilidad de late checkout para tu estancia.`,
      en: `${prefix}if you would like a more relaxed departure, we can check late checkout availability for your stay.`,
      fr: `${prefix}si vous souhaitez profiter d'un depart plus confortable, nous pouvons verifier la disponibilite d'un late checkout pour votre sejour.`
    },
    spa_upsell: {
      es: `${prefix}si te apetece disfrutar de un momento de bienestar durante tu estancia, podemos ayudarte a consultar opciones de spa, hammam o tratamientos disponibles.`,
      en: `${prefix}if you would like to enjoy a moment of wellbeing during your stay, we can help check available spa, hammam or treatment options.`,
      fr: `${prefix}si vous souhaitez profiter d'un moment de bien-etre pendant votre sejour, nous pouvons vous aider a consulter les options spa, hammam ou soins disponibles.`
    },
    experience_recommendation: {
      es: `${prefix}si te apetece descubrir experiencias locales, excursiones o actividades recomendadas, estaremos encantados de ayudarte a encontrar la opcion que mejor encaje contigo.`,
      en: `${prefix}if you would like to discover local experiences, excursions or recommended activities, we will be happy to help you find the option that best suits you.`,
      fr: `${prefix}si vous souhaitez decouvrir des experiences locales, excursions ou activites recommandees, nous serons ravis de vous aider a trouver l'option qui vous convient le mieux.`
    },
    restaurant_promotion: {
      es: `${prefix}si deseas reservar una mesa para esta noche o recibir recomendaciones gastronomicas cercanas, nuestro equipo estara encantado de ayudarte.`,
      en: `${prefix}if you would like to reserve a table for this evening or receive nearby dining recommendations, our team will be happy to help.`,
      fr: `${prefix}si vous souhaitez reserver une table pour ce soir ou recevoir des recommandations gastronomiques a proximite, notre equipe sera ravie de vous aider.`
    },
    transfer_offer: {
      es: `${prefix}si necesitas organizar tu traslado al aeropuerto o cualquier transporte durante tu estancia, estaremos encantados de ayudarte.`,
      en: `${prefix}if you need to arrange an airport transfer or any transportation during your stay, we will be happy to help.`,
      fr: `${prefix}si vous souhaitez organiser un transfert aeroport ou tout autre transport pendant votre sejour, nous serons ravis de vous aider.`
    },
    weather_trigger: {
      es: `${prefix}si el tiempo no acompana, podemos recomendarte planes indoor, spa o experiencias tranquilas cerca del hotel.`,
      en: `${prefix}if the weather is not ideal, we can recommend indoor plans, spa options or calm local experiences.`
    },
    vip_followup: {
      es: `${prefix}como huesped preferente, estaremos encantados de ayudarte con peticiones especiales o recomendaciones personalizadas durante tu estancia.`,
      en: `${prefix}as a preferred guest, we will be happy to help with special requests or personalised recommendations during your stay.`,
      fr: `${prefix}en tant qu'hote privilegie, nous serons ravis de vous aider avec des demandes speciales ou des recommandations personnalisees pendant votre sejour.`
    },
    birthday_message: {
      es: `${prefix}hemos visto que celebras una ocasion especial. Si quieres, podemos ayudarte a preparar un detalle durante tu estancia.`,
      en: `${prefix}we noticed you are celebrating a special occasion. We can help arrange a thoughtful touch during your stay.`
    },
    abandoned_interest_followup: {
      es: `${prefix}si sigues interesado/a, puedo retomar la recomendacion y ayudarte a confirmar los detalles.`,
      en: `${prefix}if you are still interested, I can pick this back up and help confirm the details.`
    },
    pre_checkout_folio_reminder: {
      es: `${prefix}te recordamos que manana esta prevista tu salida del hotel. Actualmente existe un saldo pendiente estimado asociado a tu estancia. Si tienes cualquier duda, nuestro equipo de recepcion estara encantado de ayudarte.`,
      en: `${prefix}this is a friendly reminder that your departure from the hotel is scheduled for tomorrow. There is currently an estimated pending balance associated with your stay. If you have any questions, our reception team will be happy to help.`,
      fr: `${prefix}nous vous rappelons que votre depart de l'hotel est prevu demain. Un solde estime est actuellement associe a votre sejour. Si vous avez la moindre question, notre equipe de reception sera ravie de vous aider.`
    },
    post_stay_review_intelligence: {
      es: `${prefix}gracias por alojarte con nosotros. Esperamos que hayas disfrutado de tu estancia. Tu opinion nos ayuda a seguir mejorando. Podrias dedicar unos segundos a valorar tu experiencia?`,
      en: `${prefix}thank you for staying with us. We hope you enjoyed your stay. Your feedback helps us improve. Would you mind sharing your experience with us?`
    }
  };

  return templates[templateType]?.[normalizedLanguage] || templates[templateType]?.en || templates.welcome_message.en;
};

export const normalizeAutomationForInsert = ({ hotelId, automation, userId = null }) => {
  const definition = getAutomationDefinition(automation.canonical_type || automation.canonicalType || automation.type);
  const aliases = definition ? getAutomationTypeFamily(definition.type) : [];

  return {
    hotel_id: hotelId,
    name: automation.name,
    type: automation.type,
    trigger_type: automation.trigger_type || automation.triggerType || definition?.trigger || 'manual',
    active: automation.active !== false,
    audience_type: automation.audience_type || automation.audienceType || definition?.audienceType || 'all_guests',
    conditions: automation.conditions || {},
    actions: automation.actions || {},
    cooldown_minutes: Number(automation.cooldown_minutes || automation.cooldownMinutes || definition?.cooldownMinutes || 1440),
    max_per_guest: Number(automation.max_per_guest || automation.maxPerGuest || definition?.maxPerGuest || 1),
    created_by: userId,
    metadata: {
      ...(automation.metadata || {}),
      canonical_type: definition?.type || automation.canonical_type || automation.canonicalType || automation.type,
      aliases
    },
    updated_at: new Date().toISOString()
  };
};

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
