# Pilot Journey Certification

Status: certified for pilot preview only. No live send activation, Supabase access, PMS access, Twilio send, Guest Memory dependency, new automation type, or workflow engine is included in this certification.

Date: 2026-08-29

## Canonical Mapping

| Pilot journey | Canonical automation type(s) | Supporting trigger(s) |
| --- | --- | --- |
| WELCOME | `welcome` | `welcome_message` |
| PRE CHECK-IN | `pre_checkin` | `pre_arrival_1d` |
| DURING STAY + UPSELL | `during_stay`, `upselling` | `weather_trigger`, `abandoned_interest_followup` |
| CHECK-OUT + REVIEW | `checkout`, `review_request` | `post_stay_review_intelligence` |

No new canonical automation types are introduced.

## Certification Matrix

| Journey | Eligibility | Cancellation | Reschedule | Idempotency | Content | Preview | Real-send blockers | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WELCOME | Arrival day or checked-in guest with matching `hotel_id`, reservation id, guest id and recipient. | Cancelled/no-show/deleted reservations skip. | Arrival-date dependent; arrival changes stale/reschedule, departure-only changes do not. | One occurrence per stay through welcome duplicate guard and runtime idempotency key. | Spanish welcome, short, no invented hotel capability. | Preview writes `send_to = null` and no guest message is sent. | REQUIRED BEFORE SEND_AUTOMATIONS=true: controlled rollout, quiet hours/send-time policy, outbound atomic claim, real WhatsApp hotel, real PMS data, Kill Switch, Human Fallback, monitoring. | CERTIFIED FOR PREVIEW |
| PRE CHECK-IN | Valid confirmed reservation in pre-arrival window; pilot trigger uses `pre_arrival_1d`. | Cancelled/no-show/deleted reservations skip. | Arrival-date dependent; date change produces new deterministic occurrence. | Idempotency key includes hotel, reservation, canonical type, trigger and schedule fingerprint. | Spanish arrival reminder, does not ask for data Staynex lacks. | Preview-only; duplicate evaluation returns existing queued preview. | REQUIRED BEFORE SEND_AUTOMATIONS=true: controlled rollout, quiet hours/send-time policy, outbound atomic claim, real WhatsApp hotel, real PMS data, Kill Switch, Human Fallback, monitoring. | CERTIFIED FOR PREVIEW |
| DURING STAY + UPSELL | `during_stay` requires in-house guest inside arrival/departure window. `upselling` also requires guest interest plus an existing configured offer. | Cancelled/no-show/deleted reservations skip. | Arrival and departure dependent; either date change invalidates stale previews. | Shared writer dedupes by hotel-scoped idempotency key. | Spanish, concise, no price/availability invented; insufficient upsell data skips. | Test Center/runtime fixtures are synthetic and dry-run only. | REQUIRED BEFORE SEND_AUTOMATIONS=true: controlled rollout, quiet hours/send-time policy, outbound atomic claim, real WhatsApp hotel, real PMS data, Kill Switch, Human Fallback, monitoring. | CERTIFIED FOR PREVIEW |
| CHECK-OUT + REVIEW | `checkout` requires departure window. `review_request` requires checked-out valid stay 18-48h after departure. | Cancelled/no-show/deleted reservations skip; no review for cancelled/no-show. | Departure-date dependent; departure changes stale/reschedule, arrival-only changes do not. | Duplicate previews resolve to the existing queued message. | Spanish checkout/review copy, no reputation engine expansion. | Preview-only; no Twilio, no PMS, no provider calls. | REQUIRED BEFORE SEND_AUTOMATIONS=true: controlled rollout, quiet hours/send-time policy, outbound atomic claim, real WhatsApp hotel, real PMS data, Kill Switch, Human Fallback, monitoring. | CERTIFIED FOR PREVIEW |

## Preview Certification Scope

The certified preview path uses the canonical automation catalog, deterministic runtime evaluator and canonical queue writer. It verifies tenant-scoped reservations, deterministic eligibility, schedule fingerprints, cancellation/no-show/deleted safety, date-change staleness, idempotency, no guest send in preview, Guest Memory OFF compatibility, SEND_AUTOMATIONS=false, missing data fail-closed behavior and safe Spanish copy.

Human Takeover and Kill Switch are respected before guest-facing execution. Preview certification does not claim live-send readiness.

## Required Before Live Send

- `SEND_AUTOMATIONS=true` controlled rollout.
- Quiet Hours/send-time policy.
- Outbound atomic claim/double-send safety.
- Real WhatsApp hotel.
- Real/current PMS reservation data.
- Kill Switch verification in live rollout.
- Human Fallback verification in live rollout.
- Monitoring and failure rehearsal.

## Verdict

CLOSED FOR PILOT PREVIEW.
