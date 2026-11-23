# feat: know which units are in repair

The catalog showed "בתיקון" as one typed number, with no way to see which unit it was, and for a serialized item that number could disagree with the מסדים actually marked בתיקון.

## Serialized items
Their repair list is the מסדים marked בתיקון in the מסדים dialog. `repairQty` and `repairSerials` are now derived from those instances when the item is read, so the number can never drift from the dialog. The edit form shows it read-only (with a link to the מסדים) and sends neither field. The typed field is ignored by the API, and cleared if a bulk item becomes serialized.

## Bulk items
The typed count stays, with the מסדים of those units beside it (`items.repair_serials`). A unit may have no מסד, so the list can be shorter than the count, but never longer: the API refuses more מסדים than units in repair, repeats (any case), and lowering the count below the listed מסדים. In the edit form the list stops accepting at the count ("העלו את כמות הפריטים בתיקון כדי להוסיף").

The catalog table and the phone cards show the מסדים under the count.

## Tests
`item-repair.e2e.spec.ts` (bulk rules, serialized derivation including OK / FAULTY / IN_REPAIR, bulk ↔ serialized), `CatalogPage.test.tsx` (display, the editor and its limits, what is saved for each kind).
