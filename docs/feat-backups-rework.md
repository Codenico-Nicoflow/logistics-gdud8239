# feat/backups-rework (in progress — not pushed)

Done so far:
- Excel import removed (routes `/excel/import/*`, `ExcelImportService`, the
  upload panel, web mutations/types). It was a wipe-and-replace of all
  signatures from a spreadsheet; Excel is no longer the master copy.
  `ImportIssue`/`ImportLog` tables are left alone (migration history).
- `ExcelModule`/`SnapshotsModule` no longer need `forwardRef` (the cycle only
  existed because the import endpoint needed snapshots).
- גיבויים page: full SQL backup panel first, Excel snapshot panel second.

Deliberately held until new pages exist: restyling the full Excel workbook.
Its sheets must mirror real pages, and several (פלוגות/הקצאות/חלוקה) don't
have a page yet; הקצאות currently reads the old `allocations` table.
