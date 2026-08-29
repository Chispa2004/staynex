export const PILOT_JOURNEY_STATUSES = Object.freeze({
  CERTIFIED_FOR_PREVIEW: 'CERTIFIED FOR PREVIEW',
  BLOCKED: 'BLOCKED',
  REQUIRED_BEFORE_LIVE_SEND: 'REQUIRED BEFORE LIVE SEND'
});

export const PILOT_LIVE_SEND_BLOCKERS = Object.freeze([
  'SEND_AUTOMATIONS=true controlled rollout',
  'Quiet Hours/send-time policy',
  'Outbound atomic claim/double-send safety',
  'Real WhatsApp hotel',
  'Real/current PMS reservation data',
  'Kill Switch',
  'Human Fallback',
  'Monitoring and failure rehearsal'
]);

export const PILOT_JOURNEY_CERTIFICATION = Object.freeze([
  {
    id: 'welcome',
    journey: 'WELCOME',
    automationTypes: ['welcome'],
    supportingTriggers: ['welcome_message'],
    temporalAnchor: 'arrival',
    eligibility: 'Arriving today or checked-in guest with a valid hotel reservation and recipient.',
    status: PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW
  },
  {
    id: 'pre_checkin',
    journey: 'PRE CHECK-IN',
    automationTypes: ['pre_checkin'],
    supportingTriggers: ['pre_arrival_1d'],
    temporalAnchor: 'arrival minus 24h',
    eligibility: 'Confirmed reservation inside the pre-arrival window with arrival date and recipient.',
    status: PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW
  },
  {
    id: 'during_stay_upsell',
    journey: 'DURING STAY + UPSELL',
    automationTypes: ['during_stay', 'upselling'],
    supportingTriggers: ['weather_trigger', 'abandoned_interest_followup'],
    temporalAnchor: 'arrival/departure stay window',
    eligibility: 'In-house guest inside stay dates; upsell also requires guest interest and an existing configured offer.',
    status: PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW
  },
  {
    id: 'checkout_review',
    journey: 'CHECK-OUT + REVIEW',
    automationTypes: ['checkout', 'review_request'],
    supportingTriggers: ['post_stay_review_intelligence'],
    temporalAnchor: 'departure and departure plus 24h',
    eligibility: 'Departing guest for checkout; checked-out valid stay 18-48h after departure for review.',
    status: PILOT_JOURNEY_STATUSES.CERTIFIED_FOR_PREVIEW
  }
]);

export const PILOT_JOURNEY_AUTOMATION_TYPES = Object.freeze(
  PILOT_JOURNEY_CERTIFICATION.flatMap((item) => item.automationTypes)
);

export const getPilotJourneyCertificationRows = () => (
  PILOT_JOURNEY_CERTIFICATION.map((item) => ({
    ...item,
    realSendBlockers: PILOT_LIVE_SEND_BLOCKERS
  }))
);
