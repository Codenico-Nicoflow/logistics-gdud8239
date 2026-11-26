# feat/issue-draft-persist — an unsigned ניפוק survives leaving the page

On a phone it is easy to lose the basket: a stray tap, a reload, or iOS discarding a background Safari tab remounts the page, and the soldier, the items, each מסד, the notes and the receipt number were gone.

The unsigned form is now kept in `localStorage` (`issue-drafts-v1`, `features/issue/issueDraft.ts`):
- **One draft per soldier.** Stepping back to the search and picking the same soldier again returns his basket (at the step he was on); picking anyone else starts clean. This also fixes the previous soldier's lines carrying over when you went back to the search.
- **Resumes after a reload.** The page reopens on the soldier that was being served, with a notice and a "מחק והתחל מחדש" button.
- **Never stored:** the signature (the soldier signs once, for exactly what is on screen).
- **Cleared** when the form is signed, or discarded. Drafts older than 24 h are dropped; at most 20 are kept; unreadable or blocked storage just means no draft.
- A plain weapon row that carries a מסד reopens with the מסד field showing.

Tests: `issueDraft.test.ts` (storage rules), `IssuePage.resume.test.tsx` (page returns to the basket, discard).
