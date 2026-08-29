# Staynex x Ubikos Technical Integration Pack

## Staynex integration objective

Prepare a real, read-only Ubikos PMS integration for the first Staynex pilot without adding a second PMS framework.

The target is to use the existing Staynex PMS architecture:

PMS provider -> adapter -> normalized Staynex reservation/guest/room model -> Staynex DB -> AI, automation previews, reception, inbox and dashboard.

Current pilot constraints:

- no writeback to Ubikos;
- no live PMS webhooks until Ubikos validation/signature behavior is confirmed;
- no Guest Memory;
- `SEND_AUTOMATIONS=false`;
- no real PMS credentials in the repository;
- no UI scraping or unofficial browser automation.

Current readiness for real connection: **BLOCKED BY UBIKOS INFO**.

Existing implementation state: **PARTIAL / MOCK ONLY**. Staynex has a registered Ubikos connector, normalizers, sandbox mocks, health behavior and tests, but no official Ubikos API client, confirmed endpoints, credentials, sandbox, webhook contract or production data mapping.

## Current Staynex PMS architecture

Staynex already has a reusable PMS integration architecture. Ubikos should enter this architecture instead of introducing a new framework.

### Core provider registry

- `src/integrations/pms/base-pms-connector.js` defines the connector surface: `connect`, `syncReservations`, `syncRooms`, `syncGuests`, `syncOccupancy`, `getGuestFolioSummary`, `healthCheck`.
- `src/integrations/pms/registry.js` registers PMS providers and creates connectors by provider key.
- `dashboard/lib/pms-providers.js` mirrors provider catalog metadata for dashboard setup.

### Connection config and safe credential storage

- `hotel_pms_connections` stores provider configuration per hotel.
- Provider uniqueness is hotel-scoped with `hotel_id + provider`.
- Existing config fields include `provider`, `client_id`, encrypted client secret, `account_code`, `base_url`, `property_id`, `connection_mode`, `metadata`, webhook fields and sync status.
- `shared/pms/safe-connection.js` sanitizes connection DTOs and removes secret-like metadata before dashboard/platform exposure.
- Dashboard save/test/sync routes use explicit hotel context and block support sessions from write actions.

### Authentication

Staynex can support several generic auth patterns through provider-specific adapters and `hotel_pms_connections`:

- API key stored encrypted in sanitized metadata;
- client id + encrypted client secret;
- bearer/OAuth token flow inside a provider adapter;
- username/password token exchange inside a provider adapter;
- property/hotel-scoped credentials.

Current Ubikos code does not prove which one Ubikos uses.

### Test connection and sync

- `src/services/pms-connections.service.js` provides `testPmsConnection` and `syncHotelReservations`.
- Today, real test/sync behavior is implemented only for Apaleo.
- For non-Apaleo providers, including Ubikos, test/sync returns `pending_setup` / "activation required".
- PMS sync health is summarized by `src/jobs/pmsSyncHealthCheck.js`.

### Reservation normalization and DB write path

- Provider data is normalized to a Staynex reservation shape.
- `src/services/reservation.service.js` stores reservations via `createOrUpdateReservation`.
- Production PMS paths should pass:
  - `requireExplicitHotelId: true`
  - `tenantScopedPmsIdentity: true`
- Conservative identity is:
  - `hotel_id`
  - `pms_provider`
  - `pms_reservation_id`
- Guest creation/linking currently relies primarily on normalized phone.
- Reservation access tokens and WhatsApp links are generated internally by Staynex.

### Room and operational context

- `src/services/pms-room-status.service.js` normalizes room status.
- `src/services/pms-intelligence.service.js` derives guest stay context, room snapshots, occupancy and operational events.
- `src/services/pms-operational-context.service.js` persists:
  - `guest_stay_context`
  - `room_status_snapshots`
  - `hotel_occupancy_snapshots`
  - `pms_operational_events`
  - `pms_intelligence_logs`
- `supabase/sql/create_hotel_rooms.sql` defines a tenant-safe room catalog with optional `pms_provider` and `pms_room_id`.

### Folio

- `src/services/pms-folio.service.js` can read a folio summary from an enabled PMS connector.
- Folio data is useful for future pre-checkout reminders, but it is not required for the first Ubikos technical pilot unless the hotel explicitly wants folio-based workflows.
- Folio writeback is not implemented or approved.

### Webhooks/events

- Live webhook handling exists for Apaleo only.
- The webhook runtime stores events, claims processing, quarantines unsafe requests and avoids raw sensitive payloads in quarantine.
- Without configured validation, webhook processing fail-closes into quarantine.
- Ubikos webhook parsing, signature validation and event handling do not exist yet.

