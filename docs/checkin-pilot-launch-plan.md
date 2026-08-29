# Checkin Pilot Launch Plan

## Scope

First pilot scope is one hotel only. The hotel is not named yet.

Staynex will run as a read-only operational layer for:

- WhatsApp guest messaging;
- AI Concierge and AI Copilot;
- Inbox;
- Tickets;
- Knowledge;
- read-only PMS context when the PMS connection is available.

Out of scope for the first pilot:

- Guest Memory;
- PMS writeback;
- live PMS webhooks at launch;
- billing, pricing or self-service commercial signup;
- new experimental workflows.

## Operating Mode

PMS stays read-only. Staynex may import or read reservation context, but it must not update reservations, rooms, folios, charges, payments, rates or availability in the PMS.

Live PMS webhooks stay OFF initially. The first safe sync model should be initial import plus polling/incremental sync. Webhooks can be certified later only after signature validation, tenant resolution and idempotent event handling are proven.

Guest Memory stays OFF for the pilot. `GUEST_MEMORY_ENABLED=true` is not approved.

PMS writeback stays OFF for the pilot.

## Journeys

Limit the first pilot to 3-4 journeys maximum:

1. Pre-arrival WhatsApp welcome / concierge access.
2. In-stay guest request to Inbox and Tickets.
3. Reception human takeover / fallback path.
4. Optional local recommendation or experience request after hotel approval.

Do not add more journeys until the first hotel is stable.

## Required Gates

Human Fallback is mandatory before go-live.

Minimum requirement:

- named owner on the hotel side;
- named Staynex owner;
- clear operating hours or escalation rule;
- manual takeover path tested in Inbox;
- failure case rehearsed before first guest use.

Kill Switch is mandatory before go-live.

Minimum requirement:

- clear owner allowed to pause guest-facing automation;
- documented switch-off path;
- confirmation that AI can continue as copilot without automatic guest replies;
- rollback/recovery path tested before launch.

## Monitoring

Minimum monitoring before go-live:

- WhatsApp inbound/outbound health;
- Inbox backlog and human takeover count;
- urgent/open tickets;
- PMS sync status once PMS is connected;
- automation send state;
- AI fallback/error signals;
- manual incident log during pilot week.

## War Room

Create a pilot war room for launch week.

Expected participants:

- Checkin hotel owner/operator;
- Staynex product/engineering owner;
- operations/support owner;
- PMS contact if Ubikos or another PMS is involved;
- Twilio/WhatsApp setup owner if external configuration is still active.

Launch cadence:

- pre-launch checklist review;
- go-live decision;
- first-day active monitoring;
- daily review during the first pilot week;
- closeout with blockers, fixes and expansion decision.

## Go-Live Gate

Go-live requires:

- hotel profile valid;
- at least one active admin or manager;
- PMS real connected or an explicit approved no-PMS pilot decision;
- WhatsApp configured for real guest messaging;
- Knowledge active;
- Guest Memory OFF;
- PMS writeback OFF;
- live PMS webhooks OFF initially;
- security baseline confirmed;
- Human Fallback validated;
- Kill Switch validated;
- 3-4 pilot journeys certified;
- minimum observability and failure rehearsal complete.

Do not declare Ready for Go-Live while Ubikos is still waiting for API access/documentation unless the pilot is explicitly approved to start without PMS.

## Success Criteria

Pilot success is measured by:

- first hotel fully configured without false ready state;
- WhatsApp conversations handled without missed critical escalation;
- Inbox and Tickets used by staff during real operations;
- AI Concierge gives useful answers from approved Knowledge;
- Human Fallback works when AI should not reply automatically;
- Kill Switch can pause guest-facing behavior quickly;
- no PMS writes occur;
- no Guest Memory behavior occurs;
- operational blockers are visible and actionable;
- hotel team confirms the workflow is usable for the next controlled expansion.
