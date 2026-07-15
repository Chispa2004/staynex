# Testing

Audit date: 2026-07-15

## Script Inventory

Scripts are defined in root `package.json` and dashboard `package.json`.

| Command | Purpose |
| --- | --- |
| `npm run check` | Syntax-check `src/server.js`. |
| `npm run check:env` | Validate environment configuration. |
| `npm run check:syntax` | Syntax-check backend services, jobs and test scripts. |
| `npm run check:all` | Run syntax check and dashboard build. |
| `npm run dashboard:dev` | Start dashboard dev server. |
| `npm run dashboard:build` | Build Next.js dashboard. |
| `npm run dashboard:start` | Start built dashboard. |
| `npm run test:message` | Test local message flow. |
| `npm run test:mock-ai` | Validate mock AI. |
| `npm run test:knowledge` | Validate knowledge behavior. |
| `npm run test:knowledge-hotel` | Validate hotel knowledge isolation. |
| `npm run test:memory` | Validate memory logic. |
| `npm run test:guest-memory` | Validate guest memory. |
| `npm run test:natural-conversation` | Validate natural conversation behavior. |
| `npm run test:contextual-revenue` | Validate contextual revenue signals. |
| `npm run test:experience-intelligence` | Validate experience booking/intelligence flow. |
| `npm run test:experience-management` | Validate provider/experience management. |
| `npm run test:language` | Validate language logic. |
| `npm run test:pms-intelligence` | Validate PMS intelligence logic. |
| `npm run test:pms:ubikos` | Validate Ubikos sandbox adapter/normalizer/mocks. |
| `npm run test:google-sheets` | Validate Google Sheets service behavior. |
| `npm run test:guest-intelligence` | Validate Guest Intelligence. |
| `npm run test:platform-management` | Validate platform management, academy, PMS connector UI logic. |
| `npm run test:permissions` | Validate roles and route permissions. |
| `npm run test:inbox` | Validate inbox and takeover behavior. |
| `npm run test:dashboard-i18n` | Validate dashboard translations. |
| `npm run test:simulation` | Validate Simulation Mode. |
| `npm run test:simulation:100` | Run 100 simulation cases. |
| `npm run test:simulation:500` | Run 500 simulation cases. |
| `npm run test:failure-intelligence` | Validate Failure Intelligence. |
| `npm run test:journeys` | Validate long journey simulation. |
| `npm run test:journeys:100` | Run 100 long journeys. |
| `npm run test:journeys:500` | Run 500 long journeys. |
| `npm run test:pms-reservation` | Validate PMS reservation flow. |
| `npm run test:reservation-token` | Validate reservation access token behavior. |
| `npm run test:openai` | Validate OpenAI integration path. |
| `npm run test:upsells` | Validate upsell logic. |
| `npm run test:automations` | Validate automation services and jobs. |
| `npm run test:automation-test-center` | Validate Automation Test Center. |
| `npm run test:apaleo-sync` | Validate Apaleo sync script. |
| `npm run test:apaleo-webhook` | Validate Apaleo webhook script. |

## Jobs

| Command | Purpose |
| --- | --- |
| `npm run jobs:cleanup` | Guest data cleanup job. |
| `npm run jobs:health` | Health job. |
| `npm run jobs:pms-intelligence` | PMS intelligence job. |
| `npm run jobs:pre-checkout-folio` | Pre-checkout folio reminder job. |
| `npm run jobs:post-stay-review-intelligence` | Post-stay review job. |
| `npm run jobs:sync-sheets` | Google Sheets platform sync job. |
| `npm run jobs:readiness-checks` | Go-live readiness checks job. |

## Tests Executed During This Audit

The following non-destructive checks were executed during this audit:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:permissions` | Passed | Receptionist/platform permission checks passed. |
| `npm run test:pms:ubikos` | Passed | Ubikos health returned `not_configured`, sandbox/read-only true, with mock data. This confirms it is prepared, not live. |
| `npm run test:automation-test-center` | Passed | Automation Test Center dry-run behavior passed. |
| `npm run check:syntax` | Passed | Backend, services, jobs and scripts parsed successfully. |
| `npm run dashboard:build` | Passed | Next.js dashboard compiled successfully. |

## Notes

Some tests may depend on Supabase schema, environment variables or mock flags. Do not run live-send tests against guest numbers unless explicitly configured for internal test numbers.
