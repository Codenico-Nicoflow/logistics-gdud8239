# מערכת לוגיסטיקה — Logistics App

Replaces the manually maintained armory (`דוח צלם`) and exit-days (`יציאות`)
Excel files with a Hebrew/RTL web app: signatures are the single source of truth,
every summary view is computed, and every change is recorded in an append-only
audit log.

## Stack

- **API** — Nest.js 12, Prisma 7 (driver adapter), PostgreSQL 16
- **Web** — React 19, Vite, RTK Query, Tailwind (RTL)
- **Tests** — Vitest, with report assertions pinned to the real Excel numbers

## Getting started

```bash
npm install
npm run db:up                       # PostgreSQL on :5433 via Docker
cp .env.example .env                # then edit secrets

cd apps/api
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='<a strong password>' npm run seed
```

`SEED_ADMIN_PASSWORD` is required — the seed deliberately creates no default
credential.

### Importing the existing Excel

```bash
cd apps/api
npx tsx prisma/import-excel.ts "../../דוח צלם עדכני (2).xlsx"
```

The import is **wipe-and-replace** on the signature side and imports every row,
including rows with data problems. Each problem is recorded in `import_issues`
and surfaced in the app's "דרוש טיפול" tab rather than being dropped. The
`movements` audit log is append-only and survives the wipe.

Current result for `דוח צלם עדכני (2).xlsx`: 1138 rows → 461 soldiers,
1129 signatures, 76 flagged for attention (49 missing serial, 23 blank item,
3 duplicate serial, 1 duplicate row).

## Data integrity

Enforced in PostgreSQL, not only in application code:

- a serialized item instance has **at most one active holder** (partial unique index)
- a non-serialized item has one open signature per soldier, quantity carrying the count
- `quantity > 0`, and a return cannot predate its signature
- `movements` rejects `UPDATE` and `DELETE` via trigger — the audit log is append-only
- soldiers and items with history cannot be deleted, only deactivated

## Tests

```bash
cd apps/api && npm test
```

`src/reports/reports.service.spec.ts` asserts the computed `מסכם`, `פלוגות` and
`הקצאות` views against numbers read out of the source workbook. It needs a
database that has been seeded and imported.

## Known data findings

The import surfaced places where the hand-kept sheets disagree with the
signature rows — the problem this app exists to solve:

| Finding | Detail |
|---|---|
| `מפרו` per-company | `מסכם` total of 71 is right; `פלוגות` breaks it down as all zeros |
| `שלט לאווטה` | 6 signed in `צלמ`, absent from `מסכם` |
| `כלבו צלף` | 2 signed in `צלמ`, absent from `מסכם` |
| `מכפל` | company breakdown left at zero for ג / מסייעת / מפקדה |
| 23 rows | have a soldier and sometimes a serial, but no item name |
| 3 serials | appear on two different soldiers, which is physically impossible |

## Serialization rule

Derived from the data by majority: an item whose rows mostly carry a serial is
serialized. Serialized includes M-4, M-16, מאג, נגב, M-203, טריג'יקון,
ציין לייזר, שחמ, זאבון, מכפל, מטל מפקד and the drones. Quantity-based includes
M5 (249 of 252 rows have no serial), מפרו, משקפת, מטולון, מצפן.

Imports tolerate a missing serial and flag it. Signatures created through the
API do not: a serialized item cannot be signed without one.

## Authentication

JWT access + refresh tokens in **httpOnly cookies**, so page scripts cannot read
them and an XSS bug does not hand over a session.

| Property | Behaviour |
|---|---|
| Password hashing | bcrypt, cost 12 |
| User enumeration | wrong password and unknown user return the identical message, and an unknown user is still compared against a dummy hash so the timing matches |
| Login rate limit | 5 attempts per minute per IP |
| Refresh tokens | stored as a SHA-256 digest, rotated on every use |
| Stolen token | reusing a rotated-out token revokes **every** session for that user |
| Deactivation | takes effect on the next request — the guard re-reads the user rather than trusting the token |
| Last admin | cannot be demoted or deactivated |
| Unknown request fields | rejected with 400 rather than ignored |

Routes are authenticated by default; opting out is explicit via `@Public()`.

### Roles

| Role | Can |
|---|---|
| `admin` | everything: users, catalog, מצבה, allocations, import, backups |
| `logistics` | issue and return items, create soldiers, count sessions, export |
| `viewer` | read-only reports and dashboards |

A `logistics` user may optionally be scoped to a single פלוגה.
