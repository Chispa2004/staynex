# Automation Runtime Foundation - Phase 1

Status: implemented as a safe foundation. No automation is certified yet. No worker, cron, live send or provider contact is enabled by this phase.

## Canonical Responsibilities

`scheduled_messages` is the only operational queue for automation messages. Phase 1 writes preview records only for current hotels and uncertified automations. Future approval/live sends must still pass the canonical writer and message queue gates.

`automation_runs` is the decision audit log. It records what was evaluated, the canonical automation type, execution mode, operational status, skip reason, runtime version and idempotency key.

`ai_logs` remains limited to AI traceability: generated response, provider/model attribution and AI-related automation trace metadata. It is not the runtime decision log.

`automation_events` remains the legacy reservation-event timeline created from PMS reservation lifecycle events. It is not a send queue and must not be processed by `message-queue.service.js`.

`message-queue.service.js` remains the only candidate processor for `scheduled_messages`. It is not registered as a worker or cron in Phase 1.

`twilio.service.js` remains the final WhatsApp send service. Phase 1 does not change it and does not call it from tests or preview flows.

## Shared Runtime Modules

The canonical runtime foundation lives under `shared/automations/`:

- `shared/automations/catalog.js`: canonical automation types, aliases, modes and certification metadata.
- `shared/automations/runtime.js`: deterministic evaluator, trigger occurrence and idempotency key generation.
- `shared/automations/queue-writer.js`: the only operational writer for `scheduled_messages`.

`dashboard/lib/automation-catalog.js`, `dashboard/lib/automation-runtime.js` and `dashboard/lib/automation-queue-writer.js` are compatibility wrappers only.

The dashboard can keep Vercel Root Directory set to `dashboard`. `dashboard/next.config.mjs` traces from the repository root so Next server routes include `shared/automations/*` even though those modules live outside the dashboard directory. The queue writer remains server-only and must not be imported by `"use client"` files.

## Catalog

Current canonical types:

- `welcome`
- `pre_checkin`
- `checkin`
- `during_stay`
- `upselling`
- `transfer`
- `restaurant`
- `spa`
- `experience`
- `late_checkout`
- `checkout`
- `pre_checkout_folio`
- `post_checkout`
- `review_request`
- `vip_followup`
- `birthday`

Legacy aliases remain mapped, including `pre_arrival_7d`, `pre_arrival_1d`, `in_stay_upsell`, `post_stay_review`, `welcome_message`, `late_checkout_offer`, `spa_upsell`, `experience_recommendation`, `restaurant_promotion`, `transfer_offer`, `pre_checkout_folio_reminder` and `post_stay_review_intelligence`.

Every catalog entry starts with `certificationStatus: "uncertified"`.

## Evaluator

The canonical evaluator lives in `shared/automations/runtime.js`.

It receives hotel, reservation, guest, conversation, automation and trigger context and returns a deterministic decision. It does not write to the database, call providers, contact PMS systems, generate AI output or send messages.

Every decision includes hotel, reservation or stay identity, canonical type, legacy type when applicable, trigger, eligibility, skip reason, execution mode, operational status, scheduled time, timezone, recipient availability, takeover state, idempotency key, template version, runtime version and safe metadata.

## Modes And Statuses

Modes are:

- `disabled`
- `preview`
- `approval_required`
- `live_limited`
- `live`

Operational statuses are separate:

- `evaluated`
- `skipped`
- `preview`
- `awaiting_approval`
- `scheduled`
- `processing`
- `sent`
- `cancelled`
- `failed`

Phase 1 caps existing hotels and all uncertified automations at `preview`. No code in this phase activates `live_limited` or `live`.

`SEND_AUTOMATIONS=false` remains the final global send gate. If it were accidentally set to true, the message queue still blocks non-live modes and uncertified automation types before Twilio.

## Writer

The canonical writer lives in `shared/automations/queue-writer.js`.

It is the authorized path from decision to `scheduled_messages`. It requires explicit `hotelId`, canonical automation type and `idempotencyKey`. It records execution mode, runtime version, source and creation reason in the row and metadata.

Preview mode creates `preview`. Approval mode is supported in the interface for future certified automations. `scheduled` can only be created when all live gates pass, which cannot happen for the current uncertified catalog.

Duplicate prevention is based on a deterministic idempotency key stored in metadata today and in the optional `idempotency_key` column after migration. Before inserting, the writer now makes a best-effort strict lookup by hotel plus idempotency key, first through the optional column and then through metadata. If an existing preview is found, it returns a duplicate result without creating another scheduled message or automation run. Database unique violations are still handled as the stronger post-migration concurrency guard.

This is not a substitute for the unique index under concurrent writes. Strong cross-process race safety still requires the Phase 1 migration and its unique index.

## Preview Flow

Dashboard `POST /api/automations/run` now means evaluate reservations and generate safe previews. It uses the canonical evaluator and writer and returns counts for eligible, skipped, preview, blocked, duplicate and skip reasons.

The dashboard runner dedupes duplicate runtime candidates by `hotelId + idempotencyKey` before calling the writer. Legacy aliases such as `in_stay_upsell` plus `abandoned_interest_followup`, or `post_stay_review` plus `post_stay_review_intelligence`, produce one visual preview and one run per deterministic idempotency key. Extra candidates are counted as `duplicateCandidate` with skip reason `duplicate_candidate`; existing database duplicates remain counted separately as `duplicateExisting`.

Automation Test Center uses the same evaluator for logical decisions while preserving its existing scenario output shape.

## Future Approval And Live Flow

Phase 2 can add approval UI, reprogramming, cancellation, retries, certified automation gates and a registered worker. Those changes must still use the same catalog, evaluator, writer and idempotency key.

## Legacy Components

`scheduler.service.js` is legacy and non-operational by default. It is not imported by `src/server.js`, no cron is registered, and its exported runner returns no work unless explicitly called with a legacy flag.

`automation.service.js` still owns reservation timeline events in `automation_events`. Its legacy scheduled-message helper now delegates preview persistence to the shared writer and does not store send targets.

Pre-checkout folio and post-stay review intelligence jobs remain preview-only. They are not registered as workers or cron jobs by this phase, and their preview records are written through the shared writer with canonical automation types and null `send_to`.

Demo scheduled messages are preview-only and do not store a send target.

## Migration

`supabase/sql/add_automation_runtime_foundation_phase1.sql` adds optional Phase 1 columns and indexes for execution mode, idempotency key, runtime version, source and skip reason.

It was created for manual rollout only and was not executed. Recommended order:

1. Deploy Phase 1 code with preview-only behavior.
2. Run `supabase/sql/preflight_automation_runtime_foundation_phase1.sql` in the target database.
3. Resolve any duplicate non-null idempotency keys before adding the unique index.
4. Run `supabase/sql/add_automation_runtime_foundation_phase1.sql` in a controlled environment.
5. Re-run the preflight duplicate checks and review preview counts.
6. Keep `supabase/sql/rollback_automation_runtime_foundation_phase1.sql` available for manual rollback if the additive columns or indexes need to be removed.
