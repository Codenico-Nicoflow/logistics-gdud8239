# chore/web-test-coverage

Web tests went from 3 files / 13 tests to 8 files / 85, and there is now a real-browser end-to-end suite.

## Component tests (vitest + jsdom, API mocked)
`src/test/mockApi.tsx` now answers per verb (`"POST /api/x"`), accepts a function for dynamic replies, and records every
request in `calls` so a test can assert what was (not) sent.

- `app/roleAccess.test.tsx` — each of the six roles: menu entries, landing page, forbidden addresses.
- `components/ui.test.tsx` — shared controls, dates (Israel calendar day), toasts, `DeleteDialog`, `SignaturePad`.
- `features/soldiers/SoldiersPage.test.tsx`, `features/allocations/ServicePeriodsPage.test.tsx`, `features/auth/SetupPage.test.tsx`.
- `features/auth/loginSteps.test.tsx` — plus the wrong-code regression.

## Browser e2e (`apps/web/e2e`, playwright-core + Chrome, LOCAL dev database only)
```bash
npx tsx apps/api/scripts/e2e-users.ts create /path/creds.json     # one throwaway account per role
PORT=3100 WEB_ORIGIN=http://localhost:5174 SLACK_BOT_TOKEN= SLACK_CHANNEL_ID= npm run start --workspace=apps/api
API_TARGET=http://localhost:3100 WEB_PORT=5174 npm run dev --workspace=apps/web
cd apps/web
npm run e2e:probe -- --base http://localhost:3100 --origin http://localhost:5174 --creds /path/creds.json
npm run e2e:smoke -- --creds /path/creds.json
npm run e2e:flows -- --creds /path/creds.json        # misc.mjs also takes --with-lockout (blocks this IP for a while)
psql "$DATABASE_URL" -f e2e/cleanup.sql              # removes everything tagged E2E…
npx tsx apps/api/scripts/e2e-users.ts delete
```
- `api-probe.mjs` — role × route authorization matrix, anonymous access, hostile bodies/queries, body size, CSRF origin, CORS.
- `smoke.mjs` — every role opens every route: console errors, uncaught exceptions, 5xx, blank pages, forbidden routes rendering.
- `flows-admin.mjs` (catalog, soldiers, users + setup link), `flows-issue.mjs` (1008 flow, races, returns),
  `flows-misc.mjs` (authenticator app, counts, attendance, backups, lockout), `flows-break.mjs` (offline, double submit,
  dead session, long names on a phone).

**Never run it against an API with a real `SLACK_BOT_TOKEN`:** the attendance "send" is a real post. The probe and flows
no longer call it, and the commands above blank the Slack variables.

## Bugs this found (fixed on their own branches)
- viewer landed on `/issue`, which it cannot open, and bounced between the catch-all and the index route (fixed here).
- objects/arrays coerced into strings before validation — PR #58.
- wrong authenticator code threw the person back to the password form — PR #59.
