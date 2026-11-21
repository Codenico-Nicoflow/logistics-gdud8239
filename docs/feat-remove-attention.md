# feat/remove-attention — remove דרוש טיפול

The page listed signatures flagged `needsAttention`, which only the old Excel
import ever set (a serialized item with no מסד). The API now refuses to create
a serialized signature without one, so nothing can add to the list. The 55
open entries were all "חסר מסד" from the 9.11 import and none of the 55
signatures they point at exist anymore — nothing to fix.

Removed: the page + route, `GET /items/needs-attention`,
`POST /signatures/:id/backfill-serial`, the `needsAttentionOnly` filter, the
dashboard tile, the badges in חתימות, the "דרוש טיפול" Excel sheet and the
flagged count in the Slack snapshot caption.

Kept on purpose: the `Signature.needsAttention` column and the
`ImportIssue`/`ImportLog` tables (migration history, no data loss). Dropping
them is a separate, destructive migration.
