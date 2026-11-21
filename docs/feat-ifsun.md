# אפסון (feat/ifsun)

A soldier can leave a signed item (a weapon, an optic) in the armory instead of taking it home. It stays on his signature, but physically it is on the shelf, so the nightly ספירה and the מסכם must count it as present.

## Model
- `ifsun_records` (migration `20261121120000_ifsun`): one row per stay — signature, snapshots of soldier/item/serial, quantity, `status` (מאופסן / נלקח / זוכה), who stored it and when, who closed it and when. History is kept; nothing is deleted.
- New movement actions `STORE` (אופסן) and `COLLECT` (נלקח מאפסון) in דוח תנועות. Credit writes a normal `RETURN`.

## Count integrity
`מנופק` in מסכם / summary = open signatures − stored units (`ifsun/stored-qty.ts`). The stored unit moves to the armory side, so מצבה − (מנופק + בנשקייה) stays 0 when the shelf count includes it.

## Rules
- Store: open signature, not already stored; serialized = 1 unit.
- Collect: closes the record, the item counts as out with the soldier again.
- Credit (soldier never came back): closes the record and credits the signature in one transaction.
- A stored signature cannot be returned from חתימות, and a soldier with stored items cannot have his 1008 re-issued — both would orphan the record. Collect or credit first.

## UI / access
- Nav `אפסון` (admin + logistics only, API too): list of what is stored, history tab, search, "אפסון חדש", collect / credit buttons. Card list, works on a phone.
- חתימות: stored items show a `מאופסן` tag and an `אפסן` button; מסכם shows the stored units next to מנופק.

## Backups
Excel export gets an `אפסון` sheet (what is stored now) and an `אפסון` column on `חתימות`. The pg_dump backup includes the new table automatically; Excel carries only what is stored now, full history lives in the DB dump.

## Only important items
Only WEAPON / OPTICS / DRONE can be stored (`ifsun-rules.ts`, enforced by the API, mirrored in the UI). Slings, magazines, gear and ammo are refused. The rules (strip sling and magazine, put a note with the soldier's name on the weapon, update the system and verify) are shown at the top of the אפסון page.

## Signed document
Deposit and collection are each signed on the device with the same pad as the 1008.
- Deposit: the depositor signs (the soldier by default; tick "someone else" and enter a name otherwise).
- Collection: whoever takes it out signs — the soldier, or a person collecting for him, named on the record.
- Credit (soldier never returned): no signature, it is the armory's own decision, recorded with who did it and the note.
- Stored on `ifsun_records` as PNG data URLs plus the signer's name (migration `20261121150000_ifsun_signatures`), written once and never edited. The list endpoint omits the images; `GET /ifsun/:id` returns them, and the "מסמך" button on every record shows both halves with times.
- Backups: images live in the DB, so the pg_dump backup carries them. The Excel export stays a summary without images.

## History at scale
`GET /ifsun` filters on the server by `status`, `q`, and `from`/`to` (the day it was stored, whole Israeli days, same parsing as דוח תנועות) and pages with `skip`/`take` (default 50). The history tab has date range, status and search, 25 per page with previous/next and a "page X of Y · N records" line. Changing a filter returns to page 1.
