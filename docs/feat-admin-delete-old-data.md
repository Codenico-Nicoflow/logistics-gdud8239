# feat/admin-delete-old-data

Admin-only cleanup of data that is no longer needed.

## Backups (`/backups`)
`DELETE /snapshots/:id` and `DELETE /db-backups/:id` (admin, as the whole
controller already is). Removes the row and the file on disk. A copy already
sent to Slack is not touched — the app has no way to delete from there.
UI: a "מחק" link per row with a confirm dialog.

## Counts (`/counts` → ספירות קודמות)
`DELETE /counts/:id` (admin, reason required, ≥3 chars):
- **only a count that is not closed.** A signed sheet must first be cancelled
  with "בטל סגירה", so the record shows it was closed, then undone, then deleted;
- writes `count_session_deletions` (date, shift, names, who, why, when) — no
  relation to the session on purpose, so it outlives it. The earlier
  `count_session_reopens` rows cascade away with the session; the deletion row
  is the surviving trace.
UI: admin-only "מחק" column; disabled with a hint on closed counts.

Migration `count_session_deletions` adds the log table (auto-applied on deploy).
