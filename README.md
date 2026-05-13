# Staynex

Staynex is an AI operations assistant for hotels. Guests write to the hotel on WhatsApp, Staynex understands the request, replies in the guest language, creates operational tickets when needed, and gives reception a dashboard to monitor conversations, tickets, AI decisions, QR room links, analytics, and hotel knowledge.

This repository contains:

- `src/`: Express backend for WhatsApp, AI processing, tickets, AI logs, and staff replies.
- `dashboard/`: Next.js App Router dashboard.
- `supabase/`: SQL schema, migrations, and demo seed files.
- `scripts/`: local test and validation scripts.

## Stack

- Node.js
- Express
- Next.js App Router
- TailwindCSS
- Supabase PostgreSQL
- OpenAI API
- Twilio WhatsApp API

## Ports

- Backend: `http://localhost:3000`
- Dashboard: `http://localhost:3001`

## Setup

Install backend dependencies:

```bash
npm install
```

Install dashboard dependencies:

```bash
npm --prefix dashboard install
```

If npm has cache permission issues on Windows, use the local cache:

```bash
npm install --cache .npm-cache
npm --prefix dashboard install --cache dashboard/.npm-cache
```

## Environment

Create backend env:

```bash
cp .env.example .env
```

Create dashboard env:

```bash
cp dashboard/.env.local.example dashboard/.env.local
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
Copy-Item dashboard/.env.local.example dashboard/.env.local
```

Required backend variables:

```env
PORT=3000
USE_MOCK_AI=true
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=your_twilio_whatsapp_number
REQUIRE_TWILIO=false
```

Required dashboard variables:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_TWILIO_WHATSAPP_FROM=your_twilio_whatsapp_number
```

Do not commit `.env` or `.env.local`. They are ignored by Git.

## Supabase

Run the base schema in Supabase SQL Editor:

```text
supabase/schema.sql
```

Then run optional/current migrations as needed:

```text
supabase/add-guest-language.sql
supabase/sql/create_ai_logs.sql
supabase/sql/add_ai_logs_human_fields.sql
supabase/seed-demo-knowledge.sql
```

The backend uses the Supabase service role key server-side only. The browser dashboard uses the anon key where appropriate.

## Backend

Start development server:

```bash
npm run dev
```

Start normal server:

```bash
npm start
```

Validate environment:

```bash
npm run check:env
```

Check backend syntax:

```bash
npm run check:syntax
```

Run a local message test without Twilio:

```bash
npm run test:message -- "Hello, I am in room 208" "+34600000000"
```

Useful backend endpoints:

- `GET /health`
- `POST /test-message`
- `POST /webhooks/whatsapp`
- `POST /messages/send`
- `GET /debug/ai-logs` outside production only

## Dashboard

Start dashboard:

```bash
npm run dashboard:dev
```

Build dashboard:

```bash
npm run dashboard:build
```

Main routes:

- `/dashboard`: tickets
- `/dashboard/inbox`: operational inbox
- `/dashboard/housekeeping`
- `/dashboard/maintenance`
- `/dashboard/reception`
- `/dashboard/analytics`
- `/dashboard/ai-logs`
- `/dashboard/qr-rooms`
- `/dashboard/settings/knowledge`
- `/dashboard/tickets/[id]`

## WhatsApp With Twilio

For local webhook testing:

1. Start the backend on port `3000`.
2. Expose it with ngrok:

```bash
ngrok http 3000
```

3. In Twilio WhatsApp Sandbox or sender settings, configure:

```text
POST https://your-ngrok-url/webhooks/whatsapp
```

4. Ensure `TWILIO_WHATSAPP_FROM` matches the hotel number stored in Supabase.

For local development without Twilio, keep:

```env
REQUIRE_TWILIO=false
USE_MOCK_AI=true
```

## QR Rooms

The dashboard route `/dashboard/qr-rooms` generates room QR codes that open WhatsApp with a prefilled message like:

```text
Hello, I am in room 208
```

The backend already detects this room format and stores it on the guest profile.

## Deployment Notes

This repo is prepared for a split deploy:

- Railway: backend from the repository root, `npm start`.
- Vercel: dashboard from `dashboard/`, `npm run build`.

Set production environment variables separately in Railway and Vercel. Do not rely on local `.env` files in production.

Potential deploy settings:

- Railway root directory: repository root.
- Railway start command: `npm start`.
- Vercel root directory: `dashboard`.
- Vercel build command: `npm run build`.
- Vercel output: managed by Next.js.

## Checks Before Push

Run:

```bash
npm run check:syntax
npm run dashboard:build
```

Or:

```bash
npm run check:all
```

## Security

Ignored by Git:

- `.env`
- `.env.local`
- `node_modules`
- `.next`
- build output
- logs
- npm cache
- local legacy prototypes

Never commit Supabase service role keys, Twilio auth tokens, OpenAI keys, or real production `.env` files.
