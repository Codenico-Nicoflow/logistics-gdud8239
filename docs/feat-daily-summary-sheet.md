# feat/daily-summary-sheet — daily ספירת נשקייה with signatures

Extends the existing count-sheet feature (`CountsPage`, `counts` module) into the full
daily flow the battalion runs by hand in Excel: fill the physical count twice a day
(morning/evening), compare against מצבה/מנופק, sign it with both parties, and print it
so a signer who isn't present yet can sign the paper copy.

## What changed

- `CountSession` gained `responsibleSignatureImage` / `officerSignatureImage` — same
  drawn-PNG pattern as a 1008's `signatureImage`. Nullable: the printed sheet shows
  "ממתין לחתימה" for whichever side hasn't signed on-device yet.
- New `GET /counts/:id/print` — renders the signed sheet as print-ready HTML
  (`count-session.html.ts`), same approach as `issue-form.html.ts`: browser handles
  Hebrew bidi/RTL, "הדפס / שמור כ-PDF" uses the browser's own print dialog.
- `CountsPage` now has a signer panel (name/מ.א./דרגה + `SignaturePad` per side) and a
  "חתום וסגור ספירה" action that saves the current count and calls the existing
  `close` endpoint in one step. Closing requires both signatures.
- Access narrowed to `admin`/`logistics` only (dropped `viewer`) on every counts route,
  including the new print route, and on the `/counts` nav route in `App.tsx`.

## Why no new DB fields beyond the two signature images

Columns like מק"ט and בבקשה from the old Excel sheet don't map to anything real here —
confirmed with the user these were either not needed or already covered by existing
fields (מצבה = `authorizedQty`, מנופק = open `signature` quantity sum, which the sheet
endpoint already computed before this branch).
