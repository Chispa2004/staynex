import {
  DEFAULT_INTELLIGENT_AUTOMATIONS,
  buildAutomationPreview,
  mergeAutomationDefaults,
  scheduledForAutomation
} from './automation-engine.js';
import {
  AUTOMATION_RUNTIME_VERSION,
  getAutomationDefinition
} from './automation-catalog.js';
import { evaluateAutomationDecision } from './automation-runtime.js';

export const AUTOMATION_TEST_CENTER_ENABLED = process.env.AUTOMATION_TEST_CENTER_ENABLED !== 'false';
export const AUTOMATION_TEST_SEND_ENABLED = process.env.AUTOMATION_TEST_SEND_ENABLED === 'true';
export const TEST_WHATSAPP_NUMBER = process.env.TEST_WHATSAPP_NUMBER || '';

const DAY_MS = 24 * 60 * 60 * 1000;

const scenarioNames = {
  arriving_tomorrow: 'Arriving tomorrow',
  checked_in_guest: 'Checked-in guest',
  departing_tomorrow_with_balance: 'Departing tomorrow with balance',
  checked_out_24h_positive: 'Checked-out 24h ago positive stay',
  checked_out_24h_negative: 'Checked-out 24h ago negative stay',
  vip_guest_in_house: 'VIP guest in-house',
  guest_interested_experiences: 'Guest interested in experiences',
  guest_interested_spa: 'Guest interested in spa',
  guest_requested_transfer: 'Guest requested transfer',
  birthday_guest: 'Birthday guest',
  guest_missing_phone: 'Guest with missing phone',
  guest_opt_out: 'Guest with opt-out',
  human_takeover_active: 'Human takeover active',
  guest_incomplete_folio: 'Guest with incomplete folio',
  guest_missing_pms_data: 'Guest with missing PMS data',
  high_automation_density: 'High automation density',
  revenue_followup_spa: 'Revenue follow-up: spa interest',
  revenue_followup_experience: 'Revenue follow-up: experience interest',
  revenue_followup_transfer: 'Revenue follow-up: transfer request'
};

export const AUTOMATION_TEST_SCENARIOS = Object.entries(scenarioNames).map(([id, name]) => ({
  id,
  name,
  description: 'Safe dry-run guest and reservation scenario for automation preview testing.'
}));

export const SIMULATED_NOW_OPTIONS = [
  { id: 'now', label: 'now' },
  { id: 'checkout_plus_24h', label: '24h after checkout' },
  { id: 'checkout_minus_24h', label: '24h before checkout' },
  { id: 'tomorrow_arrival', label: 'tomorrow arrival' },
  { id: 'custom', label: 'custom datetime' }
];

const iso = (date) => date.toISOString();
const dateOnly = (date) => iso(date).slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const PRIORITY_WEIGHT = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

const priorityForAutomation = ({ automation, scenario }) => {
  if (
    automation.type === 'post_stay_review_intelligence'
    && scenario?.simulatedGuest?.sentiment === 'negative'
  ) {
    return 'CRITICAL';
  }

  return getAutomationDefinition(automation.type)?.priority || automation.priority || 'LOW';
};

const hasWelcomeAlreadyDelivered = (guest = {}, reservation = {}) => (
  Boolean(guest.welcome_sent_for_stay)
  || Boolean(reservation.welcome_sent_for_stay)
  || Boolean(guest.metadata?.welcome_sent_for_stay)
  || Boolean(reservation.metadata?.welcome_sent_for_stay)
);

const normalizeNow = ({ simulatedNow, scenarioId, customNow }) => {
  const base = customNow || simulatedNow;

  if (base && !['now', 'checkout_plus_24h', 'checkout_minus_24h', 'tomorrow_arrival', 'custom'].includes(base)) {
    const parsed = new Date(base);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const now = new Date();

  if (simulatedNow === 'checkout_plus_24h' || scenarioId === 'checked_out_24h_positive' || scenarioId === 'checked_out_24h_negative') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  }

  return now;
};

