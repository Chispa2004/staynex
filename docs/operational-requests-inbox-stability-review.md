# Operational requests and stable Inbox — review 2026-10-02

Base: `ea5f21723e26d8b25431d228748355a96d7978f5` (PR #36), verified against GitHub and both active deployments. Branch: `codex/operational-requests-inbox-stability`. Earlier worktrees, reports and private inventories are preserved; organizations and announcements are not included.

## Observed problems and changes

| Problem | Cause and correction |
| --- | --- |
| Referral instead of a usable request | Historical demo replies were generated before this change. The runtime also let model/Concierge prose imply actions independently of persistence. `recordOperationalRequest` now interprets bounded operational requests, invokes an atomic receipt RPC and reads the scoped committed ticket before `finalizeServiceReply` acknowledges it. Information alone creates no ticket. |
| Known room asked again | Backend, Concierge and Inbox used different guest/latest-reservation projections. `resolveOperationalContext` now checks hotel/guest/conversation/source identity, dated stays, room snapshots and contradictions. It preserves a server-validated reservation-token binding. Current-room fallback requires a uniquely associated dated stay; a bare or different historical room is not authority. |
| List jumps | The attention provider had a conversation-dependent React key, remounting the entire subtree. Remove that key, invalidate its own scoped reader, preserve list row/offset and reserve measured row height while read/priority badges change. Resize releases those measurements. List and history scroll independently; navigation and per-conversation drafts remain scoped. |
| Whole-screen reloads | Focus/session refresh reset the authorized shell and onboarding gate; Inbox returned a different full skeleton tree. Same-context revalidation now keeps content with explicit stale/error notices. Initial list and selected secondary detail load separately. Definitive denial, actor/hotel changes and obsolete responses invalidate affected content. |

The real public reproduction used 1280×720: list scrollTop 344.8 before Carlos, 0 afterwards; the first click also lost the selected panel. This was a React remount/gate, not evidence of a document reload. The old Elena/Carlos replies were historical examples, not newly generated responses.

## Request contract and limits

Tickets retain hotel, guest, conversation, original guest message, scoped reservation, room, original request/quantities, category, priority reason, status and responsible existing role. Housekeeping/maintenance is used only if an active member with that role exists; otherwise the responsible circuit is reception. Ticket detail links back to the conversation; Inbox distinguishes recorded ticket from a proposed draft. Opening, generating or copying an Inbox draft never calls the recording RPC.

The receipt primary key is `(hotel_id, source_message_id)`, stable even if a retry changes model interpretation. Existing inbound deduplication supplies the stable guest message. A conversation row lock serializes different source messages: follow-ups with the same request key and stay update an open ticket; a different request or explicit new incident creates another. Completed history is retained. One inbound message currently produces one request receipt; all of its original details are retained, not arbitrarily split into multiple tickets. Legacy tickets without request keys are not guessed to be duplicates.

The transaction rechecks tenant/source/reservation, archive hold and human control; it does not enable or deliver any external action. A saved ticket is not proof of notification, attendance or resolution. A commit whose response/readback is lost remains unconfirmed until a retry reads the same receipt. Failed ticket creation leaves the original guest message intact and produces an explicit unconfirmed response. Existing independent provider-booking workflows retain their own receipts and authorization.

## Isolated evidence

- Behavioral contexts: two hotels; known, absent, changed, conflicting, ambiguous, pre/post stay, changed-after-message and untrusted reservation metadata; Guest Memory OFF.
- Recording/finalization: scoped readback, write failure, lost response/read failure, retry, foreign receipt, read-only drafts and safe prompt projection.
- Disposable PostgreSQL 17.10: additive migration/repeat, service-only contract, anti-forgery trigger, eight concurrent retries, follow-ups/distinct incidents, tenant attacks, human/archive controls, transaction rollback and recovery, closed history.
- 24 actual OpenAI generations (12 fictional cases × primary/Concierge) using `gpt-4.1-mini-2025-04-14`. The isolated child could reach only the AI endpoint; database, WhatsApp, email and other transports were blocked. No credential was copied locally. Backend flag read: SEND_AUTOMATIONS=false; GUEST_MEMORY_ENABLED absent with the existing false-by-default implementation, not an uninspected configuration.
- All 24 raw outputs are retained in `docs/evidence/operational-request-ai-20261002.json`. Twenty operational outputs contained unsupported pre-execution promises. All were replayed through the actual recording/finalization service against committed disposable PostgreSQL tickets. The final replies confirm only persistence; four information outputs create no ticket. This is deliberately not reported as 24 good raw generations.
- CI critical includes the new service/context tests. CI PostgreSQL includes 10 operational groups including the 24-output replay. Dashboard CI runs browser regressions for selection, drafts, history, recovery and three comparative timing trials, in addition to existing theme/density/accessibility suites.
- Existing critical suite passed through all behavior tests; local Windows HTTP Security still fails the inherited literal LF check on `dashboard/lib/demo.js` under CRLF. Its expectations are unchanged; Linux CI must execute it successfully. No assertion was disabled. Harness bindings were updated to execute the changed production boundary; persistence failure expectations now require an honest unconfirmed reply rather than treating absence of a reply as success.

Browser evidence uses real production-compiled components with synthetic identity/API transports; it is distinct from public authentication. Requested sizes: 1366×900 and 390×844, light/dark, keyboard and Back/Forward. Measurement JSON records three trials and separates visual availability from receipt of new data; baseline and changed builds use the same 180 ms synthetic network delay. These are laboratory measurements, not a production latency guarantee.

## Migration and release order

Exact file: `supabase/sql/add_operational_request_receipts.sql`.
SHA-256: `57756db1d27cb0335dc28aa5dda62c389b325b80a0a6a85501a7c934f0b35571`.

Effects: adds `tickets.request_context jsonb NOT NULL DEFAULT '{}'::jsonb` (existing tickets get the empty default, no ticket details/status rewrite); creates `operational_request_receipts` with tenant/source primary key and cascading references consistent with existing deletion semantics; adds the partial open-request index; creates the request-context write guard trigger/function and service-only `record_guest_operational_request_v1`. Receipt RLS is enabled; anon/authenticated/PUBLIC get no receipt access or RPC execute. Existing ticket policies are unchanged. No job, provider call, retention rule, backfill of request identities or flag change.

1. Pass final PR CI/reviews. Confirm deployed project `vblxmnqbatqrynfaasmf` and run the versioned `preflight_operational_request_receipts.sql` (BEGIN READ ONLY / ROLLBACK). Preserve private catalog evidence outside Git. It has already confirmed the initial missing contract, relevant text types/checks, service privileges and absence of conflicting ticket triggers.
2. Apply only this additive SQL before code that selects the new column/calls the RPC. Verify function signature, invoker security, RLS, trigger, grants and PostgREST exposure by catalog/OpenAPI reads; do not claim an operational test from a schema read.
3. Normal merge with passing CI. Check main CI, Vercel Production SHA, Railway SHA/replicas/retirement. No flag/config changes. During mixed versions, the older consumer does not provide the new receipt guarantee; do not perform the demo correction until every active consumer is new.
4. Verify authenticated read/navigation and new server contract. Only then use the expressly authorized two synthetic source messages for Elena/Carlos; retain private before/after backup and exact transaction/diff. Check for existing linked tickets before recording. Preserve historical timestamps, demo identity and response/draft distinction; do not deliver externally.
5. Verify counts and unchanged other conversations, six presentation replies, archived technical hotel and flags. No mutations of real guests.

Recovery: preserve tickets/receipts; an uncertain attempt must be retried by its original message identity, never by fabricating a fresh event. Keep the additive schema if the UI is rolled back. Reverting the old backend after new receipts exist does not preserve the new deduplication guarantee; hold affected dispatch paths rather than presenting that as safe recovery. No cleanup of historical tickets or operational data is part of this migration.

## Publication and demo delta

Pending final CI/publication. No remote migration or demo modification had occurred when this review was prepared. Public QA and exact two-row/ticket delta will be recorded after deployment; a Ready Preview alone is not functional verification.

## Local measurements (milliseconds, all three trials)

| Path | Before visual / new data | After visual / new data |
| --- | --- | --- |
| First entry | 740 / 665; 530 / 402; 589 / 450 | 793 / 632; 553 / 432; 524 / 420 |
| Return to Inbox | 433 / 274; 445 / 278; 429 / 252 | 454 / 285; 439 / 285; 475 / 312 |
| Select conversation | 116 / already loaded; 98 / already loaded; 133 / already loaded | 117 / 282; 92 / 268; 107 / 277 |
| Refresh | 291 / 482; 279 / 479; 312 / 514 | 65 / 260; 64 / 258; 59 / 253 |

Selection renders primary data already available; after-change new-data time is selected secondary detail, not another full-list wait. Refresh waits for the primary summary response, excluding in-flight detail. Same host and imposed latency; browser cache/CPU noise remain, so no single best trial or production speed guarantee is inferred. Raw values are versioned alongside the synthetic AI evidence.

Local browser regression result: 30 unchanged theme/density/accessibility scenarios passed; the remaining two passed after adapting their URL predicates to the configured laboratory port and the new summary query. Assertions about keyboard navigation, all eleven metric destinations and focus preservation remain intact. Five new Inbox tests passed at all requested dimensions/themes. Production build and diff check passed.
