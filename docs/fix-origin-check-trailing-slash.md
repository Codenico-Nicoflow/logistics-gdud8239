# fix: login blocked by the Origin check (fix/origin-check-trailing-slash)

After PR #39 every production login answered `403 הבקשה נחסמה: מקור לא מורשה`. The new cross-site check compared the browser's `Origin` (`https://logistics-gdud8239.vercel.app`) with `WEB_ORIGIN` exactly, and `WEB_ORIGIN` had been pasted with a trailing slash. A browser never sends that slash, so no request matched.

- Both sides are now reduced to scheme + host + port (`normalizeOrigin`), so a trailing slash or path cannot break it; CORS uses the same normalised value.
- `WEB_ORIGIN` must parse as an address in production, and the value in effect is logged at boot.
- Tests: normalisation, a slash-terminated config still accepted, other sites still blocked, bad values rejected.

Immediate workaround (no deploy needed): set `WEB_ORIGIN` in Render to exactly `https://logistics-gdud8239.vercel.app`.
