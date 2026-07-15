# Staynex

Staynex is an operational intelligence layer for hotels. It connects guest messaging, hotel operations, PMS context, tickets, automations, knowledge, revenue opportunities and experience providers in one operating system.

Staynex does not replace the PMS. The PMS remains the system of record. Staynex reads and interprets hotel context so reception, operations and management teams can work faster and communicate better with guests.

## Repository Structure

- `src/`: Express backend for WhatsApp, AI, PMS context, automations, tickets, providers and jobs.
- `dashboard/`: Next.js App Router dashboard and platform console.
- `supabase/`: SQL schema, migrations and seed/demo files.
- `scripts/`: local tests, checks and jobs.
- `docs/`: technical documentation, current status, roadmap and repository audit.

## Core Product Areas

- Staynex Platform: internal SaaS owner console for hotels, providers, monitoring and AI quality.
- Hotel Workspaces: dashboard, inbox, tickets, reception, health, automations, QR rooms and knowledge.
- Experience Providers: provider catalog, hotel assignments and guest booking requests.
- PMS Layer: read-oriented adapters, normalizers, mocks and PMS intelligence services.
- Automations: guarded playbooks, preview mode, fatigue guard, deduplication and test center.
- AI QA: Simulation Mode and Failure Intelligence for internal quality testing.

## Current Integration Notes

- Ubikos is prepared in safe read-only sandbox mode only. The adapter, normalizer, mocks, health check and tests exist, but no official API credentials or live endpoints are connected yet.
- Real automated guest sends should remain guarded until pilot approval. Use preview/dry-run and internal test numbers first.
- WhatsApp requires Twilio configuration and per-hotel onboarding.
- PMS data quality determines how safely Staynex can power Reception, AI context, folio reminders and automations.

## Stack

- Node.js / JavaScript ES modules.
- Express backend.
- Next.js App Router dashboard.
- React 19.
- Tailwind CSS.
- Supabase PostgreSQL/Auth.
- OpenAI SDK.
- Twilio WhatsApp.
- Resend / SMTP email paths.
- Google Sheets via `googleapis`.

See [docs/03-tech-stack.md](docs/03-tech-stack.md) for the detailed inventory.

## Setup

Install backend dependencies:

```bash
npm install
```

Install dashboard dependencies:

```bash
npm --prefix dashboard install
```

If npm has cache permission issues on Windows:

```bash
npm install --cache .npm-cache
npm --prefix dashboard install --cache dashboard/.npm-cache
```

## Environment

Create local environment files:

```bash
cp .env.example .env
cp dashboard/.env.local.example dashboard/.env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item dashboard/.env.local.example dashboard/.env.local
```

Do not commit `.env` or `.env.local`. They are ignored by Git.

Important variable groups:

- Supabase URL and keys.
- OpenAI API/model settings.
- Twilio WhatsApp credentials.
- Resend/SMTP email settings.
- PMS credentials.
- Ubikos sandbox variables.
- Google Sheets service account variables.
- automation safety flags.

See [docs/08-deployment.md](docs/08-deployment.md) for deployment guidance.

## Development

Start backend:

```bash
npm run dev
```

Start dashboard:

```bash
npm run dashboard:dev
```

Default local ports:

- Backend: `http://localhost:3000`
- Dashboard: `http://localhost:3001`

## Checks and Tests

Recommended before commit:

```bash
npm run check:syntax
npm run dashboard:build
```

Useful targeted tests:

```bash
npm run test:permissions
npm run test:pms:ubikos
npm run test:automation-test-center
npm run test:automations
```

See [docs/09-testing.md](docs/09-testing.md) for the full script inventory.

## Documentation

Start here:

- [docs/00-project-overview.md](docs/00-project-overview.md)
- [docs/01-current-status.md](docs/01-current-status.md)
- [docs/02-technical-architecture.md](docs/02-technical-architecture.md)
- [docs/04-features.md](docs/04-features.md)
- [docs/05-pms-integration.md](docs/05-pms-integration.md)
- [docs/12-github-audit.md](docs/12-github-audit.md)

## Deployment

Recommended split:

- backend from repository root;
- dashboard from `dashboard/`;
- Supabase for database/auth;
- environment variables configured in the deployment platforms.

Typical production flow:

```bash
npm run check:syntax
npm run dashboard:build
git status
git add README.md docs/
git commit -m "Document Staynex technical status and repository audit"
git push origin main
```

Use targeted `git add` commands when unrelated untracked folders exist in the repository root.

