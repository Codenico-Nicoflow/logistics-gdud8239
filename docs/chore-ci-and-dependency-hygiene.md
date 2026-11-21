# CI and dependency hygiene (chore/ci-and-dependency-hygiene)

PR 3 of the security plan. Until now nothing ran the tests or checked dependencies except a person remembering to.

## CI (`.github/workflows/ci.yml`) — runs on every pull request and every push to `main`
- **api:** a throwaway Postgres 16, `npm ci`, `prisma generate`, **all migrations applied to the empty database**, typecheck, the whole test suite, build. Applying every migration to an empty database on every PR also proves a fresh environment can be rebuilt from the repository alone — the same property the restore rehearsal checks for backups.
- **web:** typecheck, tests, production build.
- **audit:** `npm audit --omit=dev --audit-level=high`, reported but not blocking (see below).
- Read-only token, one run per branch at a time, no secrets: every credential in the file is a throwaway value for the throwaway database.
- The suite was run against a brand-new empty database before writing the workflow: 189/189.

Suggested next step in GitHub (Settings → Branches → `main`): require the `api` and `web` checks before merging.

## Dependabot (`.github/dependabot.yml`)
Weekly (Monday, Israel time): npm and GitHub Actions. Minor/patch updates are grouped (NestJS together, React/Vite tooling together) so it is a few PRs a week, not dozens; security updates are grouped separately. **Major** versions of Prisma, TypeScript and Tailwind are ignored — Prisma 8 is still a release candidate, TypeScript 7 and Tailwind 4 are rewrites — those are decisions for a person.

## Dependency updates in this PR (in-range only, majors untouched)
NestJS 12.3.2 → 12.6.0 (`common`, `core`, `platform-express`, `testing`), `config` 12.1.1, `jwt` 12.0.5, `passport` 12.0.2, `schedule` 12.0.4, `throttler` 6.8.0, `cli`, `@slack/web-api` 8.5.0, plus small patch bumps (`dotenv`, `supertest`, `@swc/core`, Redux Toolkit, react-router, react-hook-form, postcss, autoprefixer). API 189/189, web tests green, both builds green.

## Accepted advisories (`npm audit --omit=dev`: 3 high, 2 moderate)
- **`effect` ≤3.22.0 (high, ReDoS)**, reached through `prisma` / `@prisma/config`. It runs in the Prisma CLI and config loading (build and migrate time), not on any request path. npm's suggested "fix" is a downgrade of Prisma and is not taken. Revisit when Prisma 8 is stable.
- **`uuid` <11.1.1 (moderate)**, reached through `exceljs`. The flaw needs a caller-supplied buffer argument, which nothing here passes.
Both are listed so the next person does not have to rediscover why `npm audit` is not clean.

## Smaller hardening
- `docker-compose.yml`: the dev database (known password) is published on `127.0.0.1` only, not on every network interface.
- `prisma/seed.ts` refuses to run when `NODE_ENV=production` or on Render unless `ALLOW_PROD_SEED=1`: pointed at production by a stray `DATABASE_URL`, it would add an admin login to the live system.
