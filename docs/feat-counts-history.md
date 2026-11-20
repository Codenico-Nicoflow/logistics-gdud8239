# feat/counts-history — browse past ספירת נשקיה sign-offs

Signed `CountSession` rows were always kept in the DB, but nothing in the UI
listed them — no way to go back to a given day and see who counted, who
signed, or reprint the sheet.

## What changed

- `CountsPage` gets a "ספירות קודמות" panel listing recent sessions (from the
  existing `GET /counts/recent`): date, shift, both signers, closed status, and
  a print link. Clicking a date loads that session into the page above.
- `LatestCount` web type trimmed to match what `GET /counts/latest` actually
  returns since the מסכם rework (session metadata only — progress/mismatch
  data now lives in מסכם). The dashboard's "last count" panel was still
  reading the removed fields; it now shows just date/shift/status/recorded-by.