### Apaleo reference boundaries

Apaleo is useful as a working reference for Staynex's integration shape, but it must not be copied blindly into Ubikos. The reusable part is the provider contract, tenant isolation, safe sync behavior and operational flow. The Apaleo-specific part is its own auth, endpoint model, status vocabulary, headers, event names and payload shape.

| Capability | Generic Staynex contract | Apaleo-specific |
| --- | --- | --- |
| Connection config | Store provider config per Staynex hotel in `hotel_pms_connections`; keep credentials server-side and expose only sanitized DTOs. | Client id, encrypted client secret, account/property identifiers and Apaleo-specific connection metadata. |
| Auth | Provider adapter owns server-side auth/session behavior and returns safe connection health. | Apaleo OAuth/client credential flow, token endpoint, scopes and bearer header behavior. |
| Test connection | Run a read-only provider call that proves credentials and property mapping without importing data. | Apaleo account/property API calls and Apaleo response shape. |
| Reservations fetch | Adapter supports reservation list/fetch by id/date/updated window with pagination and bounded retries. | Apaleo reservation endpoints, query parameters, expansion options and status filters. |
| Reservation normalize | Convert provider fields into Staynex reservation identity, dates, status, guest contact and stay context. | Apaleo field names for booking, booker, unit group, rate plan and status. |
| Guest normalize | Extract primary guest/booker/contact data safely and avoid unnecessary sensitive history. | Apaleo booker/guest model and selected contact fields. |
| Rooms/status | Normalize assignment and operational status into existing room/stay context services when data exists. | Apaleo unit/unit group semantics and any Apaleo room/status endpoints. |
| Folio | Optional read-only folio summary behind connector method; not required for first pilot. | Any Apaleo folio/balance endpoint shape and currency/line-item fields. |
| Webhook ingest | Verify signature, resolve tenant, claim event idempotently, quarantine unsafe input, then fetch/process resource. | Apaleo webhook headers, event names, validation requirements and payload layout. |
| Sync health/errors | Persist safe sync status, last success/failure and sanitized errors per connection. | Apaleo-specific error codes/messages before sanitization. |
| Writes | Pilot PMS integrations stay read-only unless separately approved. | Any Apaleo writeback capability remains outside the Ubikos pilot template. |

## Current Ubikos support in repo

