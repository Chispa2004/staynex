# Tech Stack Inventory

Audit date: 2026-07-15

This inventory is based on `package.json`, `dashboard/package.json` and repository files.

## Language

- JavaScript ES modules.
- Node.js runtime.
- SQL migrations for Supabase/PostgreSQL.

## Backend

- Express `^4.21.2`
- dotenv `^16.4.7`
- zod `^3.25.76`
- nodemon for development

Backend entrypoint:

- `src/server.js`

## Frontend

- Next.js `^15.1.7`
- React `^19.0.0`
- React DOM `^19.0.0`
- Tailwind CSS `^3.4.17`
- PostCSS / Autoprefixer
- lucide-react `^0.468.0`
- qrcode `^1.5.4`

Dashboard root:

- `dashboard/`

## Database and Auth

- Supabase JavaScript client:
  - backend: `@supabase/supabase-js ^2.105.4`
  - dashboard: `@supabase/supabase-js ^2.49.1`
- Supabase PostgreSQL migrations in `supabase/sql/`.
- Supabase Auth/roles used by dashboard helpers and tenant context.

## Messaging

- Twilio `^5.4.5` for WhatsApp.
- Message queue and scheduled messages in backend services.

## AI

- OpenAI SDK `^4.104.0`.
- Mock AI mode for local/testing.
- AI services:
  - concierge AI;
  - natural conversation;
  - translation;
  - guest intelligence;
  - revenue AI;
  - failure intelligence;
  - simulation mode.

## Email

- Resend `^6.12.3`.
- SMTP variables exist in `.env.example`.
- Provider lead email service exists.

## Google Integrations

- googleapis `^171.4.0`.
- Google Sheets service and platform sync service exist.

## PMS Integrations

Implemented/prepared code areas:

- Apaleo integration files.
- Generic PMS connector registry.
- Ubikos adapter, normalizer and mocks.
- Placeholder connector structures for additional PMS providers.

## Testing

Tests are Node scripts under `scripts/`. They cover:

- messages;
- mock AI;
- knowledge;
- guest memory;
- natural conversation;
- contextual revenue;
- experience intelligence and management;
- language;
- PMS intelligence;
- Ubikos adapter sandbox;
- Google Sheets;
- guest intelligence;
- platform management;
- permissions;
- inbox;
- simulation;
- failure intelligence;
- journeys;
- reservation token;
- automations;
- Automation Test Center;
- Apaleo scripts.

## Deployment

Repository hints indicate:

- backend deploy from repository root;
- dashboard deploy from `dashboard/`;
- Vercel suitable for dashboard;
- Railway or equivalent Node host suitable for backend;
- Supabase for database/auth.

## Storage

No separate object storage provider is clearly established as a core dependency in package files. Supabase may be used for data storage; file/object storage should be confirmed if needed.

