# feat/remove-unused-pages

Removed four pages that no menu item or link pointed to:

| Page | Why |
|---|---|
| לוח בקרה (`/dashboard`) | not in the menu, never the landing page |
| פלוגות (`/companies`) | replaced by חלוקה לפלוגות |
| הקצאות (`/allocations`) | read the old `allocations` table the app no longer uses |
| דוח תנועות (`/movements`) | replaced by דוח תנועות יומי |

The old URLs now redirect to the role's landing page.

Also removed what only they used: `GET /attendance/today` (+ `AttendanceService.today`),
`GET /counts/latest` (+ `CountsService.latest`), `GET /reports/allocations`, the
`dashboard.e2e.spec.ts` tests for the first two, the matching web queries/types
and Hebrew strings.

## Deliberately left for the Excel/backups rework

Remove these once the workbook is redone (the old sheets still depend on them):

- `ReportsService.allocations()` + `AllocationRow` — feeds the old **הקצאות**
  sheet in `ExcelExportService`; it reads the old `Allocation` table.
- The old **פלוגות** / **הקצאות** / **צלמ** / **מחירון** / **רשימת שמות נשק**
  sheet builders in `excel-export.service.ts`.
- Then the old `allocations` table itself (65 rows; `ItemsService.remove` still
  clears it) — a separate, destructive migration.

Also left alone: web hooks that were already unused before this change
(`useSignaturesQuery`, `useIssueItemMutation`, `useAddInstanceMutation`,
`useTeamMembersQuery`, `useIssueBundleQuery`).
