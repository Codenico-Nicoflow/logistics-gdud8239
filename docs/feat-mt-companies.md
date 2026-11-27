# feat: companies become a per-battalion table (multi-tenant step 1b)

Second of seven steps toward running a second gdud. 8239 keeps its five companies, exactly as they were.
A new battalion starts with none and creates its own.

## What changed

- **No more `Company` enum.** `companies` is a table: `battalion_id`, `code`, `name`, `sort_order`,
  `is_active`. `code` is the stable key (8239's are still `A B C SUPPORT HQ`, so every API payload is
  unchanged); `name` is what people read (`א`, `מסייעת`) and can be renamed.
- **Three live references** (`soldiers.company`, `users.company_scope`, `company_allocations.company`) keep
  their column name and now hold the code as text, with a composite foreign key to
  `companies(battalion_id, code)`: a company must really exist in the same battalion, a rename follows
  through (`ON UPDATE CASCADE`), and deleting a used company is refused (`RESTRICT`).
- **Three history snapshots** (`movements`, `issue_forms`, `ifsun_records` `.company_snapshot`) hold the code
  as plain text with **no** foreign key: a signed form must outlive its company. A printed 1008 shows the
  company's current name for that code.
- **Nothing that was a list of five is a list of five any more.** `AllocationsService`, `ReportsService`,
  the Excel export (sheet widths, the totals row, every column), the movements export and the 1008 print
  read the battalion's companies. On the web, `useCompanies()` replaces `COMPANIES` and `he.companies[...]`
  on every screen; the allocation grid, the company split report and the phone cards size to however many
  companies there are.
- **Companies API:** `GET /companies` (any signed-in role), `POST /companies` and `PATCH /companies/:id`
  (admin only; the code is not editable). New companies get a generated code.
- **מערכת ← פלוגות** screen for the admin to add, rename, reorder and (de)activate.
- **A new assignment must be an active company** (`CompaniesService.assertActive`): soldier create/update,
  user scope, the allocation grid. An unchanged company on an existing soldier is not a new assignment, so a
  soldier in a since-deactivated company can still be edited. Reading a bad `?company=` is a 400, as the old
  enum pipe did.
- Grouping the roster by company follows the companies' own order (`sort_order`), not the code as text, so
  `SUPPORT` still sorts before `HQ`.

## The contract half of step 1a is in this migration too

Step 1a kept the old single-column unique keys and the form-number sequence so the previous app version could
keep running through a deploy. The app is not in use yet, so this step drops them in the same migration:
the six single-column unique indexes, `app_settings`' key-only primary key (now `(battalion_id, key)`), and
`issue_forms.form_no`'s sequence and global unique index. Same personal number, item name, MFA setting and
1008 number can now exist in two battalions; `battalions-foundation.e2e.spec.ts` proves it.

## Append-only tables

`ALTER COLUMN ... TYPE text USING (...)` rewrites a table without firing row triggers, and it maps the enum's
stored Hebrew label to the code in the same statement, so the migration still runs **no** `UPDATE` on
`movements` or `issue_forms`. The test suite checks all five triggers survive.

## Checked

- Migration on a copy of the dev database: 505 soldiers mapped to 144/75/98/99/89 across the five codes, the
  history snapshots converted, six triggers intact, the enum dropped, `prisma migrate diff` empty.
- API suite 326/326, web suite 181/181, both typechecks clean, production build OK.
- Not run: the Playwright flows in `apps/web/e2e` (they need a browser and a running stack).

## Deploy notes

No environment changes. The migration runs on boot. Locally run `npm run migrate`.

## Still true after this step

- Nothing filters reads by battalion yet (step 2). `ReportsService` has one raw query that joins signatures
  to soldiers; it needs the same scoping, and RLS will cover it.
- `apps/api/prisma/import-excel.ts` is 8239's one-off importer for its original workbook and keeps its
  Hebrew-to-code map on purpose; it is not part of the app.
- A battalion needs a `form_counters` row and its companies from the moment it exists; creating a battalion
  (step 4) must do both.
