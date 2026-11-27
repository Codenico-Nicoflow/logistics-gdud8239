import { printButton } from '../common/print-page';
import type { Unit } from '../battalion/battalion.service';
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

// Israel's clock, not the server's: Render runs in UTC, which printed signing times two or three hours early and
// the previous day's date between midnight and 02:00-03:00.
const TZ = 'Asia/Jerusalem';

function formatDate(d: Date): string {
  return d.toLocaleDateString('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
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
/** The paper form has twelve ruled rows; more lines than this and the form continues on a further page. */
export const ROWS_PER_PAGE = 12;

/**
 * How tall a row prints, in mm, measured in Chromium's print layout with the fixed column widths below: 8.4 for a
 * row of one line plus 5.7 for each further line. The characters that fit on a line are what a column's width holds
 * at the sheet's font (the identifier column is narrow and breaks anywhere, so it holds the fewest).
 */
const CHARS_PER_LINE = { name: 27, id: 11, remarks: 21 } as const;
const FIRST_LINE_MM = 8.4;
const EXTRA_LINE_MM = 5.7;
/** Room for rows on a sheet (about 154 mm measured), less a margin for a wrapped header or party name. */
const BODY_MM = 142;
/** The form's notes print above the declaration on every sheet and take their share of it. */
const NOTES_CHARS_PER_LINE = 90;
const NOTES_LINE_MM = 4.7;
const NOTES_GAP_MM = 2.8;

const linesFor = (text: string | null, perLine: number): number => Math.max(1, Math.ceil((text ?? '').length / perLine));

export function rowHeightMm(line: FormForPrint['lines'][number]): number {
  const lines = Math.max(
    linesFor(line.itemNameSnapshot, CHARS_PER_LINE.name),
    linesFor(line.serialSnapshot, CHARS_PER_LINE.id),
    linesFor(line.lineNotes, CHARS_PER_LINE.remarks),
  );
  return FIRST_LINE_MM + (lines - 1) * EXTRA_LINE_MM;
}

export function notesHeightMm(notes: string | null): number {
  return notes ? Math.ceil(notes.length / NOTES_CHARS_PER_LINE) * NOTES_LINE_MM + NOTES_GAP_MM : 0;
}

/**
 * Fills each page before starting the next, with the last taking the remainder. A page holds at most the paper
 * form's twelve rows and no more than fits by height: a row whose text wraps to several lines takes the room of
 * several, so twelve long rows are not squeezed onto a sheet they would overflow. A row too tall for any page still
 * gets one to itself rather than being dropped.
 */
export function paginate<T>(
  lines: readonly T[],
  heightMm: (line: T) => number = () => FIRST_LINE_MM,
  budgetMm: number = BODY_MM,
): T[][] {
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  for (const line of lines) {
    const h = heightMm(line);
    if (page.length > 0 && (page.length >= ROWS_PER_PAGE || used + h > budgetMm)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(line);
    used += h;
  }
  // A form always has at least one sheet, even an empty one.
  if (page.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

/** `companyName` is the company's current name for the code the form stored; the code itself is shown if there is none. */
export function renderIssueForm(
  form: FormForPrint,
  unit: Unit,
  nonce: string,
  companyName: string = form.companySnapshot,
): string {
  const soldierDate = `${formatDate(form.signedAt)} ${formatTime(form.signedAt)}`;

  // Every page is a whole 1008: the same header, declaration and both signature boxes (the soldier signs once and
  // the image is repeated), so any single sheet can be filed or checked on its own.
  const sheet = (pageLines: FormForPrint['lines'], firstNo: number, pageNo: number, pageCount: number, budgetMm: number): string => {
    const rows = pageLines
      .map(
        (line, i) => `
        <tr>
          <td class="c narrow">${firstNo + i}</td>
          <td class="desc">${esc(line.itemNameSnapshot)}</td>
          <td class="c narrow">${esc(line.unitOfMeasure)}</td>
          <td class="c narrow">${line.quantity}</td>
          <td class="mono id">${esc(line.serialSnapshot) || ''}</td>
          <td class="remarks">${esc(line.lineNotes) || ''}</td>
        </tr>`,
      )
      .join('');

    // The paper form keeps ruled empty rows, so a line added by hand at the counter has somewhere to go. They pad
    // the sheet up to twelve rows, but only into the room the real rows leave: a page of tall wrapped rows has no
    // spare height, and padding it to twelve would push the sheet past the page.
    const used = pageLines.reduce((sum, line) => sum + rowHeightMm(line), 0);
    const spare = Math.max(0, Math.floor((budgetMm - used) / FIRST_LINE_MM));
    const blanks = Array.from({ length: Math.min(Math.max(0, ROWS_PER_PAGE - pageLines.length), spare) })
      .map(
        (_, i) => `
        <tr class="blank">
          <td class="c narrow">${firstNo + pageLines.length + i}</td>
          <td></td><td></td><td></td><td></td><td></td>
        </tr>`,
      )
      .join('');

    return `<div class="sheet">
    <div class="masthead">
      <div class="unit-no">${esc(unit.number)}<small>גדוד</small></div>
      <div class="titles">
        <h1>שובר השאלה פנימית 1008</h1>
      </div>
      <div class="spacer" aria-hidden="true"></div>
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
          <th class="id">מזהה (מסד / צ׳)</th>
          <th class="remarks">הערות</th>
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
      <span>הופק ממערכת הלוגיסטיקה של ${esc(unit.name)}${pageCount > 1 ? ` · עמוד ${pageNo} מתוך ${pageCount}` : ''}</span>
      <span class="mono">${formatDate(form.signedAt)} ${formatTime(form.signedAt)}</span>
    </footer>
  </div>`;
  };

  const budgetMm = BODY_MM - notesHeightMm(form.notes);
  const pages = paginate(form.lines, rowHeightMm, budgetMm);
  let firstNo = 1;
  const sheets = pages
    .map((pageLines, i) => {
      const html = sheet(pageLines, firstNo, i + 1, pages.length, budgetMm);
      firstNo += pageLines.length;
      return html;
    })
    .join('\n');

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
  /* One sheet per page: a form of many lines is several whole sheets, so nothing splits across a page. */
  .sheet { break-after: page; break-inside: avoid; }
  .sheet:last-of-type { break-after: auto; }

  /* The unit number sits top-left on the paper form, opposite the title. */
  .masthead {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 10pt; border-bottom: 2px solid #000; padding-bottom: 5pt;
  }
  .unit-no { font-size: 15pt; font-weight: 700; letter-spacing: .04em; }
  .unit-no small { display: block; font-size: 8.5pt; font-weight: 400; letter-spacing: 0; }
  .titles { text-align: center; flex: 1; }
  h1 { font-size: 16pt; margin: 0; }
  /* Mirrors the unit number's width, so the title stays centred. */
  .masthead .spacer { min-width: 48pt; }
  .unit-no { min-width: 48pt; }

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

  /* Fixed column widths: with auto widths a long note widened its column and squeezed the others, so how tall a row
     would be depended on its neighbours. Fixed, a row's height follows from its own text (see rowCost in the TypeScript). */
  table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 3.5pt 6pt; text-align: right; vertical-align: top; }
  th { background: #e8e8e8; font-size: 9.5pt; font-weight: 700; text-align: center; }
  td.c { text-align: center; }
  .narrow { width: 8%; }
  .desc { width: 32%; }
  .id { width: 18%; }
  .remarks { width: 26%; }
  td { overflow-wrap: anywhere; }
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
    .sheet { background: #fff; padding: 12mm; min-height: 297mm; box-shadow: 0 2px 12px rgba(0,0,0,.18); margin-bottom: 16px; }
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
  }
</style>
</head>
<body>
  ${printButton(nonce)}

${sheets}
</body>
</html>`;
}
