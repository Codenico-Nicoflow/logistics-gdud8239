# feat/company-split-page — חלוקה לפלוגות (read-only)

New page `/company-split`, for admin, logistics and the samgad (not the
company deputy commander). Nav item between הקצאה לתקופת שרות and חלוקה לפי חייל.

## What it shows

- **Per company card:** the number of equipment units held now (open
  signatures of its soldiers, across all מסכם items) and **ניצול ההקצאה** —
  how much of that company's allocation for the active תקופת שרות has actually
  been issued (100% = it used everything it was allocated). Computed per item
  as `min(issued, allocated)` so one item issued past its share cannot hide an
  untouched one; going over shows separately as "חריגה מההקצאה".
- **Table:** every item flagged `מופיע במסכם`, one row each, the count held by
  each company and a total. Items nobody holds show dashes. Search + category
  filter; cards instead of a table on phones.

The editable grid stays in הקצאה לתקופת שרות; this page never writes.

## Shared item order

New `common/item-order.ts` (`ITEM_ORDER`: category, then name) is now used by
the catalog, מסכם, ספירת נשקיה, `ReportsService` and the Excel export. Before,
the catalog grouped by category while the others sorted by name only.
Verified through the API that catalog, מסכם, ספירה and this page return the
same 43 items in the same sequence.

## API

`GET /reports/companies` also allows `SAMGAD`, and each matrix row now carries
`itemId`, `category` and `inSummary`.