| File | Purpose | Real/Mock | Production reachable |
| --- | --- | --- | --- |
| `.env.example` | Ubikos env placeholders: enabled, sandbox, read-only, base/API URL, credentials, hotel id, timeout. | Env flag / placeholder | No direct runtime; copied by operators only. |
| `package.json` | Registers `test:pms:ubikos` and syntax checks for Ubikos files. | Test/config | No product behavior. |
| `README.md` | States Ubikos is safe read-only sandbox only. | Docs | No. |
| `docs/00-project-overview.md` | Project status mention. | Docs | No. |
| `docs/01-current-status.md` | States Ubikos is sandbox/mock and not live. | Docs | No. |
| `docs/02-technical-architecture.md` | Lists Ubikos adapter, normalizer and mock files. | Docs | No. |
| `docs/03-tech-stack.md` | Mentions Ubikos adapter sandbox. | Docs | No. |
| `docs/04-features.md` | Notes no live Ubikos claim. | Docs | No. |
| `docs/05-pms-integration.md` | PMS architecture and Ubikos phase 1 docs. | Docs | No. |
| `docs/06-automations.md` | States automation tests must not touch Ubikos. | Docs | No. |
| `docs/07-security-and-permissions.md` | States PMS integrations should be read-only until validated. | Docs | No. |
| `docs/08-deployment.md` | Deployment notes for Ubikos sandbox variables and not-live status. | Docs | No. |
| `docs/09-testing.md` | Documents `npm run test:pms:ubikos`. | Docs/test reference | No. |
| `docs/10-roadmap.md` | Roadmap item for future live Ubikos. | Docs | No. |
| `docs/11-known-limitations.md` | Known limitation: no real Ubikos API connected. | Docs | No. |
| `docs/13-project-folder-cleanup-audit.md` | Prior audit notes that Ubikos remains sandbox/read-only. | Docs/audit | No. |
| `docs/automation-runtime-phase-2a1-cancellation-safety.md` | Mentions shared terminal status normalizer. | Docs | No. |
| `docs/pms/ubikos-integration.md` | Existing Ubikos phase 1 integration notes. | Docs | No. |
| `src/integrations/pms/registry.js` | Registers Ubikos provider and connector. | Adapter interface | Yes: provider list/connector creation. No live Ubikos API. |
| `src/integrations/pms/ubikos/ubikos-pms-connector.js` | Wraps Ubikos adapter and exposes connector methods. Sync methods return skipped/read-only. | Mock/scaffolding | Potentially yes through registry; live sync disabled. |
| `src/services/pms/adapters/ubikos.adapter.js` | Ubikos adapter scaffold with health, search, arrivals/departures, in-house, rooms, guest profile and folio over mock data. | Mock/scaffolding | Potentially yes if instantiated; sandbox/mock only, live API not implemented. |
| `src/services/pms/normalizers/ubikos.normalizer.js` | Normalizes observed-style Ubikos reservation, guest, room, folio and hotel status shapes. | Adapter interface / mock-driven | Yes if adapter used; not a live client. |
| `src/services/pms/mocks/ubikos.mock.js` | Mock reservations, guests, rooms, folios and hotel status. | Mock/fixture | Potentially via sandbox adapter only. |
| `dashboard/lib/pms-providers.js` | Dashboard PMS provider catalog includes Ubikos setup available/manual setup. | UI placeholder/catalog | Yes: UI catalog only. |
| `dashboard/components/PmsConnectionsClient.js` | PMS settings UI allows provider setup; copy says Ubikos is beta/coming-soon and no writeback. | UI placeholder | Yes: save/test/sync UI, but backend keeps Ubikos pending setup. |
| `dashboard/lib/platform.js` | Platform console readiness copy includes Ubikos. | UI placeholder/status | Yes: dashboard summary only. |
| `dashboard/components/PlatformConsoleClient.js` | Platform UI label for Morocco readiness. | UI placeholder | Yes: text only. |
| `dashboard/lib/automation-test-center.js` | Demo/sandbox safety flag `ubikosTouched: false`. | Demo/test center | Yes: QA preview logic; no provider call. |
| `dashboard/components/AutomationTestCenter.js` | UI safety copy/check that Ubikos is untouched. | UI/demo | Yes: UI only; no provider call. |
| `scripts/test-pms-ubikos.js` | Validates Ubikos sandbox adapter, normalizers, mocks, read-only fail-closed. | Test | No production runtime. |
| `scripts/test-platform-management-academy-pms.js` | Asserts Ubikos is registered and safe sandbox/read-only. | Test | No. |
| `scripts/test-dashboard-shared-tracing.js` | Checks secret-like Ubikos env handling. | Test | No. |
| `scripts/test-automation-test-center.js` | Asserts automation test center does not touch Ubikos. | Test | No. |
| `scripts/test-automation-runtime-foundation.js` | Clears Ubikos env and checks runtime foundation isolation. | Test | No. |
| `scripts/test-automation-runtime-phase2a1.js` | Imports Ubikos normalizer for status normalization test coverage. | Test | No. |
| `scripts/test-automation-runtime-phase2a2.js` | Uses sample Ubikos provider identifiers in automation runtime tests. | Test | No. |
| `scripts/test-automation-runtime-phase2b1.js` | Clears Ubikos env and asserts no provider contact in reconciler. | Test | No. |

### Current Ubikos gaps

#### Already reusable

- Provider registry and connector creation.
- Safe per-hotel PMS connection storage.
- Secret sanitization for dashboard/platform surfaces.
- Tenant-scoped reservation identity and collision checks.
- Reservation normalization/write path.
- Room status and operational context tables/services.
- PMS sync health checks.
- Apaleo webhook quarantine/claiming pattern that can inform, but not dictate, Ubikos webhooks.

#### Existing but mock-only

- Ubikos health check.
- Reservation search/detail.
- Arrivals, departures and in-house guests.
- Rooms and room status.
- Guest profile.
- Folio summary.
- Ubikos status/date/field normalizers.

#### Must implement after meeting

- Real Ubikos auth/client module.
- Confirmed endpoint client methods.
- Real `testConnection` behavior for Ubikos.
- Real `syncReservations` path for Ubikos inside existing `syncHotelReservations`/connector architecture.
- Pagination and rate-limit handling.
- Incremental sync using Ubikos timestamps or safe full-window polling fallback.
- Confirmed status enum mapping.
- Real room/status sync if provided.
- Optional webhook parser/validator/processor if Ubikos supports signed webhooks.
- External guest/room identity persistence decision.

#### Blocked pending Ubikos documentation

- Auth type and token lifecycle.
- Base URL and sandbox URL.
- Property/hotel identity model.
- Reservation/guest/room endpoint schemas.
- Update timestamp semantics.
- Status enums.
- Webhook security and retry behavior.
- Rate limits and error codes.
- Sandbox credentials and test property.

