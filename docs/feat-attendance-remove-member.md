# ימי יציאה: remove a team member (feat/attendance-remove-member)

The screen could add team members but not remove them.

- Admin sees a "הסר מהרשימה" button per person (desktop table row and phone card), with a confirmation.
- Removal is a deactivation (`isActive: false` through the existing `PATCH /attendance/members/:id`), never a delete: the person's entries stay in the database.
- `GET /attendance/week` now also returns a removed person for any week in which they have entries, marked `isActive: false` and tagged "הוסר" in the grid. Weeks with no entries for them no longer list them. So removing someone changes the roster going forward without rewriting past weeks.

Test: `test/attendance-members.e2e.spec.ts`. API 109/109, web typecheck clean. Not checked in a browser.

## Update: removal is now a real delete (fix/attendance-delete-member)
Deactivating left the nickname taken (it is unique) and invisible, so a removed person could never be added again. Removal is now `DELETE /attendance/members/:id` (admin): the person and all their entries (the FK cascades) are deleted, from every week and from the next backup. The confirmation says so and that it cannot be undone.

- The week view lists active members only again; the "הוסר" tag and the "(הוסר)" mark in the Excel sheet are gone.
- Adding a name that an earlier deactivate-only removal left behind clears that leftover first, so it can be used again. Such leftovers are inert (hidden everywhere) until then; nothing is purged in bulk.
- `PATCH` with `isActive` still exists but nothing in the UI uses it.
