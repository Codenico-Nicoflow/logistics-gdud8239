# fix: a soldier who already holds items is sent to his signatures, not to a dead button

In ניפוק, after choosing a soldier who already holds signed items, "המשך לבחירת פריט" was disabled. Changes to what someone holds (add an item, swap a מסד, return) are made in חתימות, so the screen only said so and left the operator to find him again.

Now the button is replaced by "מעבר לחתימות של החייל": it opens חתימות with that soldier selected and his name already in the search, so he is on screen immediately.

- The soldier and the search travel in router state, not in the address, so a name never ends up in a URL (`DocumentsLocationState`; anything that is not that shape is ignored).
- A soldier who is not enlisted keeps the disabled "המשך" and the warning, since the way forward there is to enlist him.
- The guide's ניפוק topic describes the new button.

Tests: `ConfirmSoldier.test.tsx` (continues for a free soldier, goes to signatures for a holder, still blocks a non-enlisted one) and `DocumentsPage.test.tsx` (opens the soldier it was sent, ignores foreign state). Also checked in a real browser.
