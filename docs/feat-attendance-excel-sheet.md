# ימי יציאה in the backup Excel (feat/attendance-excel-sheet)

The Excel backup had no ימי יציאה sheet. It now has one: the team's weekly grid, four weeks back through two ahead, one band per week with the dates, a status cell per day (coloured for נוכח / חזרה / יציאה). A person who was removed still appears, marked "(הוסר)", in the weeks where they have entries — the same rule as the screen.

Older history is not in the workbook; the full table is in the DB backup. Listed on the סקירה sheet. Test added to `attendance-members.e2e.spec.ts` (API 114/114).
