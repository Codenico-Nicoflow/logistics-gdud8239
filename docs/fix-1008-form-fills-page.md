# fix: the printed 1008 fills the whole A4 sheet

The printed form only used about 80% of the page, leaving blank paper under the signatures. The sheet is now a full-height column: the item table takes whatever height the header and the signing block leave, so the form always fills the page and the issuer/borrower signatures sit at its foot.

- All table rows start at the same height, so filled and ruled-empty rows look alike however many items there are.
- Up to 14 lines the sheet stretches to one page. A longer form flows over several pages as before (`MAX_FILL_LINES`): Chrome lets text overlap the last rows when a table inside a flex column has to split across pages, so stretching is not used there.
- The on-screen preview is page-sized too (`min-height: 297mm`), so it looks like what prints. Print uses `296mm`, since an exact-height box tips onto a blank second page in Chrome.

Checked by printing to PDF at 1, 6, 12, 14, 15 and 30 lines.
