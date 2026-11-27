import type { CountShift } from '@prisma/client';
import type { CountSheetRow } from './counts.service';
import { printButton } from '../common/print-page';
import type { Unit } from '../battalion/battalion.service';

export type CountSessionForPrint = {
  sessionDate: Date;
  shift: CountShift;
  responsibleName: string | null;
  responsiblePn: string | null;
  responsibleRank: string | null;
  responsibleSignatureImage: string | null;
  officerName: string | null;
  officerPn: string | null;
  officerRank: string | null;
  officerSignatureImage: string | null;
  rows: CountSheetRow[];
};

function esc(value: string | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function formatDate(d: Date): string {
  // A date column arrives as midnight UTC; read it in Israel's calendar like every other printed date.
  return d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' });
}

const SHIFT_HE: Record<CountShift, string> = { EVENING: 'ספירת ערב', MORNING: 'ספירת בוקר' };

/**
 * `ספירת נשקייה` as a print-ready page — one shift's signed sheet.
 *
 * Shows only the day's בנשקייה figure (from מסכם) per item, plus the two
 * signer boxes (אחראי משק ארמון, בעל תפקיד ארמון) — this screen signs off on
 * an existing number rather than re-deriving מצבה/מנופק/פער, which מסכם
 * already computes once a day. Rendered as HTML, same reasoning as the 1008
 * printout (`issue-form.html.ts`): the browser's own bidi handling is correct
 * for Hebrew, a PDF library's would need a bundled font and its own.
 */
export function renderCountSession(session: CountSessionForPrint, unit: Unit, nonce: string): string {
  // Split into two side-by-side columns so ~45 items plus both signer boxes
  // fit one A4 page, the way the paper sheet is filed.
  const half = Math.ceil(session.rows.length / 2);
  const columns = [session.rows.slice(0, half), session.rows.slice(half)];
  const table = (list: CountSheetRow[], offset: number): string => `
    <table>
      <thead>
        <tr><th class="narrow">מס"ד</th><th>שם פריט</th><th class="qty">בנשקייה</th></tr>
      </thead>
      <tbody>${list
        .map(
          (r, i) => `
        <tr>
          <td class="c narrow">${offset + i + 1}</td>
          <td>${esc(r.itemName)}</td>
          <td class="c qty">${r.nashkiyaQty ?? ''}</td>
        </tr>`,
        )
        .join('')}${list.length < half ? '<tr><td class="c narrow"></td><td></td><td class="c qty"></td></tr>' : ''}</tbody>
    </table>`;
  const tables = `<div class="cols">${table(columns[0], 0)}${table(columns[1], half)}</div>`;

  // The item list grows over time; rows stay at their comfortable size while
  // they fit and only shrink (font with them) once the list would otherwise
  // spill onto a second page. ~178mm is what's left of A4 after the masthead,
  // table header, both signer boxes and the footer.
  const rowMm = Math.min(7.4, Math.max(3.6, 178 / Math.max(half, 1)));
  const rowFontPt = rowMm >= 6 ? 10.5 : rowMm >= 4.8 ? 9 : 7.5;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>ספירת נשקייה ${esc(unit.name)} — ${SHIFT_HE[session.shift]} — ${formatDate(session.sessionDate)}</title>
<style>
  /* margin: 0 leaves the browser no room for its own header/footer (URL,
     date, page number); the sheet's padding below is the real margin. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Assistant, "Segoe UI", Arial, sans-serif; color: #000; background: #fff; font-size: 10.5pt; line-height: 1.25; }
  .sheet { width: 210mm; margin: 0 auto; padding: 10mm 10mm; }

  .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8pt; border-bottom: 2px solid #000; padding-bottom: 5pt; }
  .unit-no { font-size: 15pt; font-weight: 700; letter-spacing: .04em; }
  .unit-no small { display: block; font-size: 7.5pt; font-weight: 400; letter-spacing: 0; }
  .titles { text-align: center; flex: 1; }
  h1 { font-size: 17pt; margin: 0; }
  .doc-no { font-size: 10pt; white-space: nowrap; text-align: left; }
  .doc-no strong { display: block; font-size: 13pt; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin: 9pt 0; align-items: start; }
  table { width: 100%; border-collapse: collapse; }
  /* Row height in mm, not font/padding — mm is tied to the paper, so the
     sheet lands at ~80% of an A4 page whatever the browser's print scale. */
  tbody td { height: ${rowMm.toFixed(2)}mm; font-size: ${rowFontPt}pt; }
  thead th { height: 7mm; }
  th, td { border: 1px solid #000; padding: 0 5pt; text-align: right; vertical-align: middle; }
  th { background: #e8e8e8; font-size: 9.5pt; font-weight: 700; text-align: center; }
  td.c { text-align: center; }
  .narrow { width: 11%; }
  .qty { width: 22%; font-weight: 700; }
  tr { break-inside: avoid; }

  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 9pt; break-inside: avoid; }
  .party { border: 1px solid #000; }
  .party h2 { font-size: 10pt; margin: 0; padding: 3pt 6pt; background: #e8e8e8; border-bottom: 1px solid #000; }
  .party .fields { padding: 5pt 6pt 0; }
  .field { display: flex; gap: 5pt; align-items: baseline; margin-bottom: 4pt; }
  .field > span:first-child { font-size: 9pt; width: 56pt; flex: none; }
  .field > span:last-child { flex: 1; border-bottom: 1px solid #000; min-height: 13pt; font-weight: 600; }
  .sign-slot { height: 22mm; border: 1px solid #000; margin: 3pt 5pt 5pt; display: flex; align-items: center; justify-content: center; }
  .sign-slot img { max-width: 94%; max-height: 94%; }
  .sign-slot .cap { font-size: 7.5pt; color: #666; }

  footer { margin-top: 7pt; font-size: 8pt; border-top: 1px solid #000; padding-top: 2pt; display: flex; justify-content: space-between; }

  @media screen {
    body { background: #e9ece9; padding: 16px; }
    .sheet { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
    .print-bar { max-width: 210mm; margin: 0 auto 12px; }
    .print-bar button { font: inherit; font-weight: 600; cursor: pointer; background: #2f6b53; color: #fff; border: 0; border-radius: 4px; padding: 8px 16px; }
  }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
  ${printButton(nonce)}

  <div class="sheet">
    <div class="masthead">
      <div class="unit-no">${esc(unit.number)}<small>גדוד</small></div>
      <div class="titles"><h1>ספירת נשקייה</h1></div>
      <div class="doc-no">${SHIFT_HE[session.shift]}<strong class="mono">${formatDate(session.sessionDate)}</strong></div>
    </div>

    ${tables}

    <div class="parties">
      <section class="party">
        <h2>אחראי משק ארמון</h2>
        <div class="fields">
          <div class="field"><span>שם ומשפחה</span><span>${esc(session.responsibleName)}</span></div>
          <div class="field"><span>מ.א.</span><span class="mono">${esc(session.responsiblePn)}</span></div>
          <div class="field"><span>דרגה</span><span>${esc(session.responsibleRank)}</span></div>
        </div>
        <div class="sign-slot">
          ${session.responsibleSignatureImage
            ? `<img src="${esc(session.responsibleSignatureImage)}" alt="חתימת אחראי משק ארמון">`
            : `<span class="cap">ממתין לחתימה</span>`}
        </div>
      </section>

      <section class="party">
        <h2>בעל תפקיד ארמון</h2>
        <div class="fields">
          <div class="field"><span>שם ומשפחה</span><span>${esc(session.officerName)}</span></div>
          <div class="field"><span>מ.א.</span><span class="mono">${esc(session.officerPn)}</span></div>
          <div class="field"><span>דרגה</span><span>${esc(session.officerRank)}</span></div>
        </div>
        <div class="sign-slot">
          ${session.officerSignatureImage
            ? `<img src="${esc(session.officerSignatureImage)}" alt="חתימת בעל תפקיד ארמון">`
            : `<span class="cap">ממתין לחתימה</span>`}
        </div>
      </section>
    </div>

    <footer>
      <span>הופק ממערכת הלוגיסטיקה של ${esc(unit.name)}</span>
      <span class="mono">${formatDate(session.sessionDate)}</span>
    </footer>
  </div>
</body>
</html>`;
}