#### Not needed for pilot

- PMS writes.
- Reservation modifications in Ubikos.
- Check-in/check-out actions in Ubikos.
- Room assignment writes.
- Housekeeping status writes.
- Folio/charge/payment writes.
- Guest Memory.
- UI scraping.
- Webhook-only sync.

## Pilot scope

Pilot PMS integration should be read-only:

- read reservations;
- read primary guest/contact details needed for WhatsApp and dashboard display;
- read room assignment if available;
- read room status/housekeeping if available;
- ingest reservation changes through polling first, and webhooks later only if officially validated;
- store normalized data in Staynex tenant-scoped tables;
- drive dashboard, reception, AI context and automation previews from Staynex's normalized DB.

Staynex can pilot without PMS write permissions.

Features that would genuinely require future PMS writes:

- modifying reservation dates, status or guest details inside Ubikos;
- check-in/check-out from Staynex into Ubikos;
- creating charges, payments, folio lines or invoices;
- assigning/changing rooms;
- writing housekeeping/maintenance state back to Ubikos;
- changing rates, availability or channel inventory.

These are out of pilot scope.

## Read-only data requirements

### Minimum hotel/property data

- stable Ubikos property/hotel identifier;
- display name if available;
- timezone/location only if Ubikos is authoritative and this will improve scheduling.

Do not request chain-wide data unless the credential model requires it.

### Minimum reservation data

- PMS reservation id;
- status;
- arrival/check-in date;
- departure/check-out date;
- created timestamp if available;
- updated timestamp if available;
- room id and/or room number if assigned;
- room type;
- adult count;
- child count;
- primary guest link or embedded primary guest;
- booking channel/source if available;
- rate plan/board basis if available.

Rate/amount is not required for the first technical pilot unless the hotel wants revenue analytics from PMS. Folio/balance is useful later, not a blocker for initial reservation sync.

### Minimum guest data

- Ubikos guest id if available;
- first name / last name / display name;
- phone;
- email;
- language;
- country.

Phone data must be sufficient to normalize safely for WhatsApp later. Guest Memory remains OFF; do not request historical preference fields for pilot.

### Minimum room/stay data

- room identifier if available;
- room number/name;
- room type;
- current reservation/stay link if available;
- occupancy state if available;
- housekeeping state if available.

Housekeeping is nice to have. It should not block the first read-only reservation pilot.

### Data not needed for pilot

- payment cards or payment tokens;
- passport/ID document numbers;
- date of birth;
- full postal address;
- detailed invoices and tax documents;
- unrestricted free-text guest notes;
- historical guest preferences;
- companion PII beyond counts unless Ubikos requires it for primary guest resolution;
- PMS user accounts or staff permissions unrelated to API access;
- write scopes for reservations, rooms, folios, charges, payments, rates or availability.

## Reservation contract

Staynex needs to answer these PMS questions from Ubikos data:

- Who is arriving, departing or in-house?
- Which reservation belongs to which Staynex hotel?
- Which guest/contact can be linked to WhatsApp?
- What is the reservation status?
- What are the arrival/departure dates?
- Which room/room type is assigned?
- Did the reservation change since the last sync?
- Was it cancelled/no-show/checked-out?

Required endpoint capabilities:

| Capability | Pilot rank | Reason |
| --- | --- | --- |
| Fetch reservation by id | MUST HAVE | Needed for webhook follow-up and manual reconciliation. |
| List reservations by date range | MUST HAVE | Needed for initial import and polling. |
| Updated/modified-since filter | MUST HAVE for robust polling | Enables efficient incremental sync. If absent, fallback is full-window polling with strict limits. |
| Pagination | MUST HAVE | Prevents partial imports and rate-limit surprises. |
| Status filter or status field | MUST HAVE | Needed for cancellations, no-shows, in-house and checkout behavior. |
| Arrivals filter | NICE TO HAVE | Can be derived from date range if not native. |
| Departures filter | NICE TO HAVE | Can be derived from date range if not native. |
| In-house/current stays endpoint | NICE TO HAVE | Useful for reception and room context; derivable from status/dates if reliable. |
| Reservation create/update/cancel endpoints | NOT NEEDED FOR PILOT | Would require PMS write scope. |
| Rate/availability management | NOT NEEDED FOR PILOT | Not part of Staynex pilot scope. |

Important current Staynex gap: the Ubikos normalizer emits `room_number`, but the current common `createOrUpdateReservation` record does not persist `room_number` into `reservations`. For the pilot, decide whether room assignment should be stored in `guest_stay_context` / `room_status_snapshots`, added to the reservation storage path in a future reviewed change, or sourced from a separate room/status sync.

