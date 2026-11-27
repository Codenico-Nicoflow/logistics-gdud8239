import { printButton } from '../common/print-page';
import type { CompanyCode } from '../companies/company-code';

export type FormForPrint = {
  formNo: number;
  soldierNameSnapshot: string;
  personalNumberSnapshot: string | null;
  companySnapshot: CompanyCode;
  phoneSnapshot: string | null;
  receiptNo: string | null;
  signatureImage: string;
  signedAt: Date;
  issuedByNameSnapshot: string;
  issuerPersonalNumber: string | null;
  notes: string | null;
  lines: {
    itemNameSnapshot: string;
    serialSnapshot: string | null;
    unitOfMeasure: string;
    quantity: number;
    lineNotes: string | null;
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
 * `שובר השאלה פנימית 1008` as a print-ready page.
 *
 * Laid out to match the paper form the battalion already signs: the unit
 * number top-left, the receipt/company/phone box, and the six columns in the
 * order they appear on the sheet. Someone used to the paper should be able to
 * read this one without being told where anything moved to.
 *
 * Rendered as HTML rather than generated as a PDF binary: the browser already
 * does Hebrew bidirectional layout correctly, which a PDF library would need a
 * bundled font and its own bidi handling to approximate. The operator prints
 * or saves as PDF, and what they get is what they saw.
 *
 * Black on white with ruled borders, so it survives a photocopier and no
 * colour carries meaning.
 */
/** More lines than this and the sheet stops being stretched to a full page and flows over several. */
export const MAX_FILL_LINES = 14;

/** `companyName` is the company's current name for the code the form stored; the code itself is shown if there is none. */
export function renderIssueForm(form: FormForPrint, nonce: string, companyName: string = form.companySnapshot): string {
  const rows = form.lines
    .map(
      (line, i) => `
        <tr>
          <td class="c narrow">${i + 1}</td>
          <td class="desc">${esc(line.itemNameSnapshot)}</td>
          <td class="c narrow">${esc(line.unitOfMeasure)}</td>
          <td class="c narrow">${line.quantity}</td>
          <td class="mono">${esc(line.serialSnapshot) || ''}</td>
          <td>${esc(line.lineNotes) || ''}</td>
        </tr>`,
    )
    .join('');

  // The paper form keeps ruled empty rows, so a line added by hand at the
  // counter has somewhere to go. Kept to a fixed sheet length for the same
  // reason: the form should look the same every time it is filed.
  const blanks = Array.from({ length: Math.max(0, 12 - form.lines.length) })
    .map(
      (_, i) => `
        <tr class="blank">
          <td class="c narrow">${form.lines.length + i + 1}</td>
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`,
    )
    .join('');

  const soldierDate = `${formatDate(form.signedAt)} ${formatTime(form.signedAt)}`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>שובר השאלה פנימית 1008 — ${esc(form.soldierNameSnapshot)} — ${form.formNo}</title>
<style>
  /* margin: 0 leaves the browser no room for its own header/footer (URL,
     date, page number); the sheet's print padding is the real margin. */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Assistant, "Segoe UI", Arial, sans-serif;
    color: #000;
    background: #fff;
    font-size: 11.5pt;
    line-height: 1.4;
  }
  /* The sheet is the page: a column whose item table takes whatever height the header and the signing
     block leave, so the form always fills the A4 sheet and the signatures sit at its foot. */
  .sheet { max-width: 186mm; margin: 0 auto; display: flex; flex-direction: column; }
  /* flex-basis auto and no shrinking: with many lines the table pushes the signing block to the next page instead of overlapping it. */
  .items { flex: 1 0 auto; display: flex; flex-direction: column; margin-bottom: 8pt; }
  .items table { flex: 1; margin-bottom: 0; }
  /* A form too long for one sheet flows and breaks across pages as an ordinary document: Chrome lets the
     declaration overlap the last rows when a table inside a flex column has to split. */
  .sheet.flow { display: block; }
  .sheet.flow .items { display: block; }

  /* The unit number sits top-left on the paper form, opposite the title. */
  .masthead {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 10pt; border-bottom: 2px solid #000; padding-bottom: 5pt;
  }
  .unit-no { font-size: 15pt; font-weight: 700; letter-spacing: .04em; }
  .unit-no small { display: block; font-size: 8.5pt; font-weight: 400; letter-spacing: 0; }
  .titles { text-align: center; flex: 1; }
  h1 { font-size: 16pt; margin: 0; }
  .doc-no { font-size: 10pt; white-space: nowrap; text-align: left; }
  .doc-no strong { display: block; font-size: 14pt; }

  /* מס קבלה / פלוגה / מס' נייד — the header box, as on the sheet. */
  .header-box {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border: 1px solid #000; border-top: 0; margin-bottom: 8pt;
  }
  .header-box > div { border-inline-start: 1px solid #000; padding: 4pt 7pt; }
  .header-box > div:first-child { border-inline-start: 0; }
  .label { display: block; font-size: 8.5pt; }
  .value { font-weight: 600; min-height: 15pt; display: block; }
  .mono { font-variant-numeric: tabular-nums; letter-spacing: .02em; }

  .borrower { border: 1px solid #000; padding: 4pt 7pt; margin-bottom: 8pt; display: flex; gap: 20pt; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  th, td { border: 1px solid #000; padding: 3.5pt 6pt; text-align: right; vertical-align: top; }
  th { background: #e8e8e8; font-size: 9.5pt; font-weight: 700; text-align: center; }
  td.c { text-align: center; }
  .narrow { width: 9%; }
  .desc { width: 32%; }
  /* Every row starts at the same height, so the extra room the table takes up is shared evenly: filled and ruled-empty rows look alike. */
  tbody td { height: 18pt; }
  tr.blank td.narrow { color: #777; font-weight: 400; }

  .declaration { font-size: 9.5pt; margin: 0 0 8pt; }
  .notes { font-size: 9.5pt; margin: 0 0 8pt; }

  /* Two parties, as the paper form has them: the issuer and the borrower. */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
  .party { border: 1px solid #000; }
  .party h2 { font-size: 10pt; margin: 0; padding: 3.5pt 7pt; background: #e8e8e8; border-bottom: 1px solid #000; }
  .party .fields { padding: 5pt 7pt; }
  .field { display: flex; gap: 6pt; align-items: baseline; margin-bottom: 4pt; }
  .field > span:first-child { font-size: 9pt; width: 58pt; flex: none; }
  .field > span:last-child { flex: 1; border-bottom: 1px solid #000; min-height: 13pt; font-weight: 600; }
  .sign-slot { height: 24mm; border: 1px solid #000; margin: 4pt 7pt 7pt; display: flex; align-items: center; justify-content: center; }
  .sign-slot img { max-width: 94%; max-height: 94%; }
  .sign-slot .cap { font-size: 8.5pt; color: #666; }

  footer { margin-top: 8pt; font-size: 8.5pt; border-top: 1px solid #000; padding-top: 3pt; display: flex; justify-content: space-between; }

  @media screen {
    body { background: #e9ece9; padding: 16px; }
    .sheet { background: #fff; padding: 12mm; min-height: 297mm; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
    .print-bar { max-width: 210mm; margin: 0 auto 12px; }
    .print-bar button {
      font: inherit; font-weight: 600; cursor: pointer;
      background: #2f6b53; color: #fff; border: 0; border-radius: 4px; padding: 8px 16px;
    }
  }
  @media print {
    .print-bar { display: none; }
    /* A hair under 297mm: an exact-height box tips onto a blank second page in Chrome. */
    .sheet { width: 210mm; max-width: none; padding: 12mm; min-height: 296mm; }
    .sheet.flow { min-height: 0; }
  }
</style>
</head>
<body>
  ${printButton(nonce)}

  <div class="sheet${form.lines.length > MAX_FILL_LINES ? ' flow' : ''}">
    <div class="masthead">
      <div class="unit-no">8239<small>גדוד</small></div>
      <div class="titles">
        <h1>שובר השאלה פנימית 1008</h1>
      </div>
      <div class="doc-no">מספר שובר<strong class="mono">${form.formNo}</strong></div>
    </div>

    <div class="header-box">
      <div><span class="label">מס קבלה</span><span class="value mono">${esc(form.receiptNo) || ''}</span></div>
      <div><span class="label">פלוגה</span><span class="value">${esc(companyName)}</span></div>
      <div><span class="label">מס' נייד</span><span class="value mono">${esc(form.phoneSnapshot) || ''}</span></div>
    </div>

    <div class="items">
    <table>
      <thead>
        <tr>
          <th class="narrow">מס"ד</th>
          <th class="desc">תיאור</th>
          <th class="narrow">י"ח</th>
          <th class="narrow">כמות</th>
          <th>מזהה (מסד / צ׳)</th>
          <th>הערות</th>
        </tr>
      </thead>
      <tbody>${rows}${blanks}</tbody>
    </table>
    </div>

    ${form.notes ? `<p class="notes"><strong>הערות:</strong> ${esc(form.notes)}</p>` : ''}

    <p class="declaration">
      אני החתום מטה מאשר כי קיבלתי לידיי את הפריטים המפורטים לעיל, בדקתי אותם,
      וכי הם באחריותי עד להחזרתם לנשקיה.
    </p>

    <div class="parties">
      <section class="party">
        <h2>פרטי החייל המשאיל</h2>
        <div class="fields">
          <div class="field"><span>שם</span><span>${esc(form.issuedByNameSnapshot)}</span></div>
          <div class="field"><span>מס' אישי</span><span class="mono">${esc(form.issuerPersonalNumber) || ''}</span></div>
          <div class="field"><span>תאריך</span><span class="mono">${formatDate(form.signedAt)}</span></div>
        </div>
      </section>

      <section class="party">
        <h2>פרטי החייל השואל</h2>
        <div class="fields">
          <div class="field"><span>שם</span><span>${esc(form.soldierNameSnapshot)}</span></div>
          <div class="field"><span>מס' אישי</span><span class="mono">${esc(form.personalNumberSnapshot) || ''}</span></div>
          <div class="field"><span>תאריך</span><span class="mono">${soldierDate}</span></div>
        </div>
        <div class="sign-slot">
          <img src="${esc(form.signatureImage)}" alt="חתימת השואל">
        </div>
      </section>
    </div>

    <footer>
      <span>הופק ממערכת הלוגיסטיקה של גדוד 8239</span>
      <span class="mono">${formatDate(form.signedAt)} ${formatTime(form.signedAt)}</span>
    </footer>
  </div>
</body>
</html>`;
}
