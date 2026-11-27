# Dialogs opened inside dialogs

The item picker ("הוסף פריט") opened from the edit-a-signed-form dialog had its "בחר פריטים" button below the fold: the
only way to reach it was to scroll the outer dialog.

**Cause.** `Modal` is `position: fixed`, but the outer dialog has a `backdrop-filter` and an entrance animation, and a
filtered or transformed ancestor becomes the containing block of its fixed descendants. The picker was therefore
sized to the outer dialog (measured in Chromium: 600x768 instead of the 1000x800 viewport) and scrolled with it, so its
pinned footer was pinned to the bottom of a box that was itself scrolling.

**Fix.** `Modal` renders through a portal into `document.body`, so every dialog is framed by the screen no matter where
it is opened from. This applies to every nested dialog in the app (confirmations over forms, the picker over the
reissue dialog). Test: `components/Modal.test.tsx`.