## Guest contract

Ubikos must clarify whether guest data is:

- embedded in the reservation payload;
- available through a separate guest endpoint;
- both.

Minimum behavior:

- identify the primary guest/booker;
- expose phone in a consistent format or with enough country context to normalize;
- expose email if available;
- expose preferred language if available;
- expose country/nationality as a non-document attribute if available;
- mark deleted/anonymized/privacy-restricted guests safely.

Questions to resolve:

- What is the difference between booker, primary guest and companions?
- Is phone stored as E.164, national format, or split country code + number?
- Can phone be missing even when email exists?
- Are guest IDs globally unique or property-scoped?
- Can a single guest ID appear across properties?
- How does Ubikos represent anonymized/deleted guests?
- Are guest notes/preferences included by default, and can they be excluded?

Staynex should not import Guest Memory or preference history for this pilot.

## Room contract

Separate two concepts:

- Reservation room assignment: the room attached to a booking/stay.
- Operational room status: housekeeping, maintenance, occupancy and availability state.

Minimum required:

- room id or stable room key if available;
- room number/name shown to staff;
- room type;
- room assignment on reservation if available.

Useful but optional:

- occupancy status;
- housekeeping status;
- maintenance/out-of-order status;
- blocked/held status;
- next arrival or departure marker;
- last status update timestamp.

Staynex can begin with reservation room assignment only. Native housekeeping/maintenance sync can be a later pilot enhancement.

## Authentication questions

Do not assume Ubikos uses the same auth model as Apaleo.

Specific questions for Ubikos:

- What authentication type is supported: API key, bearer token, OAuth, username/password token exchange, mTLS, IP allowlist, or another official flow?
- Are credentials issued per hotel/property, per chain/account, or per integration partner?
- What scopes/permissions can be granted for read-only access?
- Is there a sandbox credential set?
- Is there a separate sandbox base URL?
- What is the token lifetime?
- Is refresh supported?
- How should tokens be rotated?
- Are credentials revocable per property?
- Is IP allowlisting required?
- Are webhook secrets separate from API credentials?
- Are there audit logs or integration access logs available to the hotel?
- What error is returned for disabled credentials, expired token, invalid scope and property mismatch?

Staynex storage can hold client credentials, API key-like credentials and webhook secrets securely, but the actual Ubikos adapter must be implemented only after the official auth contract is known.

## Property/multi-hotel questions

Critical identity questions:

- Does one credential access one hotel or several hotels?
- What is the stable property identifier?
- Is there a property listing endpoint?
- Are property IDs stable across sandbox and production?
- Are reservation IDs globally unique or only unique within a property?
- Are guest IDs globally unique or property-scoped?
- Are room IDs globally unique or property-scoped?
- Can two hotels use the same reservation locator/id?
- Can one chain credential access multiple properties with overlapping reservation IDs?
- Does every reservation payload include the property identifier?
- Does every webhook/event payload include the property identifier?

Conservative Staynex identity must remain:

`hotel_id + provider + external id`

For webhooks/events, the conservative identity should be:

`hotel_id + provider + connection_id + external_event_id`

unless Ubikos proves stronger guarantees.

## Webhook questions

Useful events if Ubikos supports them:

- reservation created;
- reservation updated/amended;
- reservation cancelled;
- no-show;
- check-in;
- check-out;
- room assignment changed;
- room status changed;
- housekeeping/maintenance status changed.

Webhooks are not required for the first technical connection if polling/incremental sync is available.

Specific questions for Ubikos:

- Are webhooks supported for PMS reservations?
- Which event names are emitted?
- Does each event include a stable event ID?
- Does each event include reservation ID and property ID?
- Is ordering guaranteed?
- Are events delivered at least once?
- What is retry behavior and retry duration?
- Is there a signature or HMAC header?
- What exact bytes are signed?
- Is timestamp tolerance required?
- Can Staynex rotate webhook secrets?
- Can Ubikos replay or manually resend events?
- Are sandbox events available?
- Are payloads full reservation snapshots or minimal resource references?
- If payloads are minimal, can Staynex fetch reservation by id immediately after the event?
- What happens if a reservation is deleted/cancelled and fetch-by-id returns 404?

Activation rule: Ubikos live webhooks should remain OFF until signature validation, tenant resolution, event idempotency and quarantine behavior are implemented and tested.

## Sync strategy

Recommended first pilot strategy: **A. initial full import + polling/incremental sync**.

