# 1008 with long text

A form whose rows wrapped (long item names, serials, line notes, or a long form note) overflowed its page: the table
split across two printed pages and, on the second, the notes and declaration printed over the last rows. Pagination
counted rows and assumed every row was one line.

## What changed (`issue-form.html.ts`)

- **Fixed column widths** (`table-layout: fixed`, `overflow-wrap: anywhere`). With auto widths a long note widened its
  column and squeezed the others, so a row's height depended on its neighbours.
- **Pages are cut by height as well as by row count.** `rowHeightMm` is measured in Chromium's print layout: 8.4 mm for
  a one-line row plus 5.7 mm per extra line; a line holds about 27 characters in the description, 11 in the
  identifier column (it breaks anywhere) and 21 in the notes. A page takes rows until the next would not fit in
  142 mm (the room for rows is about 154 mm; the rest is margin for a wrapped header or party name), or until it has
  12 rows. The form's own notes print on every sheet, so their height (`notesHeightMm`) comes off every page's budget.
  A row too tall for any page still gets a page of its own.
- **Blank rows only fill spare room.** They used to pad every page to twelve rows, which pushed a page of tall rows past
  the page. They now fill whatever height the real rows leave, up to twelve rows.

## Verified

Fifty-eight forms were printed to PDF with Chromium: the worst cases (twelve rows of 80-character names, 40-digit
serials, 200-character notes and a 500-character form note; long soldier and company names; a single huge row) and
fifty random ones. In every one the number of printed pages equals the number of sheets and no sheet overflows. Unit
tests cover the height model, the split, and that no line is lost or reordered.

The 27 / 11 / 21 characters per line were measured with Hebrew words; text with very wide characters may wrap more.
The 142 mm budget leaves about 12 mm of margin for that.
