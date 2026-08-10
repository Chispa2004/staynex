# Automation Runtime Phase 2A1 - Cancellation Safety + Legacy Quarantine

Status: implemented locally, not deployed.

## Scope

Phase 2A1 adds a reservation lifecycle safety layer for the Phase 1 automation runtime. It does not activate a worker, cron, live sends, provider calls, retries, timezone handling, quiet hours, E.164 cleanup, certification, kill-switch UI, or full rescheduling.

## Reservation Lifecycle Policy

The shared lifecycle policy lives in `shared/automations/reservation-lifecycle.js`.

Terminal statuses for automations:

- `cancelled`
- `no_show`
- `deleted`

Known provider variants are normalized before policy decisions:

- `canceled` -> `cancelled`
- `no-show`, `no show`, `noshow` -> `no_show`

Other active or historical reservation states are preserved for existing business logic.

## Cancellation Semantics

When a reservation currently has a terminal automation status, the reconciler inspects matching `scheduled_messages` for the same `hotel_id` and `reservation_id`. This is intentionally idempotent: retries after a failed reconciliation still ensure pending rows are cancelled, even when the previous and current snapshots are already the same terminal status.

Only canonical Phase 1 rows are mutable. A row is canonical when all of these are true:

- `idempotency_key` is present
- `execution_mode` is present
- `runtime_version` is recognized

Cancellable canonical statuses:

- `preview`
- `awaiting_approval`
- `scheduled`

Statuses intentionally not cancelled by reconciliation:

- `processing`: left untouched and protected by the send-time guard
- `sent`: historical fact, never rewritten
- `cancelled`: already terminal
- `failed`: already terminal

Each newly cancelled canonical row gets an `automation_runs` audit entry with safe reconciliation metadata only.

## Legacy Quarantine

Legacy/manual scheduled messages are not migrated or mutated in this phase. The due-message query excludes them by canonical columns, and the processor blocks any legacy row that is passed directly with reason:

`legacy_automation_message_quarantined`

## Send-Time Guard

Before any WhatsApp send path can call Twilio, the message processor reloads the reservation by `hotel_id` and `reservation_id`.

If the reservation is now `cancelled`, `no_show`, or `deleted`, the send is blocked with an explicit lifecycle reason. Canonical terminal blocks are marked `cancelled`; lookup/context failures are fail-closed as `failed`.

## PMS Integration

Reservation mutations call the reconciler after the reservation update is persisted. Apaleo webhooks pass the external event id into reconciliation metadata, and duplicate processed webhooks remain ignored by the existing `pms_webhook_events` idempotency path.

Apaleo and Ubikos now share the terminal status normalizer, including distinct `no_show` handling.

## Date Changes

Arrival/departure date changes are detected and returned as:

`future_reschedule`

No rescheduling is executed in Phase 2A1.

## Operational Guarantees

This phase keeps `SEND_AUTOMATIONS=false` during tests and does not register any scheduler/worker in `src/server.js`.
