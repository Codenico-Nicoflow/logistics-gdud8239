# 1008 over several pages

A form with many lines (a large kit, 30+ items) used to print as one long table that spilled onto a second page,
with the signatures only on the last page.

Now the printout is **one whole 1008 per page**, at most 12 item rows each (the rows of the paper form):

- Every page has the same header (unit, form number, receipt number, company, phone), the declaration, and both
  signature boxes. The soldier signs once; the same signature image is printed on every page.
- Footer on a multi-page form: `טופס 1001 · עמוד 2 מתוך 4`. A one-page form is unchanged.
- Each page is filled to 12 rows before the next starts: 37 lines are 12 + 12 + 12 + 1. Row numbers run straight
  through (page 2 starts at 13).
- The last page is padded to 12 ruled rows like the paper form.
- On screen the sheets stack, one per page, as they print.

Nothing is stored differently: the form is still one `issue_forms` row with all its lines, one signature and one
number. Pagination is a print-time layout only (`paginate()` in `issue-form.html.ts`). Tested in
`issue-form.html.spec.ts` and by printing 6, 12, 13 and 37 lines to PDF (1, 1, 2 and 4 pages).

## Not printed, but kept

- **Form number:** no longer on the sheet (neither the masthead nor the footer). It is still stored and still the
  number every screen quotes; the browser tab title (the default name of a saved PDF) still carries it so two saved
  forms of one soldier do not collide.
- **"Replaces form N":** a reissue used to type this sentence into the form's notes, so it printed. It is now its own
  column, `issue_forms.supersedes_form_id`, and the sentence stays on the movements the reissue writes (the audit
  trail). The form's `notes` hold only what the operator wrote.
