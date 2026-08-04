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

Vercel dashboard settings:

- Keep Root Directory as `dashboard`.
- Enable inclusion of source files outside the root directory.
- `dashboard/next.config.mjs` sets `outputFileTracingRoot` to the repository root so server routes trace `shared/automations/*`.
- `shared/automations/queue-writer.js` is server-only. Do not import it from `"use client"` components or browser bundles.

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

### HTTP Perimeter Variables

Configure these in both backend and dashboard deployment environments where applicable:

- `STAYNEX_INTERNAL_API_TOKEN`: server-only shared service-to-service token used by dashboard server routes when calling protected backend routes. It must never be exposed as `NEXT_PUBLIC_*`, logged, or sent to the browser.
- Backend and dashboard must use the same `STAYNEX_INTERNAL_API_TOKEN` value within the same environment. Use different values for local, staging and production.
- `ENABLE_TEST_ROUTES`: disabled by default. Development and staging test/demo routes only work with `ENABLE_TEST_ROUTES=true` and the correct internal token. Production must never enable this flag; test/demo routes must return 404 in production.
- `TWILIO_WEBHOOK_PUBLIC_URL`: full and exact public Twilio callback URL when the backend is behind a proxy, including the final path and any supported query string.
- `TWILIO_WEBHOOK_VALIDATION_BYPASS`: local/test-only bypass; do not enable in production.
- `RUN_EXTERNAL_APALEO_TESTS`: required before scripts are allowed to call Apaleo.
- `RUN_MUTATING_INTEGRATION_TESTS`: required before scripts are allowed to write integration test rows, including Supabase-mutating automation or webhook checks.

Production webhook behavior:

- Twilio WhatsApp webhooks require official Twilio signature validation.
- Apaleo live webhooks remain blocked until the official validation mechanism or documented shared-secret policy is confirmed.
- Test/debug routes must not be used as production entrypoints.

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
- Backend and dashboard must share the same `STAYNEX_INTERNAL_API_TOKEN` before deploying protected internal calls.
- Production must keep `ENABLE_TEST_ROUTES`, `RUN_EXTERNAL_APALEO_TESTS` and `RUN_MUTATING_INTEGRATION_TESTS` disabled.