export const getAutomationTestCenterConfig = () => ({
  enabled: AUTOMATION_TEST_CENTER_ENABLED,
  safeMode: true,
  dryRunDefault: true,
  liveGuestMessagesBlocked: true,
  sendEnabled: AUTOMATION_TEST_SEND_ENABLED,
  testNumberConfigured: Boolean(TEST_WHATSAPP_NUMBER),
  sendAutomations: process.env.SEND_AUTOMATIONS === 'true',
  runtimeVersion: AUTOMATION_RUNTIME_VERSION,
  ubikosTouched: false,
  pmsTouched: false
});

const buildBaseGuest = ({ hotel, now, scenarioId }) => {
  const arrival = addDays(now, 1);
  const departure = addDays(now, 3);
  const checkedOutDeparture = addDays(now, -1);

  const base = {
    id: `test-guest-${scenarioId}`,
    hotel_id: hotel.id,
    name: 'Jose Test',
    phone: '+34999999999',
    phone_number: '+34999999999',
    room: '302',
    current_room: '302',
    language: hotel.default_language || 'ES',
    preferred_language: hotel.default_language || 'es',
    reservationId: `TEST-${hotel.id}-302`,
    reservation_id: `test-reservation-${scenarioId}`,
    pms_reservation_id: `TEST-${hotel.id}-302`,
    checkIn: dateOnly(arrival),
    checkOut: dateOnly(departure),
    arrival_date: dateOnly(arrival),
    departure_date: dateOnly(departure),
    status: 'confirmed',
    balance_due: 0,
    currency: 'EUR',
    sentiment: 'neutral',
    tickets: [],
    human_takeover: false,
    opt_out: false,
    interests: [],
    birthday_today: false,
    pms_data_complete: true,
    folio_complete: true,
    folio: {
      available: true,
      currency: 'EUR',
      lineItems: [],
      totalCharges: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      warnings: []
    },
    metadata: {
      source: 'automation_test_center',
      test_mode: true,
      scenario_id: scenarioId,
      hotel_name: hotel.name
    }
  };

  const scenarioPatch = {
    arriving_tomorrow: {
      status: 'confirmed',
      interests: ['transfer'],
      metadata: { last_intent: 'arrival transfer', interests: ['transfer'] }
    },
    checked_in_guest: {
      status: 'checked_in',
      checkIn: dateOnly(addDays(now, -1)),
      arrival_date: dateOnly(addDays(now, -1)),
      checkOut: dateOnly(addDays(now, 2)),
      departure_date: dateOnly(addDays(now, 2))
    },
    departing_tomorrow_with_balance: {
      status: 'checked_in',
      checkIn: dateOnly(addDays(now, -2)),
      arrival_date: dateOnly(addDays(now, -2)),
      checkOut: dateOnly(addDays(now, 1)),
      departure_date: dateOnly(addDays(now, 1)),
      balance_due: 132,
      folio: {
        available: true,
        currency: 'EUR',
        lineItems: [
          { description: 'Spa treatment', amount: 80 },
          { description: 'Restaurant', amount: 52 }
        ],
        totalCharges: 132,
        totalPaid: 0,
        outstandingBalance: 132,
        warnings: []
      }
    },
    checked_out_24h_positive: {
      status: 'checked_out',
      checkIn: dateOnly(addDays(now, -4)),
      arrival_date: dateOnly(addDays(now, -4)),
      checkOut: dateOnly(checkedOutDeparture),
      departure_date: dateOnly(checkedOutDeparture),
      sentiment: 'positive',
      metadata: { stay_sentiment: 'positive', google_review_link: 'https://reviews.example.com/staynex' }
    },
    checked_out_24h_negative: {
      status: 'checked_out',
      checkIn: dateOnly(addDays(now, -4)),
      arrival_date: dateOnly(addDays(now, -4)),
      checkOut: dateOnly(checkedOutDeparture),
      departure_date: dateOnly(checkedOutDeparture),
      sentiment: 'negative',
      tickets: [{ id: 'test-ticket-maintenance', category: 'maintenance', priority: 'urgent', status: 'open' }],
      metadata: { stay_sentiment: 'negative', review_risk_score: 88 }
    },
    vip_guest_in_house: {
      status: 'checked_in',
      room: '801',
      current_room: '801',
      room_type: 'Presidential Suite',
      welcome_sent_for_stay: true,
      metadata: { tags: ['VIP', 'suite'], notes: 'VIP guest', welcome_sent_for_stay: true }
    },
    guest_interested_experiences: {
      status: 'checked_in',
      interests: ['experiences', 'excursion', 'agafay'],
      welcome_sent_for_stay: true,
      metadata: { last_intent: 'experience excursion agafay', interests: ['experiences', 'excursion'], welcome_sent_for_stay: true }
    },
    guest_interested_spa: {
      status: 'checked_in',
      interests: ['spa', 'wellness', 'hammam'],
      welcome_sent_for_stay: true,
      metadata: { last_intent: 'spa wellness hammam', interests: ['spa', 'wellness'], welcome_sent_for_stay: true }
    },
    guest_requested_transfer: {
      status: 'confirmed',
      interests: ['transfer'],
      metadata: { last_intent: 'airport transfer arrival', interests: ['transfer'] }
    },
    birthday_guest: {
      status: 'checked_in',
      birthday_today: true,
      metadata: { last_intent: 'birthday celebration', tags: ['birthday'] }
    },
    guest_missing_phone: {
      phone: '',
      phone_number: '',
      guest_phone: ''
    },
    guest_opt_out: {
      opt_out: true,
      metadata: { opt_out: true }
    },
    human_takeover_active: {
      human_takeover: true,
      conversationState: { conversation_ai_mode: 'human_takeover' }
    },
    guest_incomplete_folio: {
      status: 'checked_in',
      checkIn: dateOnly(addDays(now, -2)),
      arrival_date: dateOnly(addDays(now, -2)),
      checkOut: dateOnly(addDays(now, 1)),
      departure_date: dateOnly(addDays(now, 1)),
      balance_due: 132,
      folio_complete: false,
      folio: {
        available: false,
        currency: 'EUR',
        lineItems: [],
        totalCharges: null,
        totalPaid: null,
        outstandingBalance: null,
        warnings: ['folio_incomplete']
      }
    },
    guest_missing_pms_data: {
      pms_data_complete: false,
      reservationId: null,
      pms_reservation_id: null,
      arrival_date: null,
      departure_date: null,
      checkIn: null,
      checkOut: null
    },
    high_automation_density: {
      status: 'checked_in',
      checkIn: dateOnly(addDays(now, -1)),
      arrival_date: dateOnly(addDays(now, -1)),
      checkOut: dateOnly(addDays(now, 1)),
      departure_date: dateOnly(addDays(now, 1)),
      room: '901',
      current_room: '901',
      room_type: 'Premium Suite',
      birthday_today: true,
      interests: ['vip', 'suite', 'premium', 'spa', 'wellness', 'hammam', 'experience', 'excursion', 'agafay', 'transfer', 'airport', 'restaurant', 'birthday'],
      balance_due: 118,
      welcome_sent_for_stay: true,
      folio: {
        available: true,
        currency: 'EUR',
        lineItems: [
          { description: 'Spa', amount: 70 },
          { description: 'Restaurant', amount: 48 }
        ],
        totalCharges: 118,
        totalPaid: 0,
        outstandingBalance: 118,
        warnings: []
      },
      metadata: {
        last_intent: 'vip premium spa wellness experience excursion agafay transfer airport restaurant birthday interested availability',
        tags: ['VIP', 'suite', 'birthday'],
        interests: ['spa', 'experiences', 'transfer', 'restaurant'],
        welcome_sent_for_stay: true
      }
    },
    revenue_followup_spa: {
      status: 'checked_in',
      interests: ['spa', 'wellness'],
      welcome_sent_for_stay: true,
      metadata: {
        last_guest_message: 'Si, me interesa el spa',
        last_intent: 'spa_interest',
        interests: ['spa', 'wellness'],
        welcome_sent_for_stay: true
      }
    },
    revenue_followup_experience: {
      status: 'checked_in',
      interests: ['experience', 'excursion', 'essaouira'],
      welcome_sent_for_stay: true,
      metadata: {
        last_guest_message: 'Quiero informacion de la excursion',
        last_intent: 'experience_interest',
        interests: ['experience', 'excursion'],
        welcome_sent_for_stay: true
      }
    },
    revenue_followup_transfer: {
      status: 'confirmed',
      interests: ['transfer', 'airport'],
      welcome_sent_for_stay: true,
      metadata: {
        last_guest_message: 'Reservadme el transfer',
        last_intent: 'airport_transfer_interest',
        interests: ['transfer', 'airport'],
        welcome_sent_for_stay: true
      }
    }
  }[scenarioId] || {};

  return {
    ...base,
    ...scenarioPatch,
    metadata: {
      ...base.metadata,
      ...(scenarioPatch.metadata || {})
    }
  };
};

