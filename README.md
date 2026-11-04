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

## Excel export and restore

```
GET  /api/excel/export          # the full workbook, original structure
POST /api/excel/import/preview  # validate and report, writes nothing
POST /api/excel/import/commit   # wipe-and-replace (admin only)
GET  /api/snapshots             # stored snapshots
POST /api/snapshots             # take one now
GET  /api/snapshots/:id/download
POST /api/snapshots/:id/send-to-slack
```

The export reproduces the original nine sheets — `צלמ`, `מסכם`, `פלוגות`,
`הקצאות`, `ספירת נשקיה`, `רשימת שמות נשק`, `מחירון פריטים`, `דוח תנועות` — plus
a `דרוש טיפול` sheet so the flagged rows travel with the file. Every sheet is
right-to-left and `צלמ` keeps the original ten columns in order, which is what
makes the file re-importable.

**Verified round trip.** Exporting and re-importing reproduces the same state:

| | Before | After restore |
|---|---|---|
| Soldiers | 461 | 461 |
| Active signatures | 1129 | 1129 |
| Serial instances | 657 | 657 |
| Audit log | preserved | plus the import itself |

A `pre_import` snapshot is taken automatically before any import, so even a
wipe-and-replace is reversible. The report tests pinned to the original Excel
numbers still pass after a full wipe and restore.

### Daily snapshot

A cron at 18:00 `Asia/Jerusalem` writes a snapshot, uploads it to Slack and
prunes to the last 30 dailies. `pre_import` snapshots are kept indefinitely.

The snapshot is written to disk **before** Slack is attempted, so a Slack
outage never costs a backup; the failure is recorded on the snapshot row and
the API returns a clear message rather than throwing.

To enable Slack, set `SLACK_BOT_TOKEN` (needs `files:write`) and
`SLACK_CHANNEL_ID`. Left empty, snapshots are still written and downloadable.

### Note on the importer's identity

An import sets `signed_by_user_id` on every restored signature to the user who
ran it. That user therefore cannot be deleted afterwards — the foreign key is
deliberate, since an orphaned audit trail is worse than an undeletable row.
Deactivate such an account instead.

## Frontend

```bash
npm run db:up
npm run dev:api     # http://localhost:3000/api
npm run dev:web     # http://localhost:5173
```

React 19 + Vite + RTK Query + Tailwind. Hebrew only, `dir="rtl"` throughout,
with every string in `src/i18n/he.ts` so nothing English can leak into the UI
and wording changes in one place.

### Design

The interface is a working tool used during a shift, often on a phone, so
density and legibility come before decoration. The palette is drawn from
field-manual stationery — ink on grey card stock — with **brass reserved for
serial numbers**, since those are the one value stamped on metal and the one
most costly to get wrong. Numbers are set in tabular figures so counts and
serials line up down a column.

One screen gets the design attention: **ניפוק**. A mistake there records a
weapon against the wrong soldier, so it is a three-step sequence where the
serial field is oversized and framed, and the confirm button stays disabled
until a serial is entered — the same rule the API enforces.

### Screens

| Route | Screen | Who |
|---|---|---|
| `/` | לוח בקרה — totals, per-company bars, gaps, recent movements | all |
| `/issue` | ניפוק — the signing flow | admin, logistics |
| `/signatures` | חתימות — search and filter, with זיכוי | all |
| `/attention` | דרוש טיפול — flagged import rows, with serial backfill | all |
| `/summary` | מסכם | all |
| `/companies` | פלוגות | all |
| `/allocations` | הקצאות, with נשאר לחתום computed | all |
| `/movements` | דוח תנועות — filterable audit log | all |
| `/backups` | גיבויים — export, import, snapshots | admin |
