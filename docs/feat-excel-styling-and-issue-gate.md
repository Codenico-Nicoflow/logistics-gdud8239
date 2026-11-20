# feat/excel-styling-and-issue-gate

## Styled Excel exports (דוח תנועות, מסכם)

Both exports used a single grey header row and nothing else. New shared
`apps/api/src/excel/excel-theme.ts` gives every exported sheet the same look:

- dark-green title banner ("גדוד 8239 · …"), light subtitle line (date range /
  generated-at), brass rule under it — same masthead as the printed 1008
- KPI tiles row (e.g. תנועות / ניפוקים / זיכויים / חיילים, or פריטים / מולאו /
  תקינים / בפער)
- green header row, zebra body rows, thin grid, RTL sheet, gridlines hidden
- tinted pills: ניפוק green / זיכוי blue; category colors; gap "✓ תקין" green
  vs "חסר N" / "עודף N" red
- brass day-band rows in דוח תנועות with per-day counts
- dark totals row; frozen header, filters, A4-landscape print setup with footer

מסכם also gets a "הורד Excel" button (`GET /mesakem/export?date=`) — before
this it could only be sent to Slack.

## ניפוק blocked for a non-מחויל soldier

`ConfirmSoldier` already warned when `isEnlisted === false` but still let the
operator continue. The "continue" button is now disabled in that case. Note
the API itself only refuses *weapons* for a non-מחויל soldier; the UI now
blocks the whole flow, per the battalion's request. `isEnlisted === null`
(no active תקופת שרות) is unchanged.