export const buildAutomationTestScenario = ({ scenarioId = 'arriving_tomorrow', hotel, simulatedNow, customNow }) => {
  const safeHotel = {
    id: hotel?.id || 'test-hotel',
    name: hotel?.name || 'Current hotel',
    default_language: hotel?.default_language || 'es',
    timezone: hotel?.timezone || 'Europe/Madrid',
    metadata: hotel?.metadata || {}
  };
  const now = normalizeNow({ simulatedNow, scenarioId, customNow });
  const guest = buildBaseGuest({ hotel: safeHotel, now, scenarioId });
  const reservation = {
    id: guest.reservation_id,
    hotel_id: safeHotel.id,
    guest_id: guest.id,
    guest_name: guest.name,
    guest_phone: guest.phone,
    pms_reservation_id: guest.pms_reservation_id,
    arrival_date: guest.arrival_date,
    departure_date: guest.departure_date,
    status: guest.status,
    room_type: guest.room_type || 'Deluxe Room',
    guest_notes: Array.isArray(guest.interests) ? guest.interests.join(' ') : '',
    metadata: guest.metadata
  };

  return {
    id: scenarioId,
    name: scenarioNames[scenarioId] || scenarioNames.arriving_tomorrow,
    simulatedNow: iso(now),
    hotel: safeHotel,
    simulatedGuest: guest,
    reservation
  };
};

