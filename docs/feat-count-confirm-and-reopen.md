# feat/count-confirm-and-reopen

## Confirm before closing a count
"חתום וסגור ספירה" now opens a confirmation dialog (date, shift, item count and
both signers' names; warns that only an admin can undo it). It only appears once
the form is complete, so nobody is asked "are you sure?" about something that
would just fail.

## Admin can cancel a closed count
`POST /counts/:id/reopen` (admin only, reason required, min 3 chars):
- sets the count back to open and **clears both signatures** — they signed a
  sheet that is about to change, so a corrected one must be signed again.
  Names, מ.א. and דרגה are kept so they need not be retyped;
- records who, when and why in the new `count_session_reopens` table
  (migration `count_session_reopens`);
- the page shows an admin-only "בטל סגירה" button with a reason dialog, and a
  note under the header once a count has been reopened ("נפתחה מחדש על ידי … —
  <reason>"), also after it is closed again.

Closing again needs both signatures, as before. Non-admins get 403.
