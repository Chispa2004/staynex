# Current Status

Audit date: 2026-07-15

Status labels used in this document:

- Production-ready: implemented and suitable for controlled production use when configured.
- Pilot-ready: implemented, but should be validated with a first real hotel.
- Sandbox/mock: implemented for simulation, QA or demo data only.
- Prepared but disabled: architecture exists, but real execution is off by default.
- Pending external dependency: blocked by third-party credentials, API documentation or operational approval.
- Future roadmap: designed direction, not a completed current feature.

## Status Matrix

| Area | Status | Notes |
| --- | --- | --- |
| Platform Admin | Pilot-ready | Multi-hotel platform context, hotels, providers, monitoring and AI Quality exist. Needs operational governance before external team use. |
| Hotel Workspace | Pilot-ready | Dashboard, Inbox, Tickets, Reception, Health, QR Rooms, Knowledge, Academy and Experience Bookings are implemented. |
| WhatsApp / Twilio | Pending external dependency | Twilio integration exists. Real hotel numbers and onboarding must be configured per hotel. |
| AI Concierge | Pilot-ready | OpenAI and mock AI paths exist. Production quality depends on prompts, data quality and enabled model configuration. |
| Human Takeover | Pilot-ready | Reception/manager/admin can pause AI per conversation. AI can remain as silent copilot. |
| Tickets | Pilot-ready | Ticket creation, status updates and operational routing exist. |
| Reception / Pre Check-in | Pilot-ready | Read-only reservation/guest operational view exists. PMS data quality determines usefulness. |
| Hotel Health | Pilot-ready | Hotel-facing operational health is implemented with simple warnings. |
| Platform Monitoring | Pilot-ready | Internal observability exists for platform admins. |
| AI Logs | Pilot-ready / internal | Useful for QA and debugging. Not intended as a normal hotel user screen. |
| AI Quality / Failure Intelligence | Sandbox/mock | Internal QA tool for simulations, long journeys and failure classification. Not hotel-facing. |
| Simulation Mode | Sandbox/mock | Internal-only simulated hotels, guests, conversations and journeys. No real WhatsApp/PMS actions. |
| Automation Engine | Pilot-ready / prepared but guarded | Playbooks, priorities, cooldowns, fatigue guard, dedupe and Test Center exist. Real sends are controlled by environment flags. |
| Automation Test Center | Sandbox/mock | Dry-run previews and internal QA. Does not touch real PMS or Ubikos. |
| Pre-checkout Folio Reminder | Prepared but disabled | Logic exists, requires real PMS folio data and should remain preview until first hotel validation. |
| Post-stay Review Intelligence | Prepared but disabled | Positive/private/quality flows exist. Real sends are guarded. |
| Experience Providers | Pilot-ready | Provider catalog, experiences, assignment and provider request flow exist. Requires real provider data. |
| Experience Booking Requests | Pilot-ready | Guest-confirmed provider request flow exists. Provider email delivery depends on configured email mode/provider. |
| PMS Layer | Sandbox/prepared | PMS adapters and normalizers exist. Full multi-PMS orchestration is future roadmap. |
| Apaleo | Partially implemented | Apaleo-specific integration files exist. Confirm production credentials and scope before calling it live. |
| Ubikos | Sandbox/mock | Adapter, normalizer, mocks, health and tests exist. No official API or real credentials connected yet. |
| Pluriel/Mews/Cloudbeds/etc. | Prepared placeholder | Connector structure exists, not full real API integrations. |
| Google Sheets Sync | Prepared | Service and jobs exist. Requires service account variables and spreadsheet access. |
| Embedded Signup | Future roadmap / pending | No completed embedded WhatsApp/PMS signup should be claimed from current code. |
| Multi-language Dashboard | Pilot-ready | ES/EN/FR/DE UI translation system exists, but continuous QA is recommended. |
| Multi-hotel Isolation | Pilot-ready | Active hotel context and platform workspace flow exist; keep testing when adding routes. |

## Important Clarifications

### WhatsApp

Twilio WhatsApp services exist in the backend, but real use depends on configured Twilio credentials, hotel sender numbers and webhook setup. Guest-facing automations should remain guarded until pilot validation.

### Automations

Automations include playbooks, priority, fatigue guard, cooldowns, deduplication and preview mode. The Automation Test Center is safe and dry-run oriented. Real sending is controlled by variables such as `SEND_AUTOMATIONS`, `AUTOMATION_TEST_SEND_ENABLED` and channel/provider configuration.

### Ubikos

Ubikos is not connected to a live PMS. Current work is a safe Phase 1:

- read-only adapter;
- normalizers;
- realistic mocks;
- health check;
- tests;
- environment variables;
- documentation.

No write actions, check-in/check-out actions, room changes, charges or scraping are implemented.

### Providers

The provider marketplace and experience request flow exist. Production use requires real providers, emails, terms, operational SLAs and revenue configuration.

### AI Quality and Simulation

These are internal Staynex tools. They should not be presented as hotel-facing functionality.