const hasInterest = (guest, words = []) => {
  const haystack = [
    ...(guest.interests || []),
    guest.metadata?.last_intent,
    guest.guest_notes,
    guest.metadata?.tags,
    guest.metadata?.notes
  ].filter(Boolean).join(' ').toLowerCase();

  return words.some((word) => haystack.includes(word));
};

const isDepartureWithin24h = (guest, now) => {
  if (!guest.departure_date) return false;
  const departure = new Date(`${guest.departure_date}T12:00:00.000Z`);
  const diff = departure.getTime() - now.getTime();
  return diff > 0 && diff <= 36 * 60 * 60 * 1000;
};

const isCheckout24hAgo = (guest, now) => {
  if (!guest.departure_date) return false;
  const departure = new Date(`${guest.departure_date}T12:00:00.000Z`);
  const diff = now.getTime() - departure.getTime();
  return diff >= 18 * 60 * 60 * 1000 && diff <= 36 * 60 * 60 * 1000;
};

const buildPostStayGuestPreview = ({ hotel, simulatedGuest }) => {
  const prefix = simulatedGuest.name ? `${String(simulatedGuest.name).split(' ')[0]}, ` : '';
  const reviewLink = simulatedGuest.metadata?.google_review_link || hotel.metadata?.google_review_link || hotel.metadata?.review_link || null;

  if (simulatedGuest.sentiment === 'negative') {
    return `${prefix}gracias por alojarte con nosotros. Nos gustaria conocer como fue tu experiencia para seguir mejorando nuestro servicio. Podrias compartir cualquier comentario o sugerencia que consideres importante?`;
  }

  const linkCopy = reviewLink ? `\n\n${reviewLink}` : '';
  return `${prefix}gracias por alojarte con nosotros. Esperamos que hayas disfrutado de tu estancia en ${hotel.name}. Tu opinion nos ayuda a seguir mejorando. Podrias dedicar unos segundos a valorar tu experiencia?${linkCopy}`;
};

const buildInternalReasoning = ({ automation, scenario, decision, priority }) => {
  const { simulatedGuest } = scenario;

  if (automation.type === 'post_stay_review_intelligence') {
    return {
      classification: simulatedGuest.sentiment === 'negative' ? 'negative_stay' : 'positive_stay',
      review_strategy: simulatedGuest.sentiment === 'negative' ? 'alert_quality_team' : 'request_public_review',
      review_risk_score: simulatedGuest.metadata?.review_risk_score || 0,
      quality_alert: simulatedGuest.sentiment === 'negative',
      public_review_allowed: simulatedGuest.sentiment !== 'negative',
      priority,
      trigger_reason: decision.reason
    };
  }

  return {
    classification: 'automation_preview',
    priority,
    trigger_reason: decision.reason,
    safe_preview: true,
    live_guest_send_blocked: true
  };
};

