# fix/print-button-csp — print pages actually print, one A4 page

## Print button did nothing

Both HTML print pages (1008, ספירת נשקיה) used `<button onclick="window.print()">`.
Helmet's global CSP sets `script-src-attr 'none'`, so the browser silently
dropped the inline handler — the button rendered but no print/save dialog
ever opened. New `apps/api/src/common/print-page.ts`: each print response gets
a fresh nonce, its own CSP (`script-src 'nonce-…'` only, `img-src data:` for
the drawn signatures), and one nonce'd script that attaches the click handler.

## Browser URL/date footer removed

`@page { margin: 0 }` on both pages leaves Chrome no room for its own
header/footer (the `localhost:…/print` line, date, page number); the sheet's
own padding is the margin instead.

## ספירת נשקיה fits one page

Items split into two side-by-side columns; fonts/row height tuned so all
~45 items plus both signer boxes fill ~80% of a single A4 page.
