# Ubikos PMS Integration

## Objective

Prepare Staynex for a future Ubikos PMS integration without connecting to a live hotel yet.

This phase creates the adapter architecture, normalizers, realistic mocks, health checks and tests needed for a safe read-only integration path.

## Current Phase

Phase 1: read-only sandbox.

The integration is intentionally limited:

- No live write operations.
- No reservation modification.
- No check-in or check-out action.
- No room changes.
- No charge creation.
- No folio writeback.
- No UI scraping.

Staynex only prepares read methods and mock/sandbox responses until the official Ubikos API details are confirmed.

## Environment Variables

```env
UBIKOS_ENABLED=false
UBIKOS_SANDBOX=true
UBIKOS_READ_ONLY=true
UBIKOS_BASE_URL=https://cloud.ubikos.es
UBIKOS_API_BASE_URL=
UBIKOS_CLIENT_ID=
UBIKOS_CLIENT_SECRET=
UBIKOS_USERNAME=
UBIKOS_PASSWORD=
UBIKOS_HOTEL_ID=
UBIKOS_TIMEOUT_MS=15000
```

Never store real credentials in the repository.

## Data Needed From Ubikos

Staynex needs official API or integration documentation for:

- Reservations.
- Guest profiles.
- Arrivals and departures.
- In-house guests.
- Rooms and room status.
- Housekeeping status.
- Maintenance or blocked room status.
- Folio, charges, payments and balance due.
- Hotel occupancy snapshot.
- Webhook events, if available.

## Pending Endpoints To Confirm

The exact endpoints are not implemented yet. We need confirmation for:

- Authentication endpoint and token flow.
- Reservation search endpoint.
- Reservation detail endpoint.
- Guest detail endpoint.
- Arrivals endpoint.
- Departures endpoint.
- In-house guests endpoint.
- Rooms endpoint.
- Room status endpoint.
- Folio or room account endpoint.
- Webhooks or event subscriptions.

## Field Mapping

### Reservation

Ubikos reservation data is normalized into:

- `reservation_id`
- `locator`
- `status`
- `guest_name`
- `guest_phone`
- `guest_email`
- `room_number`
- `room_type`
- `arrival_date`
- `departure_date`
- `adults`
- `children`
- `board_basis`
- `agency`
- `channel`
- `balance_due`
- `currency`
- `notes`

### Guest

Ubikos guest data is normalized into:

- `guest_id`
- `name`
- `phone`
- `email`
- `language`
- `nationality`
- `preferences`
- `notes`
- `vip`
- `blacklist_flag`

### Room

Ubikos room data is normalized into:

- `room_number`
- `room_type`
- `status`
- `housekeeping_status`
- `maintenance_status`
- `blocked`
- `occupied`
- `guest_name`
- `current_reservation_id`
- `incidents`

Known status examples:

- `limpia`
- `sucia`
- `retenida`
- `fuera_servicio`
- `pickup`
- `bloqueada`
- `ocupada`
- `libre`

### Folio

Ubikos folio data is normalized into:

- `reservation_id`
- `currency`
- `total_charges`
- `total_paid`
- `balance_due`
- `charges[]`
- `payments[]`
- `warnings[]`

## Sandbox Mock Data

The phase 1 mock dataset includes observed-style Ubikos examples:

- Reservation `53108`.
- Guest holder `Cristian Cabre`.
- Room `302`.
- Room type `Vista mar DOUBLE ROOM`.
- Arrival `28-05-2026`.
- Departure `29-05-2026`.
- Status `CONFIRMADA`.
- Balance due `-188.00`.
- Agency `HOTEL (CLIENTES DIRECTOS)`.
- In-house room `203` with guest `Gregorio Pelai`.
- Room `308` retained because of tobacco smell.
- Hotel status snapshot with total, available and occupied rooms.

## Limitations

- Live Ubikos API calls are not implemented in phase 1.
- Sandbox mocks are only for Staynex QA and architecture validation.
- The adapter is fail-closed if read-only mode is disabled.
- Health check returns `not_configured` when credentials or API base URL are missing.
- No browser automation or HTML scraping is allowed.

## Future Integration Points

Once official API details are confirmed, the adapter can feed:

- Reception / Pre Check-in.
- Hotel Health.
- PMS Snapshot.
- Pre-checkout Folio Reminder.
- AI Concierge reservation context.
- Guest Intelligence.
- Operational dashboard metrics.

## Checklist For Real API Phase

- Confirm authentication method.
- Confirm reservation endpoint.
- Confirm guest endpoint.
- Confirm rooms endpoint.
- Confirm room status fields.
- Confirm folio and charge endpoint.
- Confirm arrivals/departures query format.
- Confirm webhooks available.
- Confirm event payloads.
- Confirm rate limits.
- Confirm sandbox permissions.
- Confirm production permissions.
- Confirm whether API is REST/JSON or requires another official integration path.
- Confirm data retention and GDPR requirements.
- Confirm whether Ubikos supports per-hotel API credentials.
