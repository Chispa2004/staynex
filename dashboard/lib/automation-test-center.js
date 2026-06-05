import {
  DEFAULT_INTELLIGENT_AUTOMATIONS,
  buildAutomationPreview,
  mergeAutomationDefaults,
  scheduledForAutomation
} from './automation-engine.js';

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
  guest_missing_pms_data: 'Guest with missing PMS data'
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
      metadata: { tags: ['VIP', 'suite'], notes: 'VIP guest' }
    },
    guest_interested_experiences: {
      status: 'checked_in',
      interests: ['experiences', 'excursion', 'agafay'],
      metadata: { last_intent: 'experience excursion agafay', interests: ['experiences', 'excursion'] }
    },
    guest_interested_spa: {
      status: 'checked_in',
      interests: ['spa', 'wellness', 'hammam'],
      metadata: { last_intent: 'spa wellness hammam', interests: ['spa', 'wellness'] }
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

const buildInternalReasoning = ({ automation, scenario, decision }) => {
  const { simulatedGuest } = scenario;

  if (automation.type === 'post_stay_review_intelligence') {
    return {
      classification: simulatedGuest.sentiment === 'negative' ? 'negative_stay' : 'positive_stay',
      review_strategy: simulatedGuest.sentiment === 'negative' ? 'alert_quality_team' : 'request_public_review',
      review_risk_score: simulatedGuest.metadata?.review_risk_score || 0,
      quality_alert: simulatedGuest.sentiment === 'negative',
      public_review_allowed: simulatedGuest.sentiment !== 'negative',
      trigger_reason: decision.reason
    };
  }

  return {
    classification: 'automation_preview',
    trigger_reason: decision.reason,
    safe_preview: true,
    live_guest_send_blocked: true
  };
};

const evaluateType = ({ automation, guest, now }) => {
  const type = automation.type;

  if (automation.active === false || automation.is_active === false) {
    return { eligible: false, reason: 'automation_inactive' };
  }

  if (!guest.pms_data_complete) {
    return { eligible: false, reason: 'skipped_missing_pms_data' };
  }

  if (!guest.phone_number) {
    return { eligible: false, reason: 'skipped_missing_phone' };
  }

  if (guest.opt_out) {
    return { eligible: false, reason: 'skipped_opt_out' };
  }

  if (guest.human_takeover) {
    return { eligible: false, reason: 'skipped_human_takeover' };
  }

  if (type === 'welcome_message') {
    return ['checked_in', 'in_house'].includes(guest.status)
      ? { eligible: true, reason: 'guest_checked_in' }
      : { eligible: false, reason: 'not_checked_in' };
  }

  if (type === 'late_checkout_offer') {
    return isDepartureWithin24h(guest, now)
      ? { eligible: true, reason: 'departure_within_24h' }
      : { eligible: false, reason: 'not_departing_tomorrow' };
  }

  if (type === 'pre_checkout_folio_reminder') {
    if (!isDepartureWithin24h(guest, now)) {
      return { eligible: false, reason: 'not_departing_tomorrow' };
    }

    if (!guest.folio_complete || !guest.folio?.available) {
      return { eligible: false, reason: 'skipped_incomplete_folio' };
    }

    if (Number(guest.balance_due || guest.folio?.outstandingBalance || 0) <= 0) {
      return { eligible: false, reason: 'no_outstanding_balance' };
    }

    return { eligible: true, reason: 'departure_tomorrow_with_balance' };
  }

  if (type === 'post_stay_review_intelligence') {
    if (!isCheckout24hAgo(guest, now)) {
      return { eligible: false, reason: 'not_checked_out_24h_ago' };
    }

    return {
      eligible: true,
      reason: guest.sentiment === 'negative' ? 'negative_stay_quality_alert' : 'post_checkout_24h_review'
    };
  }

  if (type === 'spa_upsell') {
    return hasInterest(guest, ['spa', 'wellness', 'hammam', 'massage'])
      ? { eligible: true, reason: 'spa_interest_detected' }
      : { eligible: false, reason: 'no_spa_interest' };
  }

  if (type === 'experience_recommendation') {
    return hasInterest(guest, ['experience', 'excursion', 'tour', 'agafay', 'actividad'])
      ? { eligible: true, reason: 'experience_interest_detected' }
      : { eligible: false, reason: 'no_experience_interest' };
  }

  if (type === 'transfer_offer') {
    return hasInterest(guest, ['transfer', 'airport']) || guest.arrival_date === dateOnly(addDays(now, 1))
      ? { eligible: true, reason: 'arrival_or_transfer_need' }
      : { eligible: false, reason: 'no_transfer_need' };
  }

  if (type === 'restaurant_promotion') {
    return ['checked_in', 'in_house'].includes(guest.status)
      ? { eligible: true, reason: 'in_house_guest' }
      : { eligible: false, reason: 'not_in_house' };
  }

  if (type === 'vip_followup') {
    return hasInterest(guest, ['vip', 'suite', 'premium']) || /suite|vip/i.test(guest.room_type || '')
      ? { eligible: true, reason: 'vip_guest_detected' }
      : { eligible: false, reason: 'not_vip' };
  }

  if (type === 'birthday_message') {
    return guest.birthday_today || hasInterest(guest, ['birthday', 'cumple', 'celebration'])
      ? { eligible: true, reason: 'birthday_or_celebration' }
      : { eligible: false, reason: 'no_birthday_signal' };
  }

  if (type === 'abandoned_interest_followup') {
    return hasInterest(guest, ['interested', 'details', 'availability', 'experience', 'spa'])
      ? { eligible: true, reason: 'abandoned_interest_signal' }
      : { eligible: false, reason: 'no_abandoned_interest' };
  }

  if (type === 'weather_trigger') {
    return { eligible: false, reason: 'weather_signal_not_simulated' };
  }

  return { eligible: false, reason: 'scenario_not_matching_trigger' };
};

const buildPreview = ({ automation, scenario, decision }) => {
  const { hotel, reservation, simulatedGuest } = scenario;
  const message = automation.type === 'pre_checkout_folio_reminder'
    ? `${simulatedGuest.name}, tomorrow is your scheduled check-out at ${hotel.name}. According to the current room information, there is an estimated pending balance of ${simulatedGuest.folio?.outstandingBalance || simulatedGuest.balance_due} ${simulatedGuest.currency}. Reception can help if you have any questions.`
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
    status: 'preview_generated',
    scheduled_for: scheduledFor,
    message_body: message,
    message_preview: message,
    guest_message_preview: message,
    internal_reasoning: buildInternalReasoning({ automation, scenario, decision }),
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
      internal_reasoning: buildInternalReasoning({ automation, scenario, decision })
    }
  };
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
  const safety = {
    testMode: true,
    dryRun: dryRun !== false,
    safePreview: true,
    noGuestMessages: true,
    liveSendingBlocked: true,
    sendAutomationsEnabled: process.env.SEND_AUTOMATIONS === 'true',
    automationTestSendEnabled: AUTOMATION_TEST_SEND_ENABLED,
    testWhatsappNumberConfigured: Boolean(TEST_WHATSAPP_NUMBER),
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

  for (const automation of mergedAutomations) {
    const decision = evaluateType({
      automation,
      guest: scenario.simulatedGuest,
      now
    });
    const baseLog = {
      automation_type: automation.type,
      scenario_id: scenario.id,
      hotelId: scenario.hotel.id,
      guest_id: scenario.simulatedGuest.id,
      reservation_id: scenario.reservation.id,
      scheduled_for: null,
      status: decision.eligible ? 'preview_generated' : decision.reason,
      reason: decision.reason,
      message_preview: null,
      created_at: new Date().toISOString(),
      metadata: {
        test_mode: true,
        dry_run: true
      }
    };

    if (!decision.eligible) {
      skippedAutomations.push({
        type: automation.type,
        name: automation.name,
        status: decision.reason,
        reason: decision.reason
      });
      logs.push(baseLog);
      continue;
    }

    const preview = buildPreview({
      automation,
      scenario,
      decision
    });

    eligibleAutomations.push({
      type: automation.type,
      name: automation.name,
      trigger_reason: decision.reason,
      scheduled_for: preview.scheduled_for
    });
    previews.push(preview);
    logs.push({
      ...baseLog,
      scheduled_for: preview.scheduled_for,
      message_preview: preview.message_preview
    });
  }

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
    safety,
    sendResult
  };
};
