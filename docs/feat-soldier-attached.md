# feat/soldier-attached — מסופח

A soldier can be marked **מסופח**: serving with the battalion temporarily
(e.g. for one תעסוקה) rather than organic to it. Default is **no**.

- The `soldiers.is_attached` column already existed (default false) but nothing
  used it — **no migration**.
- API: `isAttached` accepted on create and update, returned in the roster,
  duplicates check and single-soldier responses. An edit that omits it leaves it
  untouched.
- Who can set it: anyone who can edit a soldier — the same `soldiers` WRITE rule
  as every other field (admin, logistics, and שלישות when the permission matrix
  gives it WRITE).
- UI: a checkbox in "הוסף חייל" and in both edit dialogs (חיילים, ניפוק); a
  brass "מסופח" tag next to the name in the חיילים table; and the soldier's
  confirm step in ניפוק shows it after the name.
