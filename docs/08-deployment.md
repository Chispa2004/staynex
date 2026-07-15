# Deployment

Audit date: 2026-07-15

## Structure

Staynex is split into:

- backend from repository root;
- dashboard from `dashboard/`;
- Supabase database/auth;
- third-party services configured by environment variables.

## Backend

Backend entrypoint:

```bash
npm start
```

Development:

```bash
npm run dev
```

Likely deployment target:

- Railway or equivalent Node.js host.

## Dashboard

Dashboard build:

```bash
npm run dashboard:build
```

Dashboard start:

```bash
npm run dashboard:start
```

Likely deployment target:

- Vercel with root directory `dashboard`.

## Supabase

Supabase hosts:

- PostgreSQL database;
- auth;
- SQL migrations;
- service/anon keys.

Run SQL migrations manually in the Supabase SQL editor or through a controlled migration process.

## Environment Variables

Do not commit secrets. Configure them in deployment platforms.

Main groups:

- Supabase URL and keys.
- OpenAI API/model settings.
- Twilio WhatsApp credentials.
- Resend/SMTP email settings.
- PMS credentials.
- Ubikos sandbox variables.
- Google Sheets service account variables.
- automation safety flags.

## Recommended Process

```bash
npm install
npm --prefix dashboard install
npm run check:syntax
npm run dashboard:build
git status
git add README.md docs/
git commit -m "Document Staynex technical status and repository audit"
git push origin main
```

After deploy:

1. Check backend health.
2. Check dashboard login.
3. Check platform routes.
4. Check hotel workspace context.
5. Check Automation Test Center remains dry-run.
6. Check no real WhatsApp send is triggered.

## Deployment Warnings

- Ubikos is not live.
- Real automation sends should stay disabled until pilot approval.
- WhatsApp hotel onboarding is required per real hotel.
- Provider email mode must be configured before production provider flows.
- SQL migrations must be in sync with code.

