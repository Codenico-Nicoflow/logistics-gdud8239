# fix/api-root-health-route — bare `/` returns 200 instead of 404

The whole API is mounted under `/api` (`app.setGlobalPrefix('api')`), so a
plain visit to `https://logistics-api-j7uf.onrender.com/` 404'd — nothing
wrong with the deploy, there was just no controller for `/`. That reads as a
broken deploy to anyone who checks the bare URL (and to Render's own health
check, if it's ever pointed at root instead of `/api/...`).

## What changed

- `app.setGlobalPrefix('api', { exclude: ['/'] })` — keeps `/` outside the
  prefix.
- New `AppController` at `GET /`, marked `@Public()` since it sits outside the
  global `JwtAuthGuard`'s normal `/api` routes but still needs to opt out
  explicitly (auth is global-by-default here, not scoped to the prefix).
  Returns `{ service: 'logistics-api', status: 'ok' }`.
