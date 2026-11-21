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