const evaluateType = ({ automation, scenario, now }) => {
  const runtimeDecision = evaluateAutomationDecision({
    hotel: scenario.hotel,
    reservation: scenario.reservation,
    guest: scenario.simulatedGuest,
    conversationState: scenario.simulatedGuest.conversationState || null,
    automation,
    automationType: automation.type,
    legacyType: automation.type,
    executionMode: 'preview',
    now,
    metadata: {
      source: 'automation_test_center',
      test_mode: true,
      scenario_id: scenario.id,
      folio: scenario.simulatedGuest.folio,
      pms_data_complete: scenario.simulatedGuest.pms_data_complete
    },
    source: 'automation_test_center'
  });

  return {
    eligible: runtimeDecision.eligible,
    reason: runtimeDecision.skipReason || runtimeDecision.triggerReason,
    duplicateBlocked: runtimeDecision.duplicateBlocked,
    runtimeDecision
  };
};

const buildPreview = ({ automation, scenario, decision, priority }) => {
  const { hotel, reservation, simulatedGuest } = scenario;
  const internalReasoning = buildInternalReasoning({ automation, scenario, decision, priority });
  const message = automation.type === 'pre_checkout_folio_reminder'
    ? `${simulatedGuest.name}, te recordamos que manana esta prevista tu salida de ${hotel.name}. Actualmente existe un saldo pendiente estimado de ${simulatedGuest.folio?.outstandingBalance || simulatedGuest.balance_due} ${simulatedGuest.currency} asociado a tu estancia. Si tienes cualquier duda, nuestro equipo de recepcion estara encantado de ayudarte.`
    : automation.type === 'post_stay_review_intelligence'
      ? buildPostStayGuestPreview({ hotel, simulatedGuest })
      : buildAutomationPreview({
        automationType: automation.type,
        hotel,
        reservation,
        language: simulatedGuest.preferred_language || hotel.default_language || 'es'
      });
  const scheduledFor = scheduledForAutomation({
    automationType: automation.type,
    reservation
  }) || scenario.simulatedNow;

  return {
    id: `preview-${automation.type}-${scenario.id}`,
    automation_type: automation.type,
    automation_name: automation.name,
    priority,
    status: 'preview_generated',
    scheduled_for: scheduledFor,
    message_body: message,
    message_preview: message,
    guest_message_preview: message,
    internal_reasoning: internalReasoning,
    guest_id: simulatedGuest.id,
    reservation_id: reservation.id,
    room: simulatedGuest.room,
    trigger_reason: decision.reason,
    safety_blocks: [
      'blocked_live_send',
      'dry_run_enabled',
      'test_mode_no_guest_messages'
    ],
    metadata: {
      test_mode: true,
      scenario_id: scenario.id,
      hotel_id: hotel.id,
      priority,
      runtime_version: decision.runtimeDecision?.runtimeVersion || AUTOMATION_RUNTIME_VERSION,
      canonical_automation_type: decision.runtimeDecision?.automationType || automation.type,
      idempotency_key: decision.runtimeDecision?.idempotencyKey || null,
      internal_reasoning: internalReasoning
    }
  };
};

