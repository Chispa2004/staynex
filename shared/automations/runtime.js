import {
  AUTOMATION_RUNTIME_VERSION,
  CERTIFICATION_STATUSES,
  EXECUTION_MODES,
  OPERATIONAL_STATUSES,
  getAutomationDefinition,
  normalizeAutomationType
} from './catalog.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const KNOWN_EXECUTION_MODES = new Set(Object.values(EXECUTION_MODES));

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateOnly = (value) => {
  const date = normalizeDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const dateAtNoon = (value) => {
  const day = dateOnly(value);
  return day ? `${day}T12:00:00.000Z` : null;
};

const addHours = (value, hours) => {
  const date = normalizeDate(value);
  if (!date) return null;
  date.setTime(date.getTime() + hours * HOUR_MS);
  return date.toISOString();
};

const addDays = (value, days) => {
  const date = normalizeDate(value);
  if (!date) return null;
  date.setTime(date.getTime() + days * DAY_MS);
  return date.toISOString();
};

export const scheduledForAutomation = ({ automationType, reservation = {} } = {}) => {
  const normalized = normalizeAutomationType(automationType);
  const definition = normalized.definition;
  const inputType = normalized.inputType;
  const arrival = dateAtNoon(reservation.arrival_date || reservation.checkIn || reservation.check_in);
  const departure = dateAtNoon(reservation.departure_date || reservation.checkOut || reservation.check_out);

  if (inputType === 'pre_arrival_7d') return arrival ? addHours(arrival, -24 * 7) : null;
  if (inputType === 'pre_arrival_1d') return arrival ? addHours(arrival, -24) : null;
  if (inputType === 'in_stay_upsell') return arrival;
  if (inputType === 'post_stay_review') return departure ? addHours(departure, 24) : null;
  if (inputType === 'welcome_message') return arrival;
  if (inputType === 'late_checkout_offer') return departure ? addHours(departure, -20) : null;
  if (inputType === 'pre_checkout_folio_reminder') return departure ? addHours(departure, -24) : null;
  if (inputType === 'transfer_offer') return arrival ? addHours(arrival, -24) : null;
  if (inputType === 'post_stay_review_intelligence') return departure ? addHours(departure, 24) : null;

  if (!definition) return null;

  if (definition.scheduleAnchor === 'arrival') return arrival;
  if (definition.scheduleAnchor === 'arrival_minus_24h') return arrival ? addHours(arrival, -24) : null;
  if (definition.scheduleAnchor === 'departure') return departure;
  if (definition.scheduleAnchor === 'departure_minus_20h') return departure ? addHours(departure, -20) : null;
  if (definition.scheduleAnchor === 'departure_minus_24h') return departure ? addHours(departure, -24) : null;
  if (definition.scheduleAnchor === 'departure_plus_24h') return departure ? addHours(departure, 24) : null;

  return null;
};

const hasStatus = (reservation = {}, statuses = []) => (
  statuses.includes(String(reservation.status || '').trim().toLowerCase())
);

const textCorpus = ({ reservation = {}, guest = {}, conversation = null, metadata = {} } = {}) => [
  reservation.guest_notes,
  reservation.notes,
  reservation.room_type,
  reservation.rate_plan,
  reservation.pms_status,
  reservation.metadata?.tags,
  reservation.metadata?.notes,
  reservation.metadata?.interests,
  reservation.metadata?.last_intent,
  reservation.metadata?.last_guest_message,
  guest.interests,
  guest.metadata?.tags,
  guest.metadata?.notes,
  guest.metadata?.interests,
  guest.metadata?.last_intent,
  guest.metadata?.last_guest_message,
  conversation?.last_message,
  conversation?.lastMessage?.content,
  metadata.guestSignals,
  metadata.intent
].flat().filter(Boolean).join(' ').toLowerCase();

const hasAnySignal = (params, words = []) => {
  const text = textCorpus(params);
  return words.some((word) => text.includes(word));
};

const isValidRecipient = (value) => String(value || '').replace(/\D/g, '').length >= 8;

const isOptedOut = ({ reservation = {}, guest = {} } = {}) => (
  Boolean(guest.opt_out)
  || Boolean(guest.metadata?.opt_out)
  || Boolean(reservation.opt_out)
  || Boolean(reservation.metadata?.opt_out)
  || Boolean(reservation.metadata?.guest_opt_out)
);

export const isHumanTakeoverActive = ({ guest = {}, conversation = null, conversationState = null } = {}) => {
  const mode = String(
    conversationState?.conversation_ai_mode
    || conversationState?.ai_mode
    || conversation?.conversation_ai_mode
    || conversation?.ai_mode
    || guest.conversationState?.conversation_ai_mode
    || ''
  ).toLowerCase();

  return Boolean(guest.human_takeover)
    || Boolean(conversation?.human_takeover)
    || Boolean(conversationState?.human_takeover)
    || mode === 'human_takeover'
    || mode === 'human';
};

const hasWelcomeAlreadyDelivered = ({ reservation = {}, guest = {}, recentRuns = [], recentScheduledMessages = [] } = {}) => {
  if (
    guest.welcome_sent_for_stay
    || reservation.welcome_sent_for_stay
    || guest.metadata?.welcome_sent_for_stay
    || reservation.metadata?.welcome_sent_for_stay
  ) {
    return true;
  }

  const reservationId = reservation.id || reservation.reservation_id || null;
  return [...recentRuns, ...recentScheduledMessages].some((record) => (
    ['welcome', 'welcome_message'].includes(record.automation_type || record.type)
    && (!reservationId || record.reservation_id === reservationId)
    && !['failed', 'cancelled', 'skipped'].includes(record.status)
  ));
};

const hoursUntilDeparture = ({ reservation = {}, now }) => {
  if (!reservation.departure_date) return null;
  const departure = normalizeDate(
    String(reservation.departure_date).includes('T')
      ? reservation.departure_date
      : `${reservation.departure_date}T12:00:00.000Z`
  );
  return departure ? (departure.getTime() - now.getTime()) / HOUR_MS : null;
};

const hoursAfterDeparture = ({ reservation = {}, now }) => {
  const hours = hoursUntilDeparture({ reservation, now });
  return hours === null ? null : -hours;
};

const daysToArrival = ({ reservation = {}, now }) => {
  if (!reservation.arrival_date) return null;
  const arrival = normalizeDate(`${dateOnly(reservation.arrival_date)}T12:00:00.000Z`);
  const reference = normalizeDate(`${dateOnly(now)}T12:00:00.000Z`);
  if (!arrival || !reference) return null;
  return Math.round((arrival.getTime() - reference.getTime()) / DAY_MS);
};

const normalizeExecutionMode = ({ requestedMode, hotel = {}, definition }) => {
  const hotelMode = String(
    hotel.automation_execution_mode
    || hotel.execution_mode
    || hotel.metadata?.automation_execution_mode
    || hotel.metadata?.automation_mode
    || EXECUTION_MODES.PREVIEW
  ).trim().toLowerCase();
  const requested = String(requestedMode || hotelMode || EXECUTION_MODES.PREVIEW).trim().toLowerCase();
  let mode = KNOWN_EXECUTION_MODES.has(requested) ? requested : EXECUTION_MODES.PREVIEW;

  if (hotelMode === EXECUTION_MODES.DISABLED || requested === EXECUTION_MODES.DISABLED) {
    return EXECUTION_MODES.DISABLED;
  }

  if (definition?.certificationStatus !== CERTIFICATION_STATUSES.CERTIFIED) {
    return EXECUTION_MODES.PREVIEW;
  }

  if ([EXECUTION_MODES.LIVE_LIMITED, EXECUTION_MODES.LIVE].includes(mode)) {
    return EXECUTION_MODES.PREVIEW;
  }

  if (!definition?.allowedModes?.includes(mode)) {
    return EXECUTION_MODES.PREVIEW;
  }

  return mode;
};

const safeMetadata = (metadata = {}) => {
  const allowedKeys = [
    'source',
    'scenario_id',
    'test_mode',
    'dry_run',
    'priority',
    'strategy',
    'stay_sentiment',
    'review_risk_score',
    'folio_data_quality',
    'folio_warnings',
    'pms_data_complete',
    'rule_version',
    'runtime_context',
    'triggerOccurrence'
  ];

  return allowedKeys.reduce((acc, key) => {
    if (metadata[key] !== undefined) {
      acc[key] = metadata[key];
    }
    return acc;
  }, {});
};

const triggerDecisionForType = ({
  automationType,
  legacyType,
  reservation = {},
  guest = {},
  conversation = null,
  metadata = {},
  now
}) => {
  const params = { reservation, guest, conversation, metadata };
  const arrivalDelta = daysToArrival({ reservation, now });
  const departureHours = hoursUntilDeparture({ reservation, now });
  const elapsedDepartureHours = hoursAfterDeparture({ reservation, now });
  const inHouse = hasStatus(reservation, ['checked_in', 'in_house']);
  const checkedOut = hasStatus(reservation, ['checked_out', 'completed', 'departed', 'finalized']);

  if (legacyType === 'pre_arrival_7d') {
    return arrivalDelta !== null && arrivalDelta <= 7 && arrivalDelta >= 0
      ? { eligible: true, reason: 'pre_arrival_7d_window' }
      : { eligible: false, reason: 'outside_pre_arrival_7d_window' };
  }

  if (legacyType === 'pre_arrival_1d') {
    return arrivalDelta !== null && arrivalDelta <= 1 && arrivalDelta >= 0
      ? { eligible: true, reason: 'pre_arrival_1d_window' }
      : { eligible: false, reason: 'outside_pre_arrival_1d_window' };
  }

  const decisions = {
    welcome: () => {
      if (hasWelcomeAlreadyDelivered({ reservation, guest, recentRuns: metadata.recentRuns, recentScheduledMessages: metadata.recentScheduledMessages })) {
        return { eligible: false, reason: 'welcome_already_delivered', duplicateBlocked: true };
      }

      return inHouse || arrivalDelta === 0
        ? { eligible: true, reason: 'guest_checked_in_or_arriving_today' }
        : { eligible: false, reason: 'not_checked_in' };
    },
    pre_checkin: () => (
      arrivalDelta !== null && arrivalDelta >= 0 && arrivalDelta <= 7
        ? { eligible: true, reason: 'pre_checkin_window' }
        : { eligible: false, reason: 'outside_pre_checkin_window' }
    ),
    checkin: () => (
      arrivalDelta === 0 || inHouse
        ? { eligible: true, reason: 'arrival_day_or_checked_in' }
        : { eligible: false, reason: 'not_arrival_day' }
    ),
    during_stay: () => (
      inHouse
        ? { eligible: true, reason: 'in_house_guest' }
        : { eligible: false, reason: 'not_in_house' }
    ),
    upselling: () => (
      inHouse || hasAnySignal(params, ['interested', 'me interesa', 'details', 'availability', 'spa', 'experience', 'restaurant', 'transfer'])
        ? { eligible: true, reason: 'commercial_interest_or_in_house' }
        : { eligible: false, reason: 'no_upsell_signal' }
    ),
    transfer: () => (
      hasAnySignal(params, ['transfer', 'airport', 'taxi', 'traslado', 'aeropuerto']) || arrivalDelta === 0 || arrivalDelta === 1
        ? { eligible: true, reason: 'arrival_or_transfer_need' }
        : { eligible: false, reason: 'no_transfer_need' }
    ),
    restaurant: () => (
      inHouse || hasAnySignal(params, ['restaurant', 'dinner', 'cena', 'food', 'gastronomy'])
        ? { eligible: true, reason: 'restaurant_context' }
        : { eligible: false, reason: 'no_restaurant_context' }
    ),
    spa: () => (
      hasAnySignal(params, ['spa', 'wellness', 'hammam', 'massage', 'relax', 'bienestar', 'masaje'])
        ? { eligible: true, reason: 'spa_interest_detected' }
        : { eligible: false, reason: 'no_spa_interest' }
    ),
    experience: () => (
      hasAnySignal(params, ['experience', 'tour', 'excursion', 'actividad', 'agafay', 'atlas', 'boat', 'catamaran'])
        ? { eligible: true, reason: 'experience_interest_detected' }
        : { eligible: false, reason: 'no_experience_interest' }
    ),
    late_checkout: () => (
      departureHours !== null && departureHours > 0 && departureHours <= 36
        ? { eligible: true, reason: 'departure_within_36h' }
        : { eligible: false, reason: 'not_departing_soon' }
    ),
    checkout: () => (
      departureHours !== null && departureHours > 0 && departureHours <= 24
        ? { eligible: true, reason: 'departure_day' }
        : { eligible: false, reason: 'not_departure_day' }
    ),
    pre_checkout_folio: () => {
      if (departureHours === null || departureHours <= 0 || departureHours > 36) {
        return { eligible: false, reason: 'checkout_not_within_24h' };
      }

      const folio = metadata.folio || guest.folio || reservation.folio || {};
      if (!folio.available && guest.folio_complete === false) {
        return { eligible: false, reason: 'skipped_incomplete_folio' };
      }

      if (!folio.available) {
        return { eligible: false, reason: 'folio_missing' };
      }

      if (Number(guest.balance_due || folio.outstandingBalance || folio.outstanding_balance || 0) <= 0) {
        return { eligible: false, reason: 'no_outstanding_balance' };
      }

      return { eligible: true, reason: 'departure_tomorrow_with_balance' };
    },
    post_checkout: () => (
      checkedOut || (elapsedDepartureHours !== null && elapsedDepartureHours >= 0)
        ? { eligible: true, reason: 'post_checkout_window' }
        : { eligible: false, reason: 'not_checked_out' }
    ),
    review_request: () => (
      (checkedOut || elapsedDepartureHours !== null) && elapsedDepartureHours !== null && elapsedDepartureHours >= 18 && elapsedDepartureHours <= 48
        ? { eligible: true, reason: guest.sentiment === 'negative' ? 'negative_stay_quality_alert' : 'post_checkout_24h_review' }
        : { eligible: false, reason: 'not_checked_out_24h_ago' }
    ),
    vip_followup: () => (
      hasAnySignal(params, ['vip', 'suite', 'premium', 'luxury', 'honeymoon', 'anniversary'])
        || /suite|vip/i.test(reservation.room_type || guest.room_type || '')
        ? { eligible: true, reason: 'vip_guest_detected' }
        : { eligible: false, reason: 'not_vip' }
    ),
    birthday: () => (
      guest.birthday_today || hasAnySignal(params, ['birthday', 'cumple', 'anniversary', 'honeymoon', 'celebration'])
        ? { eligible: true, reason: 'birthday_or_celebration' }
        : { eligible: false, reason: 'no_birthday_signal' }
    )
  };

  return decisions[automationType]?.() || { eligible: false, reason: 'unknown_automation_type' };
};

const stableKeyPart = (value) => String(value || 'none')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9:_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'none';

const stableReservationWindow = ({ reservation = {}, reservationId = null, trigger }) => {
  if (!reservationId) return null;
  const arrival = dateOnly(reservation.arrival_date);
  const departure = dateOnly(reservation.departure_date);
  return ['reservation', reservationId, trigger, arrival || 'no-arrival', departure || 'no-departure'].join(':');
};

const resolveTriggerOccurrence = ({
  metadata = {},
  reservation = {},
  reservationId = null,
  scheduledFor = null,
  trigger
}) => (
  metadata.triggerOccurrence
  || metadata.pmsEventId
  || metadata.pms_event_id
  || metadata.eventId
  || metadata.event_id
  || scheduledFor
  || stableReservationWindow({ reservation, reservationId, trigger })
);

export const buildAutomationIdempotencyKey = ({
  hotelId,
  reservationId = null,
  stayId = null,
  automationType,
  trigger,
  triggerOccurrence,
  ruleVersion
}) => {
  if (!hotelId) {
    throw new Error('hotelId is required to build automation idempotencyKey');
  }

  if (!automationType) {
    throw new Error('automationType is required to build automation idempotencyKey');
  }

  const stayKey = reservationId || stayId;
  if (!stayKey) {
    throw new Error('reservationId or stayId is required to build automation idempotencyKey');
  }

  if (!triggerOccurrence) {
    throw new Error('stable triggerOccurrence is required to build automation idempotencyKey');
  }

  return [
    'automation',
    'phase1',
    stableKeyPart(hotelId),
    stableKeyPart(stayKey),
    stableKeyPart(automationType),
    stableKeyPart(trigger),
    stableKeyPart(triggerOccurrence),
    stableKeyPart(ruleVersion)
  ].join(':');
};

export const evaluateAutomationDecision = ({
  hotel = {},
  reservation = {},
  guest = null,
  conversation = null,
  conversationState = null,
  automation = null,
  automationType,
  legacyType = null,
  trigger = null,
  executionMode = EXECUTION_MODES.PREVIEW,
  now = new Date(),
  recentRuns = [],
  recentScheduledMessages = [],
  metadata = {},
  templateId = null,
  templateVersion = null,
  source = 'automation_runtime'
} = {}) => {
  const normalized = normalizeAutomationType(legacyType || automationType || automation?.type || automation?.automation_type);
  const definition = normalized.definition || getAutomationDefinition(normalized.canonicalType);
  const canonicalType = definition?.type || normalized.canonicalType;

  if (!hotel?.id && !reservation?.hotel_id) {
    throw new Error('hotelId is required for automation evaluation');
  }

  if (!definition) {
    throw new Error(`Unknown automation type: ${automationType || legacyType || automation?.type || 'missing'}`);
  }

  const evaluatedAt = normalizeDate(now) || new Date();
  const hotelId = hotel.id || reservation.hotel_id;
  const reservationId = reservation.id || reservation.reservation_id || metadata.reservationId || null;
  const stayId = reservation.stay_id || guest?.stay_id || metadata.stayId || null;
  const guestId = reservation.guest_id || guest?.id || metadata.guestId || null;
  const timezone = hotel.timezone || hotel.metadata?.timezone || metadata.timezone || 'Europe/Madrid';
  const resolvedLegacyType = normalized.legacyType || (legacyType && legacyType !== canonicalType ? legacyType : null);
  const resolvedTrigger = trigger || automation?.trigger_type || automation?.triggerType || definition.trigger;
  const requestedMode = executionMode;
  const resolvedMode = normalizeExecutionMode({ requestedMode, hotel, definition });
  const scheduledFor = scheduledForAutomation({
    automationType: resolvedLegacyType || canonicalType,
    reservation
  });
  const triggerOccurrence = resolveTriggerOccurrence({
    metadata,
    reservation,
    reservationId,
    scheduledFor,
    trigger: resolvedTrigger
  });
  const idempotencyKey = buildAutomationIdempotencyKey({
    hotelId,
    reservationId,
    stayId,
    automationType: canonicalType,
    trigger: resolvedTrigger,
    triggerOccurrence,
    ruleVersion: definition.ruleVersion
  });
  const recipient = metadata.recipient || metadata.sendTo || reservation.guest_phone || guest?.phone_number || guest?.phone || null;
  const recipientAvailable = isValidRecipient(recipient);
  const takeoverActive = isHumanTakeoverActive({ guest: guest || {}, conversation, conversationState });
  const safeContextMetadata = {
    ...safeMetadata(metadata),
    recentRuns,
    recentScheduledMessages,
    folio: metadata.folio
  };

  let triggerDecision = { eligible: false, reason: 'not_evaluated' };

  if (automation?.active === false || automation?.is_active === false) {
    triggerDecision = { eligible: false, reason: 'automation_inactive' };
  } else if (resolvedMode === EXECUTION_MODES.DISABLED) {
    triggerDecision = { eligible: false, reason: 'execution_mode_disabled' };
  } else if (guest?.pms_data_complete === false || metadata.pms_data_complete === false) {
    triggerDecision = { eligible: false, reason: 'skipped_missing_pms_data' };
  } else if (!recipientAvailable) {
    triggerDecision = { eligible: false, reason: 'skipped_missing_phone' };
  } else if (isOptedOut({ reservation, guest: guest || {} })) {
    triggerDecision = { eligible: false, reason: 'skipped_opt_out' };
  } else if (takeoverActive) {
    triggerDecision = { eligible: false, reason: 'skipped_human_takeover' };
  } else {
    triggerDecision = triggerDecisionForType({
      automationType: canonicalType,
      legacyType: resolvedLegacyType,
      reservation,
      guest: guest || {},
      conversation,
      metadata: safeContextMetadata,
      now: evaluatedAt
    });
  }

  const eligible = Boolean(triggerDecision.eligible);
  const operationalStatus = eligible
    ? resolvedMode === EXECUTION_MODES.APPROVAL_REQUIRED
      ? OPERATIONAL_STATUSES.AWAITING_APPROVAL
      : OPERATIONAL_STATUSES.PREVIEW
    : OPERATIONAL_STATUSES.SKIPPED;

  return {
    hotelId,
    reservationId,
    stayId,
    guestId,
    conversationId: conversation?.id || metadata.conversationId || null,
    automationType: canonicalType,
    legacyType: resolvedLegacyType,
    trigger: resolvedTrigger,
    triggerOccurrence,
    eligible,
    skipReason: eligible ? null : triggerDecision.reason,
    triggerReason: eligible ? triggerDecision.reason : null,
    executionMode: resolvedMode,
    requestedExecutionMode: requestedMode,
    operationalStatus,
    scheduledFor,
    evaluatedAt: evaluatedAt.toISOString(),
    timezone,
    recipientAvailable,
    takeoverActive,
    idempotencyKey,
    templateId,
    templateVersion: templateVersion || definition.ruleVersion,
    priority: definition.priority,
    certificationStatus: definition.certificationStatus,
    requiresRealPms: definition.requiresRealPms,
    canPreview: definition.canPreview,
    humanApprovalRequired: definition.humanApprovalRequired,
    duplicateBlocked: Boolean(triggerDecision.duplicateBlocked),
    sendable: false,
    runtimeVersion: AUTOMATION_RUNTIME_VERSION,
    metadata: {
      ...safeMetadata(metadata),
      source,
      category: definition.category,
      required_data: definition.requiredData,
      rule_version: definition.ruleVersion,
      certification_status: definition.certificationStatus,
      requested_execution_mode: requestedMode,
      execution_mode: resolvedMode,
      trigger_occurrence: triggerOccurrence,
      live_sending_disabled: true
    }
  };
};

export const applyAutomationDecisionOverride = (decision, {
  eligible = decision?.eligible,
  skipReason = null,
  triggerReason = null,
  operationalStatus = null,
  metadata = {}
} = {}) => {
  const nextEligible = Boolean(eligible);

  return {
    ...decision,
    eligible: nextEligible,
    skipReason: nextEligible ? null : skipReason || decision?.skipReason || 'blocked_by_domain_guard',
    triggerReason: nextEligible ? triggerReason || decision?.triggerReason : null,
    operationalStatus: operationalStatus || (nextEligible ? decision?.operationalStatus : OPERATIONAL_STATUSES.SKIPPED),
    sendable: false,
    metadata: {
      ...(decision?.metadata || {}),
      ...metadata,
      live_sending_disabled: true
    }
  };
};

const legacyTemplates = {
  pre_arrival_7d: ({ prefix, hotelName }) => `Hi ${prefix}we are looking forward to welcoming you to ${hotelName}. If you need transfer, parking or recommendations before arrival, we can help here.`,
  pre_arrival_1d: ({ prefix }) => `Hi ${prefix}your arrival is tomorrow. You can message us here for anything you need before you arrive.`,
  in_stay_upsell: ({ prefix }) => `Hi ${prefix}we hope you are enjoying your stay. If you need restaurant, spa or late checkout assistance, we can help here.`,
  post_stay_review: ({ prefix, hotelName }) => `Hi ${prefix}thank you for staying at ${hotelName}. We would love to hear your feedback about your stay.`,
  checkin: ({ prefix, hotelName }) => `${prefix}welcome to ${hotelName}. Our team is available here if you need anything around check-in.`,
  during_stay: ({ prefix }) => `${prefix}we hope you are enjoying your stay. Our team can help here with local recommendations or hotel services.`,
  checkout: ({ prefix }) => `${prefix}we hope you enjoyed your stay. Our reception team is here if you need any help before departure.`,
  post_checkout: ({ prefix }) => `${prefix}thank you for staying with us. We hope to welcome you again soon.`,
  welcome_message: ({ prefix, hotelName }) => `${prefix}welcome to ${hotelName}. If you need recommendations, transfers or anything during your stay, we are here to help.`,
  late_checkout_offer: ({ prefix }) => `${prefix}if you would like a more relaxed departure, we can check late checkout availability for your stay.`,
  spa_upsell: ({ prefix }) => `${prefix}if you would like to enjoy a moment of wellbeing during your stay, we can help check available spa, hammam or treatment options.`,
  experience_recommendation: ({ prefix }) => `${prefix}if you would like to discover local experiences or recommended activities, we will be happy to help you find the option that best suits you.`,
  restaurant_promotion: ({ prefix }) => `${prefix}if you would like to reserve a table for this evening or receive nearby dining recommendations, our team will be happy to help.`,
  transfer_offer: ({ prefix }) => `${prefix}if you need to arrange an airport transfer or any transportation during your stay, we will be happy to help.`,
  weather_trigger: ({ prefix }) => `${prefix}if the weather is not ideal, we can recommend indoor plans, spa options or calm local experiences.`,
  vip_followup: ({ prefix }) => `${prefix}as a preferred guest, we will be happy to help with special requests or personalised recommendations during your stay.`,
  birthday_message: ({ prefix }) => `${prefix}we noticed you are celebrating a special occasion. We can help arrange a thoughtful touch during your stay.`,
  abandoned_interest_followup: ({ prefix }) => `${prefix}if you are still interested, I can pick this back up and help confirm the details.`,
  post_stay_review_intelligence: ({ prefix }) => `${prefix}thank you for staying with us. We hope you enjoyed your stay. Your feedback helps us improve. Would you mind sharing your experience with us?`
};

export const buildRuntimeAutomationPreview = ({
  decision,
  hotel = {},
  reservation = {},
  guest = null,
  context = {}
} = {}) => {
  const definition = getAutomationDefinition(decision?.automationType);
  const templateType = decision?.legacyType
    || definition?.templateType
    || decision?.automationType;
  const hotelName = hotel?.name || 'the hotel';
  const firstName = String(reservation?.guest_name || guest?.name || '').split(' ')[0] || '';
  const prefix = firstName ? `${firstName}, ` : '';

  if (decision?.automationType === 'pre_checkout_folio' && context.folio?.outstandingBalance) {
    return `${prefix}this is a friendly reminder that your departure from ${hotelName} is scheduled soon. There is an estimated pending balance of ${context.folio.outstandingBalance} ${context.folio.currency || ''}. If you have any questions, our reception team will be happy to help.`;
  }

  const template = legacyTemplates[templateType] || legacyTemplates[decision?.automationType] || legacyTemplates.welcome_message;
  return template({ prefix, hotelName });
};
