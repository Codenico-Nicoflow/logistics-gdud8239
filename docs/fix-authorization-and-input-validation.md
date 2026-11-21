# Authorization gaps and input validation (fix/authorization-and-input-validation)

PR 2 of the security plan. An audit of every route found data readable by any logged-in user and input that skipped validation.

## Who may read what (was: any logged-in user)
| Route | Now |
|---|---|
| `GET /excel/export` (whole armory workbook) | admin, logistics |
| `GET /issue-forms`, `/:id`, `/:id/print` (1008 with name, מ.א., phone, signature image) | admin, logistics, viewer; a company-scoped user sees only his company's forms, another company's id answers 404 |
| `GET /attendance/week`, `/members` (team full names, personal numbers) | admin, logistics |
Soldiers (`GET /soldiers`) are unchanged: SHLISHUT, SAMGAD and company commanders need the roster for their work, and a company-scoped user is already limited to his company. Catalog (`items`) reads stay open to any logged-in user — not personal data.

## Input validation
- Typed pipes for every query parameter that was a bare TypeScript annotation (`common/pipes.ts`): real calendar dates, `Company`/`CountShift` enums, bounded integers for `take`/`skip`/`limit`, UUIDs. A bad value is a 400 instead of reaching Prisma and becoming a 500.
- New DTOs: instance status (`@IsEnum`, notes ≤300), count signature images (PNG data URL, ≤400 000 chars — same rule as 1008 and אפסון).
- Bounds: `@ArrayMaxSize` on issue-form lines (200), mesakem lines, attendance cells, intake rows, item aliases; `@Max` on every quantity; `@IsUUID` for ids in issue-form lines; `q` ≤60 everywhere; permission keys limited to the keys the app checks; a company commander must have a company; passwords need ≥10 characters (was 6 on the create-user DTO).
- **A NUL character in any search box made Postgres fail the query and the API answer 500.** Found by the new injection tests; a global pipe now refuses a NUL in any query, body or path parameter with a 400.
- `pg_dump` receives the database password through its environment, not on the command line (where `ps` shows it).
- The temporary `debug-ip` route is removed (`TRUST_PROXY_HOPS=3` is set and verified).

## SQL injection
There was none to fix: every query is Prisma (values are bound), and the one raw query is a static template. This PR keeps it that way: `src/no-raw-sql.spec.ts` fails the build on `$queryRawUnsafe`/`$executeRawUnsafe`, `Prisma.raw`, interpolation inside a raw query, or shell `exec`; and `input-validation.e2e.spec.ts` sends twelve payload shapes (`' OR 1=1--`, `'; DROP TABLE…`, `%`, backslash, NUL, template and script text, 500-character strings, control characters) through the search and filter parameters of soldiers, signatures, movements, אפסון and items, asserting never a 500, no extra rows, and that the tables are still there.

## Tests
`authorization.e2e` (role × route matrix, company scope), `input-validation.e2e`, `no-raw-sql`, and unit specs for the pipes. API 189/189.