const buildRevenueFollowUpDryRun = ({ scenario }) => {
  const scenarioId = scenario.id;

  if (scenarioId === 'revenue_followup_spa') {
    return {
      active: true,
      dry_run: true,
      guest_message: scenario.simulatedGuest.metadata?.last_guest_message,
      detected_intent: 'spa_interest',
      next_message: 'Por supuesto. Puedo ayudarte a consultar disponibilidad de spa. Para avanzar, dime si lo prefieres hoy o manana y cuantas personas sois.',
      provider_handoff: 'not_required',
      reservation_request: 'awaiting_guest_details',
      confirmation_request: 'pending_guest_date_time',
      pmsTouched: false,
      ubikosTouched: false
    };
  }

  if (scenarioId === 'revenue_followup_experience') {
    return {
      active: true,
      dry_run: true,
      guest_message: scenario.simulatedGuest.metadata?.last_guest_message,
      detected_intent: 'experience_interest',
      next_message: 'Te ayudo. Para enviar la solicitud al proveedor, necesito la experiencia, la fecha deseada y el numero de personas.',
      provider_handoff: 'provider_request_preview',
      reservation_request: 'awaiting_guest_details',
      confirmation_request: 'ask_guest_before_provider_email',
      pmsTouched: false,
      ubikosTouched: false
    };
  }

  if (scenarioId === 'revenue_followup_transfer') {
    return {
      active: true,
      dry_run: true,
      guest_message: scenario.simulatedGuest.metadata?.last_guest_message,
      detected_intent: 'airport_transfer_interest',
      next_message: 'Claro. Para preparar la solicitud de transfer, dime el numero de vuelo u hora de llegada y cuantas personas sois.',
      provider_handoff: 'transfer_request_preview',
      reservation_request: 'awaiting_flight_time_and_passengers',
      confirmation_request: 'ask_guest_before_provider_or_driver_request',
      pmsTouched: false,
      ubikosTouched: false
    };
  }

  return null;
};

