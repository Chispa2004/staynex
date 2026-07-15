# Security and Permissions

Audit date: 2026-07-15

## Roles

Hotel roles:

- owner/admin;
- manager;
- receptionist;
- housekeeping;
- maintenance;
- analyst.

Platform roles:

- super_admin;
- platform_admin;
- internal_only;
- support;
- none.

## Permission Model

Route and feature permissions are defined in `dashboard/lib/permissions.js`.

Hotel users should only see hotel workspace tools. Platform admins can access platform tools and enter hotel workspaces. Internal tools such as Simulation Mode, Platform Monitoring and AI Quality are restricted to platform/internal roles.

## Tenant Isolation

The system uses active hotel context and hotel IDs to isolate workspaces. Platform admins can switch hotels, but the selected hotel ID must be carried through dashboard APIs and views.

Known requirement:

- every new dashboard/API route must be checked for hotel ID filtering.

## Platform Admin

Platform admins can:

- see platform console;
- manage hotels;
- manage providers;
- access monitoring;
- run internal AI Quality tools;
- enter hotel workspaces.

They should have a visible route back to Platform when inside a hotel workspace.

## Manager and Receptionist

Managers have broad operational access.

Receptionists have operational access but should not access advanced settings, PMS setup, WhatsApp setup, platform internals, billing, AI Quality or Simulation Mode.

Receptionists can use:

- Inbox;
- Tickets;
- Reception / Pre Check-in;
- QR Rooms read-only;
- Knowledge/Local Knowledge operational content;
- Receptionist Academy;
- Experience Bookings tracking/notes where allowed.

## Human Takeover

Human Takeover pauses AI auto-replies for a conversation. It must block:

- automatic AI guest replies;
- automations;
- revenue upsells;
- provider automatic actions.

AI can still provide silent copilot suggestions.

## Safe Preview

Simulation Mode, Automation Test Center and AI Quality are designed for safe preview/testing. They should not contact real guests or live PMS systems.

## Read-only PMS

PMS integrations should be read-only until explicitly validated. Ubikos is currently read-only sandbox architecture only.

## Sensitive Variables

Sensitive values include:

- Supabase service role key;
- OpenAI API key;
- Twilio auth token;
- Resend API key;
- Google Sheets private key;
- PMS credentials;
- SMTP credentials.

These must remain in environment variables and never be committed.

## Git Ignore Status

The repository ignores:

- `.env`
- `.env.*` except examples
- `dashboard/.env.local`
- `node_modules`
- `.next`
- build/cache outputs
- logs
- OneDrive/Next corruption folders

Risk: unrelated untracked folders exist inside the repository root and should be moved or ignored.

## Known Risks

- UI permission hiding must always be backed by API/server checks.
- Platform admins entering hotel workspaces require strict active hotel context.
- PMS data quality can affect AI/automation safety.
- Real WhatsApp sends must remain guarded until operational approval.
- Untracked external projects under the repo root may accidentally be added to Git.

