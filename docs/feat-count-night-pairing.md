# feat/count-night-pairing — a night is the evening plus the morning after

A "night" is the evening count of day D and the morning count after it (D+1).
Both sign the same figure: the בנשקייה entered in מסכם at the end of D (nothing
is issued overnight, and D+1's מסכם is still empty when the morning count is
done).

## Screen (`CountsService`)
`figureDateFor(date, shift)`: evening → that day's מסכם, **morning → the day
before's**. Applied to the sheet and to the printout. The sheet response carries
`figureDate`, shown above the table ("ספירת הבוקר חותמת על המספר שהוזן במסכם
בסוף יום …"). Before, a morning count showed D+1's empty מסכם — all dashes.

## Excel sheet ספירת נשקיה
Previously paired an evening and a morning of the *same date*, so a morning
count (which is saved under its own date) never appeared next to the evening
before it, and signing the morning made the evening disappear. Now it picks the
night containing the latest count: latest is an evening on D → morning D+1
pending; latest is a morning on M → evening M-1 (may be missing, e.g. after
Shabbat). Columns are headed with their dates and the figure's מסכם day.

No schema change.
