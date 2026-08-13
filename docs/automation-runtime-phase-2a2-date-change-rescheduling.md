# Automation Runtime Phase 2A2 - Date Change and Rescheduling

Status: implemented locally, not deployed.

## Scope

Phase 2A2 extends the Phase 2A1 cancellation safety layer with reservation date-change reconciliation for canonical Phase 1 automation messages. It does not add migrations, activate a worker or cron, enable live provider sends, contact PMS/providers, change Supabase schema, or implement Phase 2B timezone/quiet-hours behavior.

## Date Normalization

Reservation arrival and departure dates are normalized before lifecycle comparison and schedule fingerprinting.

Supported inputs include:

- `YYYY-MM-DD`
- `YYYY/MM/DD`
- ISO timestamps with a leading date
- European `DD/MM/YYYY`
- European `DD-MM-YYYY`
- JavaScript `Date` values when already present in local runtime data

Malformed or ambiguous free-text dates are rejected instead of being parsed through the JavaScript `Date` fallback.

The normalized reservation snapshot stores only `arrival_date` and `departure_date` date strings, not guest PII or provider payloads.

## Date Dependencies

Automation definitions declare which reservation dates affect their schedule.

Arrival-dependent examples:

- `welcome`
- `pre_checkin`
- `checkin`
- `transfer`
- `birthday` while its current schedule anchor remains arrival-based

Departure-dependent examples:

- `late_checkout`
- `checkout`
- `pre_checkout_folio`
- `post_checkout`
- `review_request`

Stay-window examples depend on both arrival and departure:

- `during_stay`
- `upselling`
- `restaurant`
- `spa`
- `experience`
- `vip_followup`

Automations without stay-date scheduling can declare no reservation date dependencies. Birthday-style rules must declare an arrival dependency while their configured schedule anchor is arrival-based.

## Schedule Fingerprint

Each date-dependent runtime decision stores a deterministic reservation schedule fingerprint in message metadata.

The fingerprint is built from:

- fingerprint version
- normalized date dependencies
- normalized arrival/departure values required by those dependencies

The fingerprint uses SHA-256 and is truncated for operational metadata. It does not include guest name, phone, email, message text, PMS payloads, tokens, credentials, or raw event keys.

Runtime idempotency uses the schedule fingerprint for date-dependent messages, so the same reservation and same relevant dates resolve to the same queue occurrence, while a relevant date change creates a different occurrence.

## Stale Semantics

A canonical scheduled message is considered stale when:

- it is date-dependent and its stored fingerprint differs from the current reservation fingerprint; or
- it is date-dependent but either the stored or current fingerprint cannot be verified.

Only canonical Phase 1 messages are eligible for mutation. Legacy/manual rows remain ignored by reconciliation and quarantined by the processor.

Terminal message history remains immutable:

- `sent` remains a historical fact;
- `failed` remains terminal;
- `cancelled` remains terminal;
- `processing` is not rewritten by reconciliation and must rely on the send-time guard.

## State-Driven Reconciliation

Reconciliation uses the persisted current reservation state when a Supabase client is available, falling back to the in-memory current reservation argument only when the row is not found. This lets retry and repair paths converge on the latest known reservation dates.

If previous and current snapshots are the same but the queue still contains stale canonical messages, reconciliation can still repair the queue by comparing each message fingerprint with the current reservation.

## Replacement Before Cancellation

For stale cancellable canonical messages, Phase 2A2 creates the replacement message first using the canonical queue writer. Only after a replacement attempt succeeds or resolves to an existing idempotent replacement does the reconciler mark the stale row as cancelled.

Cancellation metadata records safe internal traceability:

- `reconciliation_event_id`
- `changed_fields`
- `superseded_message_id`
- `replacement_message_id`
- previous and current schedule fingerprints
- rule version where available

This preserves retry safety: if replacement insertion fails, the old message remains pending; if cancellation fails after replacement, retry detects the existing replacement and completes superseding without duplicating it.

## Send-Time Guard

Before any real send path, the processor reloads the reservation and checks lifecycle status first. Terminal reservations still fail closed as in Phase 2A1.

For date-dependent canonical messages, the processor then verifies the message fingerprint against the current reservation. Missing or stale schedule fingerprints fail closed before provider send with explicit reasons:

- `reservation_schedule_unverifiable`
- `reservation_schedule_stale`

`SEND_AUTOMATIONS=false` remains the final global send gate in local tests.

## Sent Semantics

Phase 2A2 does not rewrite already sent messages. A sent message may have been based on an older stay date, but once sent it is treated as audit history. Corrective guest communication, if required, belongs to a future product policy and is not implemented in this phase.

## Legacy Quarantine

Legacy/manual rows without canonical runtime metadata are not migrated, fingerprinted, superseded, or cancelled by date-change reconciliation. They remain excluded from canonical due-message selection and are blocked if passed directly to the processor.

## PMS Ordering Limitations

Phase 2A2 is state-driven. It uses the latest persisted reservation state visible to the runtime and deterministic queue metadata. True PMS out-of-order event rejection is not fully enforceable without authoritative provider ordering metadata, such as monotonically increasing PMS versions or trusted event timestamps.

When provider ordering metadata is absent or unreliable, reconciliation remains idempotent and converges on the persisted reservation state, but it cannot prove that an older PMS event should be ignored before persistence.

## Webhook Claim Safety

Apaleo webhook processing uses the existing durable `pms_webhook_events` identity of `provider + external_event_id`. No new table or migration is required.

For a new event, the webhook row is inserted with `received`. If a concurrent insert hits the unique constraint, the existing durable row is reread. Processing ownership is then acquired only by a conditional database update from `received` or `failed` to `processing`. The request whose update returns a row is the only owner allowed to mutate the reservation and run reconciliation.

If another request sees the same event already in active `processing`, it returns `duplicate_processing` / `already_processing`, acknowledges the duplicate request through the existing non-error webhook response path, and does not fetch the reservation, mutate reservation state, reconcile automations, or write replacements.

Terminal webhook rows remain terminal:

- `processed` duplicates return ignored and are not reclaimed;
- `ignored` duplicates return ignored and are not reclaimed.

Failed webhook rows remain retryable. A later delivery can atomically reclaim `failed` and retry the work, but concurrent retries still produce only one processing owner.

The current `pms_webhook_events` schema does not include `updated_at`, `processing_started_at`, attempts, or another reliable claim timestamp. To avoid an unsafe timeout guess, abandoned `processing` recovery is deferred to Phase 2C. This means same-event concurrent execution is prevented now, while durable automatic repair without an external retry remains Phase 2C work. Send-time stale safety remains fail-closed before provider send.

## Phase 2B Pending

Phase 2B remains responsible for richer scheduling policy, including timezone correctness, quiet hours, send windows, certification hardening, operational UI, and any guest-facing correction strategy for already sent messages.
