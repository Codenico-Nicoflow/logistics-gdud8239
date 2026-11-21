# feat/backups-rework — new Excel workbook, SQL backups first, no Excel import

## Excel import removed
`POST /excel/import/{preview,commit}`, `ExcelImportService`, the upload panel
and its web mutations/types are gone. The import was a wipe-and-replace of all
signatures from a spreadsheet; Excel is no longer the master copy. The
`ImportIssue`/`ImportLog` tables stay (history). `ExcelModule`/`SnapshotsModule`
no longer need `forwardRef` (the cycle only existed for the import).

## גיבויים page
Full SQL (pg_dump) backups first, the Excel file second. Restore stays a manual
step (a restore replaces the whole production database).

## New workbook (`GET /excel/export` and the daily 18:00 Slack file)
One sheet per page people use, same item order everywhere, same look as מסכם
and דוח תנועות (`excel-theme.ts`):

| Sheet | Mirrors |
|---|---|
| סקירה | cover: headline numbers + linked table of contents |
| מסכם | the מסכם page (today) — built by `MesakemService.addSheet` |
| ספירת נשקיה | latest count day: בנשקייה per item, who counted/signed evening and morning, with the drawn signatures embedded as images |
| חתימות | everything signed out now, by company and soldier |
| חלוקה לפלוגות | what each company holds + allocation use % per company |
| חלוקה לפי חייל | per-soldier allocation vs issued, by company |
| דוח תנועות יומי | all movements, by day — `MovementsService.addMovementsSheet` |

Dropped: צלמ (re-import format), פלוגות, הקצאות (read the dead `allocations`
table), מחירון (0 items priced), רשימת שמות נשק, דרוש טיפול (removed in #13).

## Removed leftovers
`ReportsService.allocations()` + `AllocationRow`, the old sheet builders,
`SHEET`/`SIGNATURES_HEADER`/import lookups in `excel.constants.ts`, and the now
unused `issueKinds` strings / `IssueKind` type.

## Not done
- The old `allocations` table (65 rows) still exists (`ItemsService.remove`
  clears it); dropping it is a separate, destructive migration.
- ימי יציאה has no sheet.
