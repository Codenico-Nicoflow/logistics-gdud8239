# feat/issue-item-picker

Changes to adding items in ניפוק (the basket step; also used by "ערוך פריטים").

## Dropdown, multi-select
The item search is now a dropdown of the whole catalog, filtered as you type.
Tick several items and add them in one go ("הוסף N נבחרים"). Items are added one
by one, so a warning on one (not enlisted, over allocation, duplicate) is shown
and answered before the next is added.

## A second unit of the same serialized item
Before, an item already in the basket was hidden from the search, and rows were
keyed by item, so two M-4s or two מאג were impossible. Now:
- rows have their own id; the same serialized item can be on several rows, each
  with its own מסד (the server already handled this);
- adding it again asks first ("M-4 כבר ברשימה … להוסיף עוד אחת?") and then
  allows it;
- a non-serialized item already in the basket stays greyed out in the dropdown:
  two rows with no מסד would collapse into one signature, so its quantity is
  edited on the existing row.

The "one live 1008 per soldier" rule is unchanged: a soldier who already holds
equipment is edited through חתימות ← ערוך פריטים, which uses the same basket, so
the second M-4 works there too.

## Case-insensitive search
"m-4" finds "M-4": item search in the picker and in מיפוי שמות (shared
`lib/search.ts`, unit-tested), and serial searches on the server (signatures
list, דוח תנועות). Soldier name search already was.

## Wording
- The empty basket no longer says "בחר ערכה" (there are no kits any more).
- The missing-מסד message names the items: "חסר מסד בפריטים הבאים … M-4 ×2".
