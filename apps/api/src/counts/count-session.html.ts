import type { CountShift } from '@prisma/client';
import type { CountSheetRow } from './counts.service';

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
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
export function renderCountSession(session: CountSessionForPrint): string {
  const rows = session.rows
    .map(
      (r, i) => `
        <tr>
          <td class="c narrow">${i + 1}</td>
          <td class="desc">${esc(r.itemName)}</td>
          <td class="c">${r.nashkiyaQty ?? ''}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>ספירת נשקייה גדוד 8239 — ${SHIFT_HE[session.shift]} — ${formatDate(session.sessionDate)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Assistant, "Segoe UI", Arial, sans-serif; color: #000; background: #fff; font-size: 11pt; line-height: 1.4; }
  .sheet { max-width: 186mm; margin: 0 auto; }

  .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 10pt; border-bottom: 2px solid #000; padding-bottom: 5pt; }
  .unit-no { font-size: 15pt; font-weight: 700; letter-spacing: .04em; }
  .unit-no small { display: block; font-size: 8.5pt; font-weight: 400; letter-spacing: 0; }
  .titles { text-align: center; flex: 1; }
  h1 { font-size: 16pt; margin: 0; }
  .doc-no { font-size: 10pt; white-space: nowrap; text-align: left; }
  .doc-no strong { display: block; font-size: 13pt; }

  table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  th, td { border: 1px solid #000; padding: 3.5pt 6pt; text-align: right; vertical-align: top; }
  th { background: #e8e8e8; font-size: 9.5pt; font-weight: 700; text-align: center; }
  td.c { text-align: center; }
  .narrow { width: 7%; }
  .desc { width: 30%; }

  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin-top: 10pt; }
  .party { border: 1px solid #000; }
  .party h2 { font-size: 10pt; margin: 0; padding: 3.5pt 7pt; background: #e8e8e8; border-bottom: 1px solid #000; }
  .party .fields { padding: 5pt 7pt; }
  .field { display: flex; gap: 6pt; align-items: baseline; margin-bottom: 4pt; }
  .field > span:first-child { font-size: 9pt; width: 58pt; flex: none; }
  .field > span:last-child { flex: 1; border-bottom: 1px solid #000; min-height: 13pt; font-weight: 600; }
  .sign-slot { height: 22mm; border: 1px solid #000; margin: 4pt 7pt 7pt; display: flex; align-items: center; justify-content: center; }
  .sign-slot img { max-width: 94%; max-height: 94%; }
  .sign-slot .cap { font-size: 8.5pt; color: #666; }

  footer { margin-top: 8pt; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 3pt; display: flex; justify-content: space-between; }

  @media screen {
    body { background: #e9ece9; padding: 16px; }
    .sheet { background: #fff; padding: 12mm; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
    .print-bar { max-width: 210mm; margin: 0 auto 12px; }
    .print-bar button { font: inherit; font-weight: 600; cursor: pointer; background: #2f6b53; color: #fff; border: 0; border-radius: 4px; padding: 8px 16px; }
  }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">הדפס / שמור כ‑PDF</button></div>

  <div class="sheet">
    <div class="masthead">
      <div class="unit-no">8239<small>גדוד</small></div>
      <div class="titles"><h1>ספירת נשקייה</h1></div>
      <div class="doc-no">${SHIFT_HE[session.shift]}<strong class="mono">${formatDate(session.sessionDate)}</strong></div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="narrow">מס"ד</th>
          <th class="desc">שם פריט</th>
          <th>בנשקייה</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

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
      <span>הופק ממערכת הלוגיסטיקה של גדוד 8239</span>
      <span class="mono">${formatDate(session.sessionDate)}</span>
    </footer>
  </div>
</body>
</html>`;
}
