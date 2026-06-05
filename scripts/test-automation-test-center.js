import assert from 'node:assert/strict';

const loadModule = async (tag) => import(`../dashboard/lib/automation-test-center.js?test=${tag}-${Date.now()}`);

const hotelA = {
  id: 'hotel-marruecos-test',
  name: 'Hotel Marruecos',
  default_language: 'es',
  timezone: 'Europe/Madrid'
};

const hotelB = {
  id: 'hotel-melia-victoria-test',
  name: 'Melia Victoria',
  default_language: 'es',
  timezone: 'Europe/Madrid'
};

process.env.AUTOMATION_TEST_CENTER_ENABLED = 'true';
process.env.AUTOMATION_TEST_SEND_ENABLED = 'false';
delete process.env.TEST_WHATSAPP_NUMBER;
delete process.env.UBIKOS_ENABLED;

const disabledSendModule = await loadModule('disabled');

const run = (options) => disabledSendModule.runAutomationTestCenter({
  hotel: hotelA,
  dryRun: true,
  ...options
});

const internalTerms = /Staynex analiz|quality alert|alerta interna|review risk|reputation|sentiment analysis|classification|clasificacion|escalation score|IA considera|sistema ha detectado/i;
const postStayPreview = (result) => result.previews.find((item) => item.automation_type === 'post_stay_review_intelligence');

const positive = run({ scenarioId: 'checked_out_24h_positive', simulatedNow: 'checkout_plus_24h' });
assert.ok(
  positive.eligibleAutomations.some((item) => item.type === 'post_stay_review_intelligence'),
  'checked-out positive stay should generate post-stay review intelligence preview'
);
const positiveReviewPreview = postStayPreview(positive);
assert.ok(
  /opinion|valorar|feedback|experience|experiencia/i.test(positiveReviewPreview.message_body),
  'positive stay preview should include hospitality feedback-oriented message'
);
assert.ok(!internalTerms.test(positiveReviewPreview.message_body), 'positive guest message must not expose internal reasoning');
assert.ok(positiveReviewPreview.guest_message_preview, 'positive preview should expose guest message preview separately');
assert.ok(positiveReviewPreview.internal_reasoning?.review_strategy === 'request_public_review', 'positive preview should keep internal reasoning separately');

const negative = run({ scenarioId: 'checked_out_24h_negative', simulatedNow: 'checkout_plus_24h' });
const negativeReviewPreview = postStayPreview(negative);
assert.ok(
  negativeReviewPreview && /comentario|sugerencia|suggestion|experience|experiencia/i.test(negativeReviewPreview.message_body),
  'negative stay should generate private feedback guest message'
);
assert.ok(!negativeReviewPreview.message_body.includes('reviews.example.com'), 'negative stay guest message must not include public review link');
assert.ok(!internalTerms.test(negativeReviewPreview.message_body), 'negative guest message must not expose internal reasoning');
assert.ok(negativeReviewPreview.guest_message_preview, 'negative preview should expose guest message preview separately');
assert.ok(negativeReviewPreview.internal_reasoning?.quality_alert === true, 'negative preview should keep quality alert in internal reasoning only');

const folio = run({ scenarioId: 'departing_tomorrow_with_balance', simulatedNow: 'checkout_minus_24h' });
assert.ok(
  folio.eligibleAutomations.some((item) => item.type === 'pre_checkout_folio_reminder'),
  'departing tomorrow with balance should generate folio preview'
);
assert.ok(
  folio.previews.some((item) => item.automation_type === 'pre_checkout_folio_reminder' && item.message_body.includes('132 EUR')),
  'folio preview should include outstanding balance'
);

const missingPhone = run({ scenarioId: 'guest_missing_phone' });
assert.ok(
  missingPhone.skippedAutomations.some((item) => item.reason === 'skipped_missing_phone'),
  'guest missing phone should be blocked'
);

const optOut = run({ scenarioId: 'guest_opt_out' });
assert.ok(
  optOut.skippedAutomations.some((item) => item.reason === 'skipped_opt_out'),
  'guest opt-out should be blocked'
);

const takeover = run({ scenarioId: 'human_takeover_active' });
assert.ok(
  takeover.skippedAutomations.some((item) => item.reason === 'skipped_human_takeover'),
  'human takeover should be blocked'
);

const disabledSend = run({ scenarioId: 'guest_requested_transfer', sendTest: true });
assert.equal(disabledSend.sendResult.status, 'failed_test_send', 'test send should fail when AUTOMATION_TEST_SEND_ENABLED=false');
assert.ok(disabledSend.safety.blockedReasons.includes('automation_test_send_disabled'), 'disabled test send should be recorded in safety blocks');

process.env.AUTOMATION_TEST_SEND_ENABLED = 'true';
process.env.TEST_WHATSAPP_NUMBER = '+34911111111';
const enabledSendModule = await loadModule('enabled');
const enabledSend = enabledSendModule.runAutomationTestCenter({
  hotel: hotelA,
  scenarioId: 'guest_requested_transfer',
  dryRun: true,
  sendTest: true
});
assert.equal(enabledSend.sendResult.status, 'sent_test', 'enabled send should simulate internal test send');
assert.equal(enabledSend.sendResult.target, '+34911111111', 'test send must target TEST_WHATSAPP_NUMBER');
assert.notEqual(enabledSend.sendResult.target, enabledSend.simulatedGuest.phone_number, 'test send must never target simulated guest phone');

assert.equal(positive.simulatedGuest.hotel_id, hotelA.id, 'mock guest should respect active hotelId');
assert.equal(positive.reservation.hotel_id, hotelA.id, 'mock reservation should respect active hotelId');
assert.equal(positive.scenario.id, 'checked_out_24h_positive', 'scenario id should remain stable');
assert.equal(positive.simulatedGuest.metadata.hotel_name, hotelA.name, 'mock should use active hotel name');

const otherHotel = disabledSendModule.runAutomationTestCenter({
  hotel: hotelB,
  scenarioId: 'arriving_tomorrow',
  dryRun: true
});
assert.equal(otherHotel.simulatedGuest.hotel_id, hotelB.id, 'second hotel mock should respect its active hotelId');
assert.equal(otherHotel.simulatedGuest.metadata.hotel_name, hotelB.name, 'second hotel mock should use its hotel name');
assert.notEqual(otherHotel.simulatedGuest.hotel_id, hotelA.id, 'test center must not mix hotel tenants');
assert.notEqual(otherHotel.simulatedGuest.metadata.hotel_name, hotelA.name, 'test center must not leak another hotel name');

assert.equal(positive.safety.pmsTouched, false, 'Automation Test Center must not touch PMS real');
assert.equal(positive.safety.ubikosTouched, false, 'Automation Test Center must not touch Ubikos');
assert.equal(positive.safety.liveSendingBlocked, true, 'live sending should stay blocked');
assert.equal(positive.safety.noGuestMessages, true, 'guest messages should be blocked');
assert.equal(positive.safety.dryRun, true, 'dry-run should be enabled by default');

console.log('Automation Test Center tests passed');
