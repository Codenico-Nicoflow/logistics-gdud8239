# Drop the old `allocations` table (chore/drop-old-allocations-table)

`allocations` (item × company target quantities) predates the תקופת שרות model and was replaced by `company_allocations` and `soldier_allocations_v2`. The only code left touching it was the dev seed (the `ALLOCATIONS` sheet data) and one cleanup line in `items.service#remove`. Both are removed, along with the `Allocation` model and the `Item.allocations` relation; migration `20261122100000_drop_old_allocations` runs `DROP TABLE "allocations"`.

## Destructive — read before merging
Render runs `prisma migrate deploy` on start, so merging drops the table on production. Production has **65 rows** in it (old target quantities nobody reads). They are not copied anywhere else; the last full DB backup still holds them, and a fresh backup before merging keeps them recoverable.

## Rehearsal
The migration was run against a scratch copy of the real production backup (restored with `scripts/restore-db.sh`): applied cleanly, `allocations` gone, `company_allocations` 70, `soldier_allocations_v2` 14, items 67 and soldiers 454 unchanged. The schema and the migrations agree afterwards (`migrate diff` is empty). API tests green.
