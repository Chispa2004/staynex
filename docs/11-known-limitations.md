# Known Limitations

Audit date: 2026-07-15

## PMS and Ubikos

- Ubikos real API is not connected yet.
- No official Ubikos endpoint/auth documentation is present.
- Current Ubikos work is sandbox/read-only with mocks.
- No PMS write actions are implemented or approved.
- PMS data quality is a major dependency.
- PMS embedded integration depends on each PMS capability.

## Production Validation

- Mocks and simulations do not equal validation in a real hotel.
- First pilot must validate WhatsApp, PMS data, staff workflow, provider workflow and automations.
- Folio reminders require real PMS folio accuracy before guest-facing use.

## WhatsApp

- WhatsApp real use depends on Twilio credentials, sender setup and hotel onboarding.
- Embedded Signup is not a completed current feature.
- Real guest sends must remain guarded until approved.

## Automations

- Automated sends are designed but should remain disabled/preview until pilot approval.
- Guest-facing copy has been improved, but must be reviewed by hotel brand tone before live use.
- Fatigue guard and dedupe logic should be validated with real guest history.

## Experience Providers

- Provider emails depend on configuration and provider operational readiness.
- Provider confirmation remains external unless integrated later.
- Marketplace revenue reporting depends on complete provider and booking data.

## AI

- AI quality depends on hotel knowledge, PMS context and conversation history.
- Guest Intelligence and Revenue AI are probabilistic assistance layers, not absolute facts.
- AI Logs and Failure Intelligence are internal tools, not guest/hotel-facing decision explanations.

## Security and Permissions

- UI permissions must remain aligned with API permissions.
- New routes must be reviewed for tenant isolation.
- Platform admin hotel context must be tested whenever navigation changes.

## Repository Hygiene

- Several untracked folders exist in the repository root and are not part of the tracked Staynex codebase.
- Some ignored `.env` files exist in untracked external folders. They should not be added to Git.
- OneDrive build/cache folders are ignored, but the working directory should be kept clean before handoff.

## Deployment

- SQL migration order and production schema must be confirmed before deployment.
- Vercel/Railway variables must be configured separately.
- Local `.env` files are not deployment configuration.