| Strategy | Recommendation | Notes |
| --- | --- | --- |
| A. Initial full import + polling/incremental | Preferred | Simple, robust and does not depend on live webhook certification. |
| B. Initial import + webhooks | Good second step | Use after Ubikos webhook auth/retry/payload semantics are proven. |
| C. Webhooks only | Not recommended for first pilot | Missed events, disabled webhooks or ordering issues can leave Staynex stale. |

Suggested pilot sync behavior:

- initial import window: today minus 30 days through today plus 180 days, adjustable by hotel volume;
- dashboard manual sync can remain narrower for operator-triggered runs;
- incremental polling interval: start conservative, e.g. 10-15 minutes, then tune with Ubikos rate limits;
- if `modified_since` exists, poll modified reservations since last successful sync with overlap;
- if `modified_since` does not exist, poll a rolling active window and upsert idempotently;
- always include cancellations/no-shows/status changes;
- treat date changes as updates that can reschedule internal Staynex automation previews;
- use tenant-scoped identity before every mutation;
- store safe sync summaries and sanitized errors only;
- fail closed on auth errors, ambiguous property mapping, missing reservation id or tenant collision;
- no Twilio send or automatic automation runtime activation should be coupled to initial PMS sync.

Idempotency:

- reservation import: `hotel_id + provider + pms_reservation_id`;
- room snapshot: `hotel_id + room_number`;
- occupancy snapshot: `hotel_id + date`;
- webhook/event claim if enabled later: `provider + connection_id + external_event_id`.

Failure behavior:

- keep existing local reservation rows unless a confirmed status update says cancelled/no-show/deleted;
- record safe sync status and sanitized error;
- do not expose provider secrets or raw unsafe payloads;
- retry only bounded/idempotent read operations;
- leave human fallback for stale/failed sync until automated recovery is separately reviewed.

## Proposed mapping

Do not invent Ubikos field names. All Ubikos source fields below are placeholders to confirm with Ubikos.

