# fix: refresh on a deep link gave Vercel's 404

The web app is a client-routed SPA, so only `/` exists as a file. Reloading `/ifsun`, `/counts` etc. asked Vercel for a path that is not a file and got `404 NOT_FOUND`.

`apps/web/vercel.json` now rewrites everything that is not `/api/*` to `/index.html`, so React Router resolves the route. Rewrites run after static files are checked, so built assets under `/assets` are still served as-is. The `/api` proxy rule stays first so API calls are never swallowed.
