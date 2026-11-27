# 1008 over several pages

A form with many lines (a large kit, 30+ items) used to print as one long table that spilled onto a second page,
with the signatures only on the last page.

Now the printout is **one whole 1008 per page**, at most 12 item rows each (the rows of the paper form):

- Every page has the same header (unit, form number, receipt number, company, phone), the declaration, and both
  signature boxes. The soldier signs once; the same signature image is printed on every page.
- Footer on a multi-page form: `טופס 1001 · עמוד 2 מתוך 4`. A one-page form is unchanged.
- Row numbers run straight through (page 2 starts at 11 after a 10-row page 1).
- Lines are spread evenly: 37 lines are 10 + 9 + 9 + 9, never 12 + 12 + 12 + 1.
- Each page is padded to 12 ruled rows like the paper form; only the last page numbers its empty rows.
- On screen the sheets stack, one per page, as they print.

Nothing is stored differently: the form is still one `issue_forms` row with all its lines, one signature and one
number. Pagination is a print-time layout only (`paginate()` in `issue-form.html.ts`). Tested in
`issue-form.html.spec.ts` and by printing 6, 12, 13 and 37 lines to PDF (1, 1, 2 and 4 pages).
