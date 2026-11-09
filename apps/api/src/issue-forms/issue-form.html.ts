import type { Company } from '@prisma/client';

const COMPANY_HE: Record<Company, string> = {
  A: 'א',
  B: 'ב',
  C: 'ג',
  SUPPORT: 'מסייעת',
  HQ: 'מפקדה',
};

export type FormForPrint = {
  formNo: number;
  soldierNameSnapshot: string;
  personalNumberSnapshot: string | null;
  companySnapshot: Company;
  phoneSnapshot: string | null;
  signatureImage: string;
  signedAt: Date;
  issuedByNameSnapshot: string;
  notes: string | null;
  lines: {
    itemNameSnapshot: string;
    serialSnapshot: string | null;
    quantity: number;
  }[];
};

/** Escaped because every value here is operator- or soldier-supplied. */
function esc(value: string | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * `טופס 1008` as a print-ready page.
 *
 * Rendered as HTML rather than generated as a PDF binary: the browser already
 * does Hebrew bidirectional layout correctly, which a PDF library would need a
 * bundled font and its own bidi handling to approximate. The page opens, the
 * operator prints or saves as PDF, and what they get is what they saw.
 *
 * Laid out to survive a photocopier — black on white, ruled table, no colour
 * carrying meaning.
 */
export function renderIssueForm(form: FormForPrint): string {
  const rows = form.lines
    .map(
      (line, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${esc(line.itemNameSnapshot)}</td>
          <td class="mono">${esc(line.serialSnapshot) || '—'}</td>
          <td class="num">${line.quantity}</td>
        </tr>`,
    )
    .join('');

  // A short form leaves a stub of empty rows, as the paper one has, so a line
  // added by hand at the counter has somewhere to go.
  const blanks = Array.from({ length: Math.max(0, 8 - form.lines.length) })
    .map(
      () => `
        <tr class="blank">
          <td class="num">&nbsp;</td><td></td><td></td><td></td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>טופס 1008 — ${esc(form.soldierNameSnapshot)} — ${form.formNo}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Assistant, "Segoe UI", Arial, sans-serif;
    color: #000;
    background: #fff;
    font-size: 12pt;
    line-height: 1.45;
  }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }

  header { border-bottom: 2px solid #000; padding-bottom: 6pt; margin-bottom: 10pt; }
  .title-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; }
  h1 { font-size: 18pt; margin: 0; letter-spacing: -0.01em; }
  .unit { font-size: 11pt; }
  .form-no { font-size: 11pt; white-space: nowrap; }
  .form-no strong { font-size: 14pt; }

  .who { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt 12pt; margin-bottom: 12pt; }
  .who div { border-bottom: 1px solid #999; padding-bottom: 3pt; }
  .label { display: block; font-size: 9pt; color: #444; }
  .value { font-weight: 600; }
  .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
  th, td { border: 1px solid #000; padding: 5pt 7pt; text-align: right; }
  th { background: #eee; font-size: 10pt; }
  td.num, th.num { text-align: center; width: 12%; }
  tr.blank td { height: 22pt; }

  .declaration { font-size: 10.5pt; margin-bottom: 10pt; }

  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16pt; align-items: end; }
  .sign-box { border: 1px solid #000; height: 34mm; display: flex; align-items: center; justify-content: center; }
  .sign-box img { max-width: 92%; max-height: 92%; }
  .sign-meta { font-size: 10pt; margin-top: 4pt; }
  .issuer-line { border-bottom: 1px solid #000; height: 22mm; }

  footer { margin-top: 12pt; font-size: 9pt; color: #444; border-top: 1px solid #999; padding-top: 4pt; }

  @media screen {
    body { background: #e9ece9; padding: 16px; }
    .sheet { background: #fff; padding: 12mm; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
    .print-bar { max-width: 190mm; margin: 0 auto 12px; display: flex; gap: 8px; }
    .print-bar button {
      font: inherit; font-weight: 600; cursor: pointer;
      background: #2f6b53; color: #fff; border: 0; border-radius: 4px; padding: 8px 16px;
    }
  }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
  <div class="print-bar">
    <button onclick="window.print()">הדפס / שמור כ‑PDF</button>
  </div>

  <div class="sheet">
    <header>
      <div class="title-row">
        <div>
          <h1>טופס חתימה 1008</h1>
          <div class="unit">גדוד 8239 — נשקיה</div>
        </div>
        <div class="form-no">מספר טופס<br><strong class="mono">${form.formNo}</strong></div>
      </div>
    </header>

    <section class="who">
      <div><span class="label">שם מלא</span><span class="value">${esc(form.soldierNameSnapshot)}</span></div>
      <div><span class="label">מספר אישי</span><span class="value mono">${esc(form.personalNumberSnapshot) || '—'}</span></div>
      <div><span class="label">פלוגה</span><span class="value">${esc(COMPANY_HE[form.companySnapshot])}</span></div>
      <div><span class="label">טלפון</span><span class="value mono">${esc(form.phoneSnapshot) || '—'}</span></div>
    </section>

    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>פריט</th>
          <th>מסד</th>
          <th class="num">כמות</th>
        </tr>
      </thead>
      <tbody>${rows}${blanks}</tbody>
    </table>

    ${form.notes ? `<p class="declaration"><strong>הערות:</strong> ${esc(form.notes)}</p>` : ''}

    <p class="declaration">
      אני החתום מטה מאשר כי קיבלתי לידיי את הפריטים המפורטים לעיל, וכי הם באחריותי
      עד להחזרתם לנשקיה.
    </p>

    <section class="sign">
      <div>
        <div class="sign-box"><img src="${esc(form.signatureImage)}" alt="חתימת החייל"></div>
        <div class="sign-meta">
          חתימת החייל — ${esc(form.soldierNameSnapshot)}<br>
          ${formatDate(form.signedAt)} בשעה ${formatTime(form.signedAt)}
        </div>
      </div>
      <div>
        <div class="sign-box issuer-line"></div>
        <div class="sign-meta">חתימת המנפק — ${esc(form.issuedByNameSnapshot)}</div>
      </div>
    </section>

    <footer>
      הופק ממערכת הלוגיסטיקה של גדוד 8239 · טופס ${form.formNo} ·
      ${formatDate(form.signedAt)} ${formatTime(form.signedAt)}
    </footer>
  </div>
</body>
</html>`;
}
