# Staynex Production Readiness Checklist

Use this checklist before commercial demos, pilot onboarding, and production-like testing.

## Backend

- [ ] Healthcheck responds on `GET /` and `GET /health`.
- [ ] WhatsApp webhook accepts inbound messages and returns quickly.
- [ ] PMS sync uses bounded `pageSize` and `maxReservations`.
- [ ] Apaleo API requests timeout and retry only temporary failures.
- [ ] Apaleo webhooks are idempotent for processed events.
- [ ] Failed Apaleo webhook events can be retried safely.
- [ ] Reservation cancellations update internal status without deleting guest or conversation data.
- [ ] AI logs do not block guest replies when logging fails.
- [ ] Secrets, tokens, and PMS credentials are never logged in clear text.
- [ ] `npm run check:syntax` passes.

## Frontend

- [ ] Login redirects to `/dashboard` without manual refresh.
- [ ] Logout redirects to `/login` without manual refresh.
- [ ] Inbox opens selected conversation at the latest messages.
- [ ] Inbox composer stays visible on desktop and mobile.
- [ ] Inbox polling does not create duplicate refreshes or duplicate messages.
- [ ] Inbox polling pauses while the tab is hidden and resumes cleanly.
- [ ] Realtime failure does not break Inbox because polling remains active.
- [ ] Executive Dashboard polling does not overlap requests.
- [ ] PMS Connections screen has one AppShell sidebar only.
- [ ] Loading, empty, and error states show clear user-facing messages.
- [ ] `npm run dashboard:build` passes.

## AI

- [ ] OpenAI fallback returns a safe mock response when OpenAI fails.
- [ ] AI Concierge does not repeat the same offer after a recent offer.
- [ ] Intent switching works when the guest changes topic.
- [ ] Complaints and emergencies create clear human attention signals.
- [ ] Knowledge Base answers are scoped to the current hotel.
- [ ] AI Logs capture provider, model, fallback, intent, confidence, and ticket status.

## PMS

- [ ] Manual Apaleo Sync imports reservations without duplicates.
- [ ] Apaleo webhook `created` creates or updates an internal reservation.
- [ ] Apaleo webhook `amended` updates the internal reservation.
- [ ] Apaleo webhook `canceled/cancelled` marks the internal reservation cancelled.
- [ ] Apaleo webhook `deleted` marks the internal reservation deleted/cancelled internally.
- [ ] Malformed webhook payloads are logged as failed or ignored, not fatal.
- [ ] `pms_webhook_events` stores received, processed, ignored, and failed events.

## Multi-Hotel

- [ ] Dashboard APIs resolve current hotel from logged-in user.
- [ ] Reservation, knowledge, ticket, PMS, revenue, memory, and automation queries filter by hotel.
- [ ] Demo fallback hotel is used only when no hotel association exists.
- [ ] No dashboard view mixes data from another hotel.

## Pilot Readiness

- [ ] Supabase migrations are applied in the pilot project.
- [ ] `PMS_SECRET_ENCRYPTION_KEY` is configured.
- [ ] `PUBLIC_BACKEND_URL` points to the public Railway backend URL.
- [ ] Supabase Realtime is enabled for `messages` and `conversations` if realtime is expected.
- [ ] Twilio webhook points to the public backend.
- [ ] Apaleo webhook URL is configured manually in Apaleo.
- [ ] Staff can recover using Refresh buttons if realtime or polling temporarily fails.
