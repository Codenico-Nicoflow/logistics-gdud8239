# feat: battalion foundation (multi-tenant step 1a)

First of seven steps toward running a second gdud (5033) on this deployment. **8239 stays the only
battalion and nothing it does changes.** This step only lays the tenancy columns underneath.

## What it adds

- `battalions` table, with 8239 inserted by the migration under a fixed id.
- `battalion_id` on every table that holds a battalion's data (34 of them, including the child tables, so
  a row-level policy can later be one uniform rule). `role_permissions` and `db_backups` stay global.
  `users` and `security_events` are nullable, for the platform admin who belongs to no battalion.
- `current_battalion_id()`, the database default for every `battalion_id`: the request's
  `app.battalion_id` setting if one is set, otherwise the oldest battalion (8239). **That fallback is
  single-tenant scaffolding and is removed in step 2**, when every request sets the setting. Because of
  this default, none of the ~66 `create` call sites needed to change.
- Per-battalion unique indexes beside the old single-column ones (see "Expand, then contract").
- `form_counters`: each battalion numbers its 1008 forms from its own counter. `takeFormNo()` (in
  `issue-forms/form-no.ts`) takes the number inside the transaction that creates the form, so a failed form
  leaves no gap. It also never returns a number already on file, which covers the deploy overlap below.
- Lookups by a key that is only unique per battalion (`personalNumber`, item name, nickname, count
  session date+shift, day export, MFA setting) became `findFirst` / find-then-write, because Prisma has no
  single-key unique for them any more.

## The append-only tables are never updated

`movements`, `issue_forms`, `issue_form_amendments`, `item_kit_changes` and `item_replacements` have
`BEFORE UPDATE OR DELETE` triggers. The migration runs no `UPDATE` at all: `ADD COLUMN ... DEFAULT
<constant>` is metadata-only in Postgres 11+, so existing rows read the constant without a rewrite and no
trigger fires. The default is then switched to the function for future rows. The triggers are untouched
and `battalions-foundation.e2e.spec.ts` checks all five are still there.

## Expand, then contract (why the old keys are still there)

On Render the new instance runs `prisma migrate deploy` while the previous instance is still serving. If
this migration had dropped the old unique keys and the form-number sequence, the previous version would
have failed for that minute on saving a count, toggling MFA or creating a 1008 (it uses `ON CONFLICT (key)`
upserts and the sequence default). So this PR is additive only. A follow-up PR, once this is live, drops:

- the six old single-column unique indexes and swaps `app_settings`' primary key to `(battalion_id, key)`;
- `issue_forms.form_no`'s sequence default and its global unique index.

That is what makes "same personal number / item name / form number in two battalions" possible, and its
test lives in that PR.

## Checked

- Migration run on a copy of the dev database (505 soldiers, 62 movements, 21 forms): row counts
  unchanged, every row in 8239, all six triggers present, `prisma migrate diff` against the schema empty.
- New code against the new schema: API suite 314/314.
- **The currently deployed code against the new schema: API suite 302/302**, which is what the deploy
  overlap looks like.

## Deploy notes

No environment variable changes. The migration runs on boot like every other. Rolling the app code back
after this is safe (the old code still works against the new schema, as tested); rolling the database back
is not needed and not provided.

## Still true after this step, fixed in step 2

- Nothing filters reads by battalion yet. With one battalion that is correct; it must not be relied on
  once a second one exists.
- The Excel wipe-and-import deletes whole tables, across battalions. It must be scoped before a second
  battalion holds data.
