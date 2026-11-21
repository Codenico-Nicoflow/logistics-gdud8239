# feat/mesakem-finish-and-corrections

Two gaps around "סיים יום ושלח" and what a signed count means.

## 1. Confirm before finishing the day
"סיים יום ושלח" asks first: the date, how many of the items are filled, a red
warning if some will go out empty, and — if the day was already sent — that it
will be sent again **marked "מתוקן"** (file name and Slack comment), so two
files for one day are distinguishable.

## 2. A signed count no longer changes under its signers
Before, a closed count read מסכם live — editing מסכם after signing silently
changed what the signed sheet printed. Now **closing a count freezes the
figures it signed** (`count_session_figures`); the screen, the printout and the
Excel sheet read those for a closed count. Counts closed before this change have
none stored and fall back to the live numbers.

## 3. Correcting מסכם after a count was signed (the 19:30 emergency)
A night's two counts (the evening of D, the morning of D+1) both sign D's
מסכם. If מסכם D is changed while either is **closed** and a number actually
moves:
- a reason is required (the page asks; the API enforces with 409 otherwise);
- those counts are **reopened**: signatures cleared, frozen figures dropped,
  a `count_session_reopens` row written ("תיקון מסכם <date>: <reason>"), and
  both signers sign again on the corrected numbers.
Admin **and logistics** can do this (it is just saving מסכם, which both already
could). The standalone "בטל סגירה" button stays admin-only. Saving unchanged
numbers never touches a signature.

## 4. Count still open (counting in progress, someone needs an item)
Nothing to reopen: an open count reads מסכם live, so a מסכם edit flows straight
into it. The count screen shows a red notice when מסכם changed after the count
was last saved, so the signers re-check the numbers before signing.

Migration `count_session_figures` (auto-applied on deploy).