| Staynex field | Meaning | Ubikos field required | Required? |
| --- | --- | --- | --- |
| `hotel_pms_connections.provider` | PMS provider key | Constant `ubikos` | Yes |
| `hotel_pms_connections.hotel_id` | Staynex tenant/hotel | Staynex internal mapping | Yes |
| `hotel_pms_connections.property_id` / `account_code` | External Ubikos property identifier | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `hotel_pms_connections.base_url` | Ubikos base/API URL | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| encrypted credential fields / metadata | Auth credentials | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.pms_provider` | PMS provider key on reservation | Constant `ubikos` | Yes |
| `reservations.pms_reservation_id` | Stable PMS reservation id | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.status` | Normalized lifecycle status | `TO_CONFIRM_WITH_UBIKOS` status enum | Yes |
| `reservations.arrival_date` | Arrival/check-in date | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.departure_date` | Departure/check-out date | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.guest_name` | Primary guest/booker display name | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.guest_phone` | Contact phone for WhatsApp linking | `TO_CONFIRM_WITH_UBIKOS` | Yes if WhatsApp onboarding depends on PMS |
| `reservations.guest_email` | Contact email | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `reservations.room_type` | Room/unit type | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.rate_plan` | Rate plan/commercial context | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `reservations.board_basis` | Meal plan context | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `reservations.adults` | Adult count | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.children` | Child count | `TO_CONFIRM_WITH_UBIKOS` | Yes |
| `reservations.source` | Import/source marker | Staynex constant `ubikos_sync` or `ubikos_webhook` | Yes |
| `reservations.notes` | Minimal operational notes | `TO_CONFIRM_WITH_UBIKOS` | Avoid unless clearly needed |
| `guest_stay_context.room_number` | Assigned room for stay context | `TO_CONFIRM_WITH_UBIKOS` | Yes if room assigned |
| `guest_stay_context.language` | Guest/reservation language | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `guest_stay_context.country` | Country/nationality context without documents | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `guest_stay_context.raw_payload.pms_reservation_id` | Trace to PMS reservation | `TO_CONFIRM_WITH_UBIKOS` reservation id | Yes |
| `room_status_snapshots.room_number` | Staff-facing room number/name | `TO_CONFIRM_WITH_UBIKOS` | Yes for room sync |
| `room_status_snapshots.room_type` | Room type | `TO_CONFIRM_WITH_UBIKOS` | Nice to have |
| `room_status_snapshots.housekeeping_status` | Clean/dirty/inspected/unknown | `TO_CONFIRM_WITH_UBIKOS` housekeeping enum | Optional for pilot |
| `room_status_snapshots.maintenance_status` | OK/maintenance/out-of-order/unknown | `TO_CONFIRM_WITH_UBIKOS` maintenance enum | Optional for pilot |
| `room_status_snapshots.occupancy_status` | Occupied/vacant/arriving/departing/unknown | `TO_CONFIRM_WITH_UBIKOS` room occupancy enum | Optional if derivable |
| `room_status_snapshots.current_reservation_id` | Link to Staynex reservation | Derived from imported reservation | Nice to have |
| `hotel_occupancy_snapshots.occupancy_percent` | Hotel occupancy context | `TO_CONFIRM_WITH_UBIKOS` or derived | Nice to have |
| `hotel_occupancy_snapshots.occupied_rooms` | Occupied rooms count | `TO_CONFIRM_WITH_UBIKOS` or derived | Nice to have |
| `hotel_occupancy_snapshots.available_rooms` | Available rooms count | `TO_CONFIRM_WITH_UBIKOS` or derived | Nice to have |
| `pms_webhook_events.external_event_id` | Idempotent event id | `TO_CONFIRM_WITH_UBIKOS` | Required only if webhooks enabled |
| `pms_webhook_events.external_resource_id` | Reservation/resource id from event | `TO_CONFIRM_WITH_UBIKOS` | Required only if webhooks enabled |
| `pms_webhook_events.event_type` | Provider event name | `TO_CONFIRM_WITH_UBIKOS` | Required only if webhooks enabled |
| `pms_webhook_events.event_action` | Normalized action | Derived from Ubikos event type | Required only if webhooks enabled |

## Questions for Ubikos

### Access

- Can Ubikos provide a read-only API integration for a pilot hotel?
- Is access enabled directly for the hotel, by Ubikos support, or through an integration partner process?
- Can Staynex receive a sandbox/test property before production credentials?
- Is there a certification step before production access?

### Authentication

- What auth method is used?
- Are credentials per property or chain-wide?
- What read scopes are available?
- What token lifetime and refresh behavior should we implement?
- Is IP allowlisting required?
- How are credentials rotated/revoked?
- Is there a separate webhook secret?

### Hotels/properties

- What is the stable property identifier?
- Can one credential list properties?
- Does every reservation response include property id?
- Are reservation, guest and room IDs property-scoped or global?
- Can locator/reference values repeat across properties?

### Reservations

- Which endpoint lists reservations by date range?
- Which endpoint fetches one reservation by id?
- Is there `updated_since` / modified-since filtering?
- How does pagination work?
- What status enum values exist?
- How are cancelled, no-show, checked-in and checked-out reservations represented?
- Are date changes reflected through `updated_at`?
- Is primary guest embedded, linked, or both?

### Guests

- How is primary guest distinguished from booker and companions?
- What phone format is returned?
- Is country code always present?
- Can email/phone be missing?
- Is language available?
- How are anonymized/deleted guests represented?
- Can preference/note fields be excluded from read responses?

### Rooms

- Are assigned room and room type included on reservation?
- Is there a room list endpoint?
- Is there a room status endpoint?
- What are housekeeping status enum values?
- What are maintenance/out-of-order status enum values?
- Are room IDs stable and property-scoped?

### Webhooks

- Are webhooks supported?
- Which reservation and room events exist?
- Does each event include event ID, property ID and reservation/resource ID?
- Is the payload a full snapshot or a pointer?
- What signature/HMAC scheme is used?
- What is retry behavior?
- Can events be replayed manually?
- Are sandbox webhook events available?

### Rate limits

- What are per-minute/per-hour limits?
- Are limits per credential, per property, or per endpoint?
- What headers expose remaining limit/retry-after?
- Which HTTP status codes are retryable?
- Are bulk export endpoints available?

### Sandbox

- What sandbox base URL should we use?
- Can the sandbox contain realistic arrivals, departures, cancellations, room changes and anonymized guests?
- Can Ubikos provide fixed sample payloads for automated tests?
- Is sandbox data resettable?

### Support / incidents

- Who is the technical contact during pilot?
- What is the escalation channel for production API incidents?
- Is there a status page?
- Are API incidents reported to hotel admins?
- Are breaking changes versioned and announced?

### Commercial/API terms

- Are there API usage fees?
- Are there contractual restrictions on storing normalized reservation/contact data in Staynex?
- Are there data retention requirements?
- Is subprocessor/GDPR documentation available?
- Is production API use allowed for read-only WhatsApp concierge workflows?

## Documents/access requested

Ask Ubikos to send:

- current API documentation;
- OpenAPI/Swagger spec if available;
- sandbox base URL;
- production base URL;
- authentication documentation;
- webhook documentation;
- sample reservation payloads;
- sample guest payloads;
- sample room/status payloads;
- sample webhook payloads and headers;
- status enum documentation;
- date/time/timezone rules;
- pagination rules;
- modified-since/incremental sync documentation;
- rate limits;
- error code model;
- test property credentials;
- support contact and escalation path;
- API commercial/usage restrictions;
- data processing / GDPR / retention terms.

## Definition of Done

Ubikos integration ready for pilot means:

1. Ubikos credentials are securely saved in `hotel_pms_connections`.
2. `testConnection` for Ubikos succeeds against sandbox and/or approved production read-only API.
3. Staynex hotel to Ubikos property mapping is explicit and stable.
4. Reservation import reads from Ubikos and writes normalized Staynex reservations.
5. Every imported row is scoped to the correct `hotel_id`.
6. Primary guest is normalized safely.
7. Guest phone is normalized safely for later WhatsApp use.
8. Room assignment is normalized into an agreed Staynex storage path.
9. Cancelled/no-show/deleted reservations are handled.
10. Arrival/departure date changes are handled.
11. Repeat sync is idempotent.
12. Cross-hotel reservation ID reuse is blocked.
13. Sync errors are safe, observable and do not expose secrets.
14. Rate limits and pagination are handled.
15. No PMS writeback exists in pilot mode.
16. Guest Memory remains OFF.
17. Automations remain preview/disabled unless separately approved.
18. Live webhooks are optional and remain OFF until signature validation and event idempotency are separately certified.

## Implementation phases

### Phase U1 - Ubikos contract capture

Complexity: LOW.

- Review official docs, sample payloads and sandbox access.
- Confirm auth, property model, endpoint list, status enums, rate limits and webhook support.
- Finalize minimal data contract and fields to exclude.

### Phase U2 - Real read-only client and mapping

Complexity: MEDIUM.

- Implement provider-specific Ubikos auth/client inside existing adapter architecture.
- Add endpoint methods for reservations, reservation by id, guests and rooms/status as available.
- Update normalizers using confirmed Ubikos fields.
- Keep writeback blocked.

### Phase U3 - Tenant-scoped reservation sync

Complexity: MEDIUM.

- Wire Ubikos into `testPmsConnection` and `syncHotelReservations`.
- Use explicit hotel/property mapping.
- Import initial window and incremental changes idempotently.
- Persist safe sync summaries and sanitized errors.

### Phase U4 - Operational room/status enrichment

Complexity: MEDIUM.

- Normalize room assignment and status into `guest_stay_context` and `room_status_snapshots`.
- Decide whether any reservation storage change is needed for `room_number`.
- Validate reception, inbox and dashboard behavior on pilot data.

### Phase U5 - Optional webhooks

Complexity: HIGH.

- Implement Ubikos webhook parser and signature validation only if Ubikos supports signed webhooks.
- Store scoped event claims and quarantine invalid/ambiguous events.
- Process create/update/cancel/check-in/check-out events idempotently.
- Certify separately before live activation.

## Risks

### P0

- Ubikos has no usable official API for required read-only reservation data.
- No sandbox or test property is available.
- Auth model cannot support secure server-side read-only integration.
- Property identity is ambiguous or missing from reservation/event payloads.
- Reservation IDs are not stable, not unique per property, or can collide without property context.
- Webhooks are required by Ubikos but lack signature/event ID/property ID guarantees.

### P1

- No modified-since/incremental endpoint, forcing expensive rolling full-window polling.
- Pagination or rate limits are undocumented.
- Cancellation/no-show/date-change status semantics are unclear.
- Guest phone data is missing, unnormalized or lacks country code.
- Guest/booker/companion distinction is unclear.
- Room assignment and room status are separated inconsistently.
- Provider errors may include sensitive raw data unless sanitized.

### P2

- Housekeeping/maintenance status is not available for pilot.
- Folio/balance data is incomplete or low quality.
- External guest IDs cannot be stored without a small schema/design follow-up.
- Existing reservation storage path does not persist `room_number` directly.
- Dashboard copy says setup available, but real activation still needs technical implementation.
- Sandbox payloads differ from production payloads.

## Decisions pending Ubikos

- Final auth method.
- Sandbox and production base URLs.
- Credential scope: one hotel vs multi-property account.
- Stable property identifier.
- Reservation ID uniqueness scope.
- Guest ID uniqueness scope and storage decision.
- Room ID uniqueness scope and storage decision.
- Whether `room_number` should be persisted on reservations or only operational context.
- Whether guest data is embedded, separate, or both.
- Whether modified-since sync is available.
- Initial import window and polling interval after rate limits are known.
- Whether webhooks exist and whether they are safe enough to certify later.
- Whether folio should remain out of scope for first pilot.
- Final list of excluded sensitive fields.
