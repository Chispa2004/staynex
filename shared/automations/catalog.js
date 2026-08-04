export const AUTOMATION_RUNTIME_VERSION = 'automation-runtime-foundation-phase1';
export const AUTOMATION_RULE_VERSION = 'catalog-v1';

export const EXECUTION_MODES = {
  DISABLED: 'disabled',
  PREVIEW: 'preview',
  APPROVAL_REQUIRED: 'approval_required',
  LIVE_LIMITED: 'live_limited',
  LIVE: 'live'
};

export const OPERATIONAL_STATUSES = {
  EVALUATED: 'evaluated',
  SKIPPED: 'skipped',
  PREVIEW: 'preview',
  AWAITING_APPROVAL: 'awaiting_approval',
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  SENT: 'sent',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

export const CERTIFICATION_STATUSES = {
  UNCERTIFIED: 'uncertified',
  CERTIFIED: 'certified'
};

const CURRENT_ALLOWED_MODES = [
  EXECUTION_MODES.DISABLED,
  EXECUTION_MODES.PREVIEW
];

const FUTURE_ALLOWED_MODES = [
  EXECUTION_MODES.APPROVAL_REQUIRED,
  EXECUTION_MODES.LIVE_LIMITED,
  EXECUTION_MODES.LIVE
];

const baseDefinition = ({
  type,
  label,
  legacyAliases = [],
  runtimeCandidates = [],
  engineDefaultType = null,
  legacyRuleType = false,
  trigger,
  category,
  audienceType,
  requiredData = [],
  priority = 'LOW',
  requiresRealPms = false,
  canPreview = true,
  humanApprovalRequired = false,
  cooldownMinutes = 1440,
  maxPerGuest = 1,
  estimatedRevenue = 0,
  templateType = null,
  scheduleAnchor = 'reservation_window'
}) => ({
  type,
  canonicalType: type,
  label: label || type,
  legacyAliases,
  runtimeCandidates,
  engineDefaultType,
  legacyRuleType,
  trigger,
  category,
  audienceType: audienceType || category,
  requiredData,
  allowedModes: CURRENT_ALLOWED_MODES,
  maxCurrentMode: EXECUTION_MODES.PREVIEW,
  futureAllowedModes: FUTURE_ALLOWED_MODES,
  priority,
  requiresRealPms,
  canPreview,
  humanApprovalRequired,
  certificationStatus: CERTIFICATION_STATUSES.UNCERTIFIED,
  ruleVersion: `${AUTOMATION_RULE_VERSION}:${type}`,
  cooldownMinutes,
  maxPerGuest,
  estimatedRevenue,
  templateType: templateType || engineDefaultType || type,
  scheduleAnchor
});

export const CANONICAL_AUTOMATION_DEFINITIONS = [
  baseDefinition({
    type: 'welcome',
    label: 'Welcome message',
    legacyAliases: ['welcome_message'],
    runtimeCandidates: ['welcome_message'],
    engineDefaultType: 'welcome_message',
    trigger: 'check_in_or_arrival',
    category: 'guest_journey',
    audienceType: 'checked_in_guests',
    requiredData: ['hotelId', 'reservationId', 'guestId', 'recipient'],
    templateType: 'welcome_message',
    scheduleAnchor: 'arrival',
    priority: 'LOW'
  }),
  baseDefinition({
    type: 'pre_checkin',
    label: 'Pre-checkin',
    legacyAliases: ['pre_arrival_7d', 'pre_arrival_1d', 'pre_arrival', 'pre_checkin'],
    runtimeCandidates: ['pre_arrival_7d', 'pre_arrival_1d'],
    legacyRuleType: true,
    trigger: 'pre_arrival',
    category: 'guest_journey',
    audienceType: 'reservation_journey',
    requiredData: ['hotelId', 'reservationId', 'arrivalDate', 'recipient'],
    templateType: 'pre_arrival_1d',
    scheduleAnchor: 'arrival',
    priority: 'LOW'
  }),
  baseDefinition({
    type: 'checkin',
    label: 'Check-in',
    legacyAliases: ['check_in', 'arrival_day'],
    runtimeCandidates: ['checkin'],
    trigger: 'arrival_day',
    category: 'operations',
    audienceType: 'arriving_guests',
    requiredData: ['hotelId', 'reservationId', 'arrivalDate', 'recipient'],
    templateType: 'welcome_message',
    scheduleAnchor: 'arrival',
    priority: 'MEDIUM'
  }),
  baseDefinition({
    type: 'during_stay',
    label: 'During stay',
    legacyAliases: ['weather_trigger', 'in_house_message', 'in_stay'],
    runtimeCandidates: ['weather_trigger'],
    engineDefaultType: 'weather_trigger',
    trigger: 'in_house_context',
    category: 'operations',
    audienceType: 'in_house_guests',
    requiredData: ['hotelId', 'reservationId', 'stayPhase', 'recipient'],
    templateType: 'weather_trigger',
    scheduleAnchor: 'arrival',
    priority: 'LOW',
    estimatedRevenue: 70,
    cooldownMinutes: 720
  }),
  baseDefinition({
    type: 'upselling',
    label: 'Abandoned interest follow-up',
    legacyAliases: ['in_stay_upsell', 'abandoned_interest_followup', 'upsell', 'upsell_followup'],
    runtimeCandidates: ['in_stay_upsell', 'abandoned_interest_followup'],
    engineDefaultType: 'abandoned_interest_followup',
    legacyRuleType: true,
    trigger: 'commercial_interest',
    category: 'revenue',
    audienceType: 'interested_guests',
    requiredData: ['hotelId', 'reservationId', 'guestSignals', 'recipient'],
    templateType: 'abandoned_interest_followup',
    scheduleAnchor: 'arrival',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 80,
    cooldownMinutes: 720
  }),
  baseDefinition({
    type: 'transfer',
    label: 'Transfer offer',
    legacyAliases: ['transfer_offer', 'airport_transfer'],
    runtimeCandidates: ['transfer_offer'],
    engineDefaultType: 'transfer_offer',
    trigger: 'transfer_need',
    category: 'revenue',
    audienceType: 'arriving_guests',
    requiredData: ['hotelId', 'reservationId', 'arrivalDate', 'guestSignals', 'recipient'],
    templateType: 'transfer_offer',
    scheduleAnchor: 'arrival_minus_24h',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 60
  }),
  baseDefinition({
    type: 'restaurant',
    label: 'Restaurant promotion',
    legacyAliases: ['restaurant_promotion', 'restaurant_offer'],
    runtimeCandidates: ['restaurant_promotion'],
    engineDefaultType: 'restaurant_promotion',
    trigger: 'restaurant_interest_or_in_house',
    category: 'revenue',
    audienceType: 'in_house_guests',
    requiredData: ['hotelId', 'reservationId', 'stayPhase', 'recipient'],
    templateType: 'restaurant_promotion',
    scheduleAnchor: 'arrival',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 55
  }),
  baseDefinition({
    type: 'spa',
    label: 'Spa / wellness upsell',
    legacyAliases: ['spa_upsell', 'wellness_upsell'],
    runtimeCandidates: ['spa_upsell'],
    engineDefaultType: 'spa_upsell',
    trigger: 'spa_interest',
    category: 'revenue',
    audienceType: 'wellness_interest',
    requiredData: ['hotelId', 'reservationId', 'guestSignals', 'recipient'],
    templateType: 'spa_upsell',
    scheduleAnchor: 'arrival',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 85,
    cooldownMinutes: 720,
    maxPerGuest: 2
  }),
  baseDefinition({
    type: 'experience',
    label: 'Experience recommendation',
    legacyAliases: ['experience_recommendation', 'experience_offer'],
    runtimeCandidates: ['experience_recommendation'],
    engineDefaultType: 'experience_recommendation',
    trigger: 'experience_interest',
    category: 'revenue',
    audienceType: 'experience_interest',
    requiredData: ['hotelId', 'reservationId', 'guestSignals', 'recipient'],
    templateType: 'experience_recommendation',
    scheduleAnchor: 'arrival',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 95,
    cooldownMinutes: 720,
    maxPerGuest: 2
  }),
  baseDefinition({
    type: 'late_checkout',
    label: 'Late checkout offer',
    legacyAliases: ['late_checkout_offer'],
    runtimeCandidates: ['late_checkout_offer'],
    engineDefaultType: 'late_checkout_offer',
    trigger: 'pre_checkout',
    category: 'revenue',
    audienceType: 'departing_guests',
    requiredData: ['hotelId', 'reservationId', 'departureDate', 'recipient'],
    templateType: 'late_checkout_offer',
    scheduleAnchor: 'departure_minus_20h',
    priority: 'MEDIUM',
    humanApprovalRequired: true,
    estimatedRevenue: 45
  }),
  baseDefinition({
    type: 'checkout',
    label: 'Checkout reminder',
    legacyAliases: ['checkout_reminder', 'departure_day'],
    runtimeCandidates: ['checkout'],
    trigger: 'departure_day',
    category: 'operations',
    audienceType: 'departing_guests',
    requiredData: ['hotelId', 'reservationId', 'departureDate', 'recipient'],
    templateType: 'late_checkout_offer',
    scheduleAnchor: 'departure',
    priority: 'MEDIUM'
  }),
  baseDefinition({
    type: 'pre_checkout_folio',
    label: 'Pre-checkout Folio Reminder',
    legacyAliases: ['pre_checkout_folio_reminder', 'pre_checkout_folio'],
    runtimeCandidates: ['pre_checkout_folio_reminder'],
    engineDefaultType: 'pre_checkout_folio_reminder',
    trigger: 'pre_checkout_folio',
    category: 'operations',
    audienceType: 'departing_guests_with_balance',
    requiredData: ['hotelId', 'reservationId', 'departureDate', 'folio', 'recipient'],
    templateType: 'pre_checkout_folio_reminder',
    scheduleAnchor: 'departure_minus_24h',
    priority: 'HIGH',
    requiresRealPms: true,
    humanApprovalRequired: true
  }),
  baseDefinition({
    type: 'post_checkout',
    label: 'Post-checkout follow-up',
    legacyAliases: ['post_checkout_followup'],
    runtimeCandidates: ['post_checkout'],
    trigger: 'post_checkout',
    category: 'guest_journey',
    audienceType: 'checked_out_guests',
    requiredData: ['hotelId', 'reservationId', 'departureDate', 'recipient'],
    templateType: 'post_stay_review_intelligence',
    scheduleAnchor: 'departure_plus_24h',
    priority: 'LOW'
  }),
  baseDefinition({
    type: 'review_request',
    label: 'Post-stay Review Intelligence',
    legacyAliases: ['post_stay_review', 'post_stay_review_intelligence'],
    runtimeCandidates: ['post_stay_review', 'post_stay_review_intelligence'],
    engineDefaultType: 'post_stay_review_intelligence',
    legacyRuleType: true,
    trigger: 'post_checkout_24h',
    category: 'reputation',
    audienceType: 'checked_out_guests',
    requiredData: ['hotelId', 'reservationId', 'departureDate', 'sentiment', 'recipient'],
    templateType: 'post_stay_review_intelligence',
    scheduleAnchor: 'departure_plus_24h',
    priority: 'MEDIUM',
    humanApprovalRequired: true
  }),
  baseDefinition({
    type: 'vip_followup',
    label: 'VIP follow-up',
    legacyAliases: ['vip_followup', 'vip_follow_up'],
    runtimeCandidates: ['vip_followup'],
    engineDefaultType: 'vip_followup',
    trigger: 'vip_signal',
    category: 'guest_journey',
    audienceType: 'vip_guests',
    requiredData: ['hotelId', 'reservationId', 'vipSignals', 'recipient'],
    templateType: 'vip_followup',
    scheduleAnchor: 'arrival',
    priority: 'HIGH',
    humanApprovalRequired: true,
    estimatedRevenue: 120,
    maxPerGuest: 2
  }),
  baseDefinition({
    type: 'birthday',
    label: 'Birthday message',
    legacyAliases: ['birthday_message', 'celebration_message'],
    runtimeCandidates: ['birthday_message'],
    engineDefaultType: 'birthday_message',
    trigger: 'birthday_or_celebration',
    category: 'guest_journey',
    audienceType: 'celebration_guests',
    requiredData: ['hotelId', 'reservationId', 'celebrationSignals', 'recipient'],
    templateType: 'birthday_message',
    scheduleAnchor: 'arrival',
    priority: 'LOW',
    estimatedRevenue: 35
  })
];

const aliasEntries = CANONICAL_AUTOMATION_DEFINITIONS.flatMap((definition) => [
  [definition.type, definition.type],
  [definition.canonicalType, definition.type],
  ...definition.legacyAliases.map((alias) => [alias, definition.type]),
  ...definition.runtimeCandidates.map((alias) => [alias, definition.type])
]);

const aliasToCanonical = new Map(aliasEntries.map(([alias, canonical]) => [
  String(alias).trim().toLowerCase(),
  canonical
]));

const definitionsByType = new Map(CANONICAL_AUTOMATION_DEFINITIONS.map((definition) => [
  definition.type,
  definition
]));

const constantKeyForType = (value) => String(value || '')
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

export const getCanonicalAutomationDefinitions = () => CANONICAL_AUTOMATION_DEFINITIONS;

export const normalizeAutomationType = (value) => {
  const rawType = String(value || '').trim().toLowerCase();
  const canonicalType = aliasToCanonical.get(rawType) || rawType;
  const definition = definitionsByType.get(canonicalType) || null;

  return {
    inputType: rawType || null,
    canonicalType: definition?.type || canonicalType || null,
    automationType: definition?.type || canonicalType || null,
    legacyType: definition && rawType && rawType !== definition.type ? rawType : null,
    definition
  };
};

export const getAutomationDefinition = (value) => normalizeAutomationType(value).definition;

export const isCanonicalAutomationType = (value) => (
  Boolean(value) && definitionsByType.has(String(value).trim().toLowerCase())
);

export const getRuntimeCandidatesForDefinition = (definition) => (
  definition?.runtimeCandidates?.length ? definition.runtimeCandidates : [definition?.type].filter(Boolean)
);

export const getAutomationTypeFamily = (value) => {
  const definition = getAutomationDefinition(value);
  if (!definition) {
    return [String(value || '').trim().toLowerCase()].filter(Boolean);
  }

  return [...new Set([
    definition.type,
    definition.engineDefaultType,
    ...definition.legacyAliases,
    ...definition.runtimeCandidates
  ].filter(Boolean).map((item) => String(item).trim().toLowerCase()))];
};

export const automationTypesMatch = (left, right) => {
  const leftFamily = getAutomationTypeFamily(left);
  const rightFamily = getAutomationTypeFamily(right);
  return leftFamily.some((item) => rightFamily.includes(item));
};

export const isAutomationCertified = (value) => (
  getAutomationDefinition(value)?.certificationStatus === CERTIFICATION_STATUSES.CERTIFIED
);

export const getLegacyRuleAutomationTypes = () => (
  CANONICAL_AUTOMATION_DEFINITIONS
    .flatMap((definition) => definition.legacyRuleType ? definition.runtimeCandidates : [])
);

export const getLegacyAutomationTypesMap = () => ({
  PRE_ARRIVAL_7D: 'pre_arrival_7d',
  PRE_ARRIVAL_1D: 'pre_arrival_1d',
  IN_STAY_UPSELL: 'in_stay_upsell',
  POST_STAY_REVIEW: 'post_stay_review'
});

export const getEngineAutomationTypes = () => (
  CANONICAL_AUTOMATION_DEFINITIONS
    .map((definition) => definition.engineDefaultType)
    .filter(Boolean)
);

export const getEngineAutomationTypesMap = () => Object.fromEntries(
  getEngineAutomationTypes().map((type) => [constantKeyForType(type), type])
);

export const getAutomationTypeOptions = () => (
  ['all', ...new Set(CANONICAL_AUTOMATION_DEFINITIONS.flatMap((definition) => [
    definition.type,
    definition.engineDefaultType,
    ...definition.legacyAliases,
    ...definition.runtimeCandidates
  ].filter(Boolean)))]
);

export const getDefaultAutomationConfigs = () => (
  CANONICAL_AUTOMATION_DEFINITIONS
    .filter((definition) => definition.engineDefaultType)
    .map((definition) => ({
      id: `default-${definition.engineDefaultType}`,
      name: definition.label,
      type: definition.engineDefaultType,
      canonical_type: definition.type,
      canonicalType: definition.type,
      aliases: getAutomationTypeFamily(definition.type),
      trigger_type: definition.trigger,
      active: true,
      audience_type: definition.audienceType,
      cooldown_minutes: definition.cooldownMinutes,
      max_per_guest: definition.maxPerGuest,
      conditions: {},
      actions: {
        channel: 'whatsapp',
        estimated_revenue: definition.estimatedRevenue,
        message_tone: 'premium_concierge'
      },
      metadata: {
        source: 'canonical_automation_catalog',
        canonical_type: definition.type,
        certification_status: definition.certificationStatus,
        max_current_mode: definition.maxCurrentMode,
        allowed_modes: definition.allowedModes,
        requires_real_pms: definition.requiresRealPms,
        can_preview: definition.canPreview,
        human_approval_required: definition.humanApprovalRequired,
        rule_version: definition.ruleVersion
      }
    }))
);
