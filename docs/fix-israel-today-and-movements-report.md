# fix/israel-today — Israeli "today" + דוח תנועות: date picker and צל"מ-only

## "Today" was the UTC date
`new Date().toISOString().slice(0, 10)` is the UTC date, so between midnight
and 02:00–03:00 Israel time מסכם, ספירת נשקיה and ימי יציאה opened on
yesterday — exactly when late counts get filled in. New shared helpers:
`apps/web/src/lib/dates.ts` (`todayIso`, `addDays`) and
`apps/api/src/common/israel-date.ts` (`israelToday`, `israelDayStart`,
`israelDayEnd`, with unit tests incl. the 25-hour day when daylight saving
ends). The attendance ±1-week clamp and the export file names use it too.

## דוח תנועות: date filter was wrong
`from`/`to` arrived as UTC midnight and `to` was applied as "up to midnight",
so from = to = today returned almost nothing, and day edges were 2–3 hours off.
A date-only value now means the whole Israeli calendar day (`from` = start,
`to` = end, inclusive). Note: the global pipe's `enableImplicitConversion`
turns the value into a `Date` *before* a `@Transform` runs, so the DTO reads
the raw query value (`obj`). The new e2e test uses the same pipe options as
`main.ts` and fails against the broken version.

## דוח תנועות: צל"מ items only
Bulk accessories with no מסד (מחסנית, מק פורק, רצועה…) are no longer listed or
exported — enforced in the query (so counts and paging are right), not hidden
client-side. The "הצג רק פריטי צל"מ" switch, the `hideRoutine` export option
and the `routine` row field are removed. The movements stay in the append-only
log; the report just never lists them.

## דוח תנועות: date picker
היום (default) · אתמול · 7 ימים אחרונים · תאריך מסוים (one date, plus an
optional "until" date for a range). The Excel export follows the same range.