export const runAutomationTestCenter = ({
  scenarioId,
  hotel,
  simulatedNow = 'now',
  customNow,
  automations = DEFAULT_INTELLIGENT_AUTOMATIONS,
  dryRun = true,
  sendTest = false
}) => {
  const scenario = buildAutomationTestScenario({
    scenarioId,
    hotel,
    simulatedNow,
    customNow
  });
  const now = new Date(scenario.simulatedNow);
  const mergedAutomations = mergeAutomationDefaults(automations);
  const eligibleAutomations = [];
  const skippedAutomations = [];
  const previews = [];
  const logs = [];
  const candidates = [];
  const automationHealth = {
    generated: 0,
    suppressed: 0,
    duplicatesBlocked: 0,
    fatigueBlocked: 0,
    cooldownBlocked: 0,
    prioritySuppressed: 0,
    messagesGenerated: 0,
    messagesSuppressed: 0,
    fatigueGuardDecisions: []
  };
  const safety = {
    testMode: true,
    dryRun: dryRun !== false,
    safePreview: true,
    noGuestMessages: true,
    liveSendingBlocked: true,
    sendAutomationsEnabled: process.env.SEND_AUTOMATIONS === 'true',
    automationTestSendEnabled: AUTOMATION_TEST_SEND_ENABLED,
    testWhatsappNumberConfigured: Boolean(TEST_WHATSAPP_NUMBER),
    runtimeVersion: AUTOMATION_RUNTIME_VERSION,
    pmsTouched: false,
    ubikosTouched: false,
    sendTarget: sendTest && AUTOMATION_TEST_SEND_ENABLED && TEST_WHATSAPP_NUMBER ? TEST_WHATSAPP_NUMBER : null,
    blockedReasons: []
  };

  if (!AUTOMATION_TEST_CENTER_ENABLED) {
    safety.blockedReasons.push('automation_test_center_disabled');
  }

  if (sendTest && !AUTOMATION_TEST_SEND_ENABLED) {
    safety.blockedReasons.push('automation_test_send_disabled');
  }

  if (sendTest && AUTOMATION_TEST_SEND_ENABLED && !TEST_WHATSAPP_NUMBER) {
    safety.blockedReasons.push('missing_test_whatsapp_number');
  }

  mergedAutomations.forEach((automation, index) => {
    const decision = evaluateType({
      automation,
      scenario,
      now
    });
    const priority = priorityForAutomation({ automation, scenario });
    const baseLog = {
      automation_type: automation.type,
      scenario_id: scenario.id,
      hotelId: scenario.hotel.id,
      guest_id: scenario.simulatedGuest.id,
      reservation_id: scenario.reservation.id,
      scheduled_for: null,
      status: decision.eligible ? 'preview_generated' : decision.reason,
      reason: decision.reason,
      priority,
      message_preview: null,
      created_at: new Date().toISOString(),
      metadata: {
        test_mode: true,
        dry_run: true,
        priority,
        runtime_version: decision.runtimeDecision?.runtimeVersion || AUTOMATION_RUNTIME_VERSION,
        canonical_automation_type: decision.runtimeDecision?.automationType || automation.type,
        idempotency_key: decision.runtimeDecision?.idempotencyKey || null,
        execution_mode: decision.runtimeDecision?.executionMode || 'preview'
      }
    };

    if (!decision.eligible) {
      if (decision.duplicateBlocked) {
        automationHealth.duplicatesBlocked += 1;
      }

      skippedAutomations.push({
        type: automation.type,
        name: automation.name,
        status: decision.reason,
        reason: decision.reason,
        priority,
        duplicate_blocked: Boolean(decision.duplicateBlocked)
      });
      logs.push(baseLog);
      return;
    }

    candidates.push({
      automation,
      decision,
      priority,
      baseLog,
      index
    });
  });

  const sortedCandidates = candidates.sort((left, right) => {
    const priorityDiff = (PRIORITY_WEIGHT[right.priority] || 0) - (PRIORITY_WEIGHT[left.priority] || 0);
    return priorityDiff || left.index - right.index;
  });
  const fatigueLimit = scenario.id === 'high_automation_density' ? 3 : 5;

  for (const candidate of sortedCandidates) {
    const { automation, decision, priority, baseLog } = candidate;
    const overFatigueLimit = previews.length >= fatigueLimit && priority !== 'CRITICAL';

    if (overFatigueLimit) {
      const suppressed = {
        type: automation.type,
        name: automation.name,
        status: 'fatigue_guard_suppressed',
        reason: 'fatigue_guard_suppressed',
        priority,
        priority_suppressed: true
      };

      automationHealth.suppressed += 1;
      automationHealth.fatigueBlocked += 1;
      automationHealth.prioritySuppressed += 1;
      automationHealth.messagesSuppressed += 1;
      automationHealth.fatigueGuardDecisions.push({
        automation_type: automation.type,
        priority,
        decision: 'suppressed',
        reason: 'fatigue_guard_suppressed'
      });
      skippedAutomations.push(suppressed);
      logs.push({
        ...baseLog,
        status: 'fatigue_guard_suppressed',
        reason: 'fatigue_guard_suppressed'
      });
      continue;
    }

    const preview = buildPreview({
      automation,
      scenario,
      decision,
      priority
    });

    eligibleAutomations.push({
      type: automation.type,
      name: automation.name,
        priority,
        trigger_reason: decision.reason,
        scheduled_for: preview.scheduled_for,
        canonical_type: decision.runtimeDecision?.automationType || automation.type,
        idempotency_key: decision.runtimeDecision?.idempotencyKey || null
      });
    previews.push(preview);
    automationHealth.generated += 1;
    automationHealth.messagesGenerated += 1;
    automationHealth.fatigueGuardDecisions.push({
      automation_type: automation.type,
      priority,
      decision: 'generated',
      reason: decision.reason
    });
    logs.push({
      ...baseLog,
      scheduled_for: preview.scheduled_for,
      message_preview: preview.message_preview
    });
  }

  automationHealth.cooldownBlocked = skippedAutomations.filter((item) => (
    item.reason === 'cooldown_active' || item.reason === 'max_per_guest_reached'
  )).length;
  automationHealth.suppressed = skippedAutomations.filter((item) => (
    item.reason === 'fatigue_guard_suppressed'
    || item.reason === 'cooldown_active'
    || item.reason === 'max_per_guest_reached'
    || item.reason === 'welcome_already_delivered'
  )).length;
  automationHealth.messagesSuppressed = automationHealth.suppressed;

  const sendResult = sendTest
    ? {
      requested: true,
      status: safety.sendTarget ? 'sent_test' : 'failed_test_send',
      target: safety.sendTarget,
      warning: safety.sendTarget
        ? 'Simulated internal test send only. No guest phone was used.'
        : 'Internal test sending is disabled or TEST_WHATSAPP_NUMBER is missing.'
    }
    : {
      requested: false,
      status: 'preview_only'
    };

  return {
    scenario: {
      id: scenario.id,
      name: scenario.name,
      simulatedNow: scenario.simulatedNow
    },
    simulatedGuest: scenario.simulatedGuest,
    reservation: scenario.reservation,
    eligibleAutomations,
    skippedAutomations,
    previews,
    logs,
    automationHealth,
    revenueFollowUp: buildRevenueFollowUpDryRun({ scenario }),
    safety,
    sendResult
  };
};
