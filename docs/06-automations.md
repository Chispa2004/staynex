# Automations

Audit date: 2026-07-15

## Purpose

Staynex automations help hotels send or preview timely guest-facing messages based on reservation, PMS, guest and conversation context.

The current system is designed to be safe before the first PMS pilot. It emphasizes preview mode, dry-run tests, deduplication and fatigue protection.

## Automation Runtime Foundation

Phase 1 canonical architecture is documented in [Automation Runtime Foundation - Phase 1](automation-runtime-foundation-phase-1.md).

Summary:

- `scheduled_messages` is the only operational automation message queue.
- `automation_runs` records decisions, modes, statuses and skip reasons.
- `ai_logs` stores AI generation/provider traceability only.
- `automation_events` remains a legacy reservation event timeline, not a send queue.
- `message-queue.service.js` is the only future candidate processor for `scheduled_messages`, but no worker or cron is registered in Phase 1.
- `SEND_AUTOMATIONS=false` remains the final global send gate.
- All current catalog entries are `uncertified` and capped at preview.
- Shared automation modules live in `shared/automations/`; dashboard modules are compatibility wrappers.

## Existing Playbooks

Current intelligent automation types include:

- Welcome Message.
- Late Checkout Offer.
- Spa / Wellness Upsell.
- Experience Recommendation.
- Restaurant Promotion.
- Transfer Offer.
- Weather Trigger.
- VIP Followup.
- Birthday Message.
- Abandoned Interest Follow-up.
- Pre-checkout Folio Reminder.
- Post-stay Review Intelligence.

There are also legacy scheduled automation types such as pre-arrival and in-stay upsell flows.

## Triggers

Triggers are based on:

- check-in / in-house status;
- pre-arrival timing;
- pre-checkout timing;
- post-checkout timing;
- guest interests;
- VIP signals;
- birthday/celebration signals;
- PMS folio availability;
- review sentiment/risk;
- conversation context.

## Priority

Priority levels:

- CRITICAL: human escalation, quality alert.
- HIGH: Pre-checkout Folio Reminder, VIP Followup.
- MEDIUM: Transfer Offer, Experience Recommendation, Spa Upsell, Restaurant Promotion, Late Checkout.
- LOW: Weather, Birthday, secondary follow-ups, Welcome.

Priority is visible in the Automation Test Center.

## Cooldowns and Fatigue Guard

The automation engine includes:

- cooldown windows;
- max-per-guest limits;
- fatigue scoring;
- high automation density simulation;
- suppression of lower-priority messages when too many messages would be generated.

## Deduplication

Important dedupe behavior:

- Welcome Message is protected as once per stay.
- Existing scheduled messages can block duplicate post-stay reviews and folio reminders.
- Provider booking requests have duplicate protections in their own flow.

## Welcome Once Per Stay

The system checks `welcome_sent_for_stay` and recent automation/scheduled records. If already delivered, it skips with:

`welcome_already_delivered`

Hotel-facing wording should show this as:

`Welcome already delivered`

## Preview Mode and Dry-run

Automation Test Center is dry-run oriented. It should not:

- send real WhatsApp messages to guests;
- touch real PMS;
- touch Ubikos;
- trigger real providers;
- modify reservations.

## Guest-facing Copy vs Internal Reasoning

Guest-facing copy is separated from internal reasoning.

Guest messages should sound like the hotel:

- premium;
- helpful;
- concierge-like;
- non-technical.

Internal reasoning can include:

- sentiment;
- review strategy;
- quality alert;
- trigger reason;
- priority;
- safety blocks.

## Revenue Follow-ups

Dry-run paths exist for:

- spa interest;
- experience interest;
- airport transfer interest.

These simulate intent detection, next message and confirmation path without touching real providers or PMS.

## Post-stay Review Intelligence

Positive stays can request public review if a review link exists.

Neutral/mixed stays should request private feedback.

Negative/high-risk stays should avoid public review links and create/preview internal quality handling.

## Pre-checkout Folio Reminder

This playbook requires real PMS folio data. It must not invent charges or amounts.

It should remain preview-only until validated with a real PMS/hotel.

## Environment Variables

Relevant variables include:

- `SEND_AUTOMATIONS`
- `AUTOMATION_TEST_CENTER_ENABLED`
- `AUTOMATION_TEST_SEND_ENABLED`
- `TEST_WHATSAPP_NUMBER`
- `TWILIO_*`
- `EXPERIENCE_PROVIDER_EMAIL_MODE`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`

Do not put secrets in documentation or Git.
