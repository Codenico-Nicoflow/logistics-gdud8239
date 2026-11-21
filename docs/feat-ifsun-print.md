# Printable אפסון document (feat/ifsun-print)

`GET /ifsun/:id/print` (admin + logistics) renders the אפסון document as an HTML page: the item, the deposit half and — once closed — the collection or credit half, each with the signer's name, time, who logged it and the drawn signature. It uses the shared `sendPrintPage` (no-store, nonce'd CSP, escaped values), so the browser's print dialog produces the PDF, same as the 1008 and the count sheet.

The "מסמך" dialog on the אפסון page gets a "הדפס / שמור כ‑PDF" button that opens it.

Optional by design: the database and Excel backups remain the record; this is for the day someone outside the system needs the paper.
