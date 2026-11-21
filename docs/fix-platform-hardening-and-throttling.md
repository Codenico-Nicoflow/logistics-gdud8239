# Platform hardening and throttling (fix/platform-hardening-and-throttling)

PR 1 of the security plan. Nothing changes in how people work; it closes the platform-level gaps the audit found.

## The one thing to know about throttling here
The whole unit connects from **one network address**. So an address is the worst identity to rate-limit on: one busy morning would spend everyone's budget. Every limit below is therefore keyed by the most personal identity available:

1. the **logged-in user** (JwtAuthGuard now runs *before* the throttler, so it can see who it is);
2. else the **session** (hash of the refresh cookie) — used for `refresh`/`logout`;
3. else the **address** — only traffic with no identity at all (login attempts, health check).

## Tiers (opt-in per route with `@Tier(...)`, `common/throttle-tiers.ts`)
| Tier | Limit | Applies to |
|---|---|---|
| default | 1200/min per user | everything, incl. a signing day's bursts |
| login | 600/min and 6000/h per address | `POST /auth/login` (bcrypt cost) |
| authIp | 60/min per session | `refresh`, `logout` |
| account | 5 per 15 min per user | `change-password` |
| heavy | 10/min per user | Excel export, backup/snapshot download, send-to-Slack, send-week, מסכם/movements export |
| print | 180/min per user | 1008 / count / אפסון print pages |
| heavyCreate | 6/hour per user | creating a backup or snapshot (pg_dump / workbook) |

Issuing and returning weapons, adding soldiers, toggling מחויל, search: only the default limit — deliberately no tighter tier. Limits can be changed without a code change: `THROTTLE_DEFAULT_PER_MIN`, `THROTTLE_LOGIN_PER_MIN`, `THROTTLE_REFRESH_PER_MIN`, `THROTTLE_HEAVY_PER_MIN`, `THROTTLE_PRINT_PER_MIN`, `LOGIN_IP_FAILURES_PER_15MIN`.

**What actually stops password guessing** is not the address limit but: a per-*account* lockout (5 wrong passwords → locked 15 min, doubling to 60; admin "שחרר נעילה" button on the Users page), and a failure counter per address (500 wrong logins in 15 min refuses that address; successful logins never count and never reset it). 429 answers are in Hebrew with `Retry-After`. Storage is in memory: right for one Render instance; with 2+ instances it must move to Redis.

## Other changes
- `trust proxy` from `TRUST_PROXY_HOPS`, so the IP is real (see below).
- JSON body limit 1 MB (Express's 100 kb default was below the 400 kb signature cap); slow-client timeouts.
- Explicit helmet (HSTS, no-referrer, frame-ancestors none) and CORS methods/headers.
- **Cookies `SameSite=Strict`** + an Origin check that refuses a `POST/PATCH/PUT/DELETE` whose Origin is another site.
- Global exception filter: Prisma `P2002→409`, `P2025→404`, `P2003→409`; everything else a generic Hebrew 500 with no stack/SQL/table name; the real error is logged.
- Env validation in production (also when only Render's `RENDER=true` is present): `WEB_ORIGIN` required, `COOKIE_SECURE` must be `true`, warning when `TRUST_PROXY_HOPS` is unset.
- Refresh rotation is atomic (two tabs refreshing at once no longer log the user out; reuse of a token revoked >10 s ago still ends every session). Expired/old refresh rows are pruned nightly.
- A password change or reset ends access tokens issued before it immediately (`passwordChangedAt`), not after 15 minutes.
- Failed-login logs use the user id, never the typed username.
- SPA response headers in `apps/web/vercel.json`: CSP (`script-src 'self'`; Google Fonts allowed), nosniff, no-referrer, frame deny, Permissions-Policy, HSTS.
- Users page: "נעול" badge and an unlock button; last login is stored.

## After deploying — set `TRUST_PROXY_HOPS` (once)
1. Merge, let Render deploy (a migration adds four columns to `users`).
2. Logged in as admin, open the app, open the browser console and run `await (await fetch('/api/auth/debug-ip')).json()`.
3. `ip` must be **your real public address** (search "what is my ip"). If it shows a Render/Vercel address, raise the number: set `TRUST_PROXY_HOPS` in Render to 1, then 2, then 3, redeploy, and check again, until `ip` is yours.
4. Remove the temporary `debug-ip` route in a follow-up (it is admin-only and harmless, but it is not meant to stay).
Until it is set everything still works: users are keyed by their account, so only the anonymous login/health traffic shares one address.

## Tests
`throttle-tiers`, `throttling`, `account-lockout` e2e specs; unit specs for the Origin check, the exception filter and the production env rules; `auth.e2e` updated for the new refresh behaviour. API 154/154.
