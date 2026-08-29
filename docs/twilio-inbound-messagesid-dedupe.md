# Twilio Inbound MessageSid Dedupe

## Pilot inbound semantics

Twilio inbound WhatsApp processing is intentionally at-most-once for the pilot.

Only a brand-new durable `MessageSid` claim may start automatic guest-message
processing. Existing claims in `processing`, `processed`, or `failed` are treated
as consumed duplicate deliveries and are acknowledged without entering the
automatic pipeline again.

## Tradeoff

A transient or partial failure can leave work incomplete and may require
human/manual recovery. This is accepted for the pilot because Twilio retries must
not duplicate guest-facing or operational side effects such as AI responses,
tickets, provider bookings, revenue records, or outbound replies.

Automatic recovery for failed or stale `processing` claims is deferred.

## Rollback

Roll back application code first if needed. Keep
`public.twilio_inbound_message_claims` and its data in place after operational
use so claim evidence remains available for audit and manual recovery.
