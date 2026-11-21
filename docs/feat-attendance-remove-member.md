# ימי יציאה: remove a team member (feat/attendance-remove-member)

The screen could add team members but not remove them.

- Admin sees a "הסר מהרשימה" button per person (desktop table row and phone card), with a confirmation.
- Removal is a deactivation (`isActive: false` through the existing `PATCH /attendance/members/:id`), never a delete: the person's entries stay in the database.
- `GET /attendance/week` now also returns a removed person for any week in which they have entries, marked `isActive: false` and tagged "הוסר" in the grid. Weeks with no entries for them no longer list them. So removing someone changes the roster going forward without rewriting past weeks.

Test: `test/attendance-members.e2e.spec.ts`. API 109/109, web typecheck clean. Not checked in a browser.
