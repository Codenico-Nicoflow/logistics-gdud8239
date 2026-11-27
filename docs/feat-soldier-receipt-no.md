# מספר קבלה per soldier

When a call-up ends, a soldier's personal weapon stays in the armory with a paper note on it. The number on that
note is the soldier's **מספר קבלה** for the next call-up, so the weapon can be found by eye.

## What it does

- It is a field on the soldier (`soldiers.receipt_no`, which already existed but had no screen). It can be set and
  edited before the soldier has any weapon: when adding a soldier, in his edit dialog, and in the confirm step of ניפוק.
- **Unique within a company, not the battalion.** Each company numbers its own (1-100 in פלוגה א and 1-100 in פלוגה ב).
  A partial unique index on `(battalion_id, company, receipt_no)` backs it; moving a soldier to a company where his
  number is taken is refused, and the error names the holder.
- **A hint, not a counter.** `GET /soldiers/receipt-hint?company=` returns the highest plain number the company has
  used (deactivated soldiers count, their weapon may still be on the shelf) and the one after it. Free text such as
  "12א" is ignored. The field shows both and fills in the next one on a tap.
- **At ניפוק (1008, and reissue)** the field starts from the soldier's saved number, so signing him a second time needs
  no typing. A number typed there is saved on the soldier in the same transaction as the form. If it is left blank the
  saved number is used and printed on the form.
- **Required for a weapon.** A form with a `WEAPON` line is refused without a number (the web disables signing and says
  why); equipment-only forms do not need one, since there is nothing to find on the shelf.
- Searchable on the soldiers screen and shown as a column.

## Not covered

- The older direct-sign path in `SignaturesService` still takes a free `receiptNo` on the signature and does not touch the
  soldier; the web issues through 1008.
- Editing a signed form's number (`PATCH /issue-forms/:id`) does not write back to the soldier.

## Deploying

The migration trims blank or padded numbers, then creates the index. Production was checked first: 5 numbers filled, no
duplicates, so it applies cleanly.
