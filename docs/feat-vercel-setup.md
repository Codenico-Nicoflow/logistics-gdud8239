# feat/vercel-setup — deploy apps/web to Vercel

## What changed

- `apps/web/vercel.json` — rewrites `/api/*` on the Vercel domain to the
  Render API (`logistics-api-j7uf.onrender.com`). Needed because `apps/web`
  calls a relative `/api` baseUrl (`lib/api.ts`), which only resolves via
  Vite's dev-only proxy locally. The rewrite keeps the browser on the Vercel
  origin for API calls, so auth cookies (set via `WEB_ORIGIN` CORS on the API,
  `httpOnly` + `credentials: true`) stay same-site instead of needing a
  cross-origin cookie setup.

## Manual steps on vercel.com (not done by this PR)

1. Import `Codenico-Nicoflow/logistics-gdud8239` as a new Vercel project —
   **must** be imported from the org repo, not a stale personal-account fork,
   same reason Render's GitHub App connection had to be redone after the
   transfer.
2. Root Directory: `apps/web`.
3. Build command / output: Vercel auto-detects Vite; defaults are fine
   (`npm run build`, output `dist`) once Root Directory is set.
4. Framework preset: Vite.
5. No env vars needed on the web side — `vercel.json`'s rewrite hardcodes the
   Render URL directly since there's only one API environment.
6. After the first deploy, take the assigned `*.vercel.app` URL and set it as
   `WEB_ORIGIN` on the Render API service (`render.yaml` leaves this
   `sync: false` on purpose) — CORS on the API only allows one origin, and it
   needs to know the real Vercel URL to let the browser talk to it.
