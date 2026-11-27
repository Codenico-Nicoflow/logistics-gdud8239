import { describe, expect, it } from 'vitest';
import { paginate, renderIssueForm, ROWS_PER_PAGE, type FormForPrint } from './issue-form.html';

const UNIT = { name: 'גדוד 5033', number: '5033' };

const form = (lines: number): FormForPrint => ({
  formNo: 1,
  soldierNameSnapshot: 'דנה כהן',
  personalNumberSnapshot: '1234567',
  companySnapshot: 'A',
  phoneSnapshot: null,
  receiptNo: null,
  signatureImage: 'data:image/png;base64,AAAA',
  signedAt: new Date('2026-11-23T11:21:00'),
  issuedByNameSnapshot: 'מנפק',
  issuerPersonalNumber: null,
  notes: null,
  lines: Array.from({ length: lines }, (_, i) => ({
    itemNameSnapshot: `פריט ${i + 1}`,
    serialSnapshot: null,
    unitOfMeasure: "יח'",
    quantity: 1,
    lineNotes: null,
  })),
});

describe('renderIssueForm layout', () => {
  it('stretches the sheet to a full page, signatures last, for an ordinary form', () => {
    const html = renderIssueForm(form(6), UNIT, 'n');
    expect(html).toContain('class="sheet"');
    expect(html).toMatch(/min-height:\s*296mm/);
    // The signing block comes after the item table, so it sits at the foot of the page.
    expect(html.indexOf('class="items"')).toBeLessThan(html.indexOf('class="parties"'));
  });

  it('pads the table with ruled empty rows up to the 12 of the paper form', () => {
    expect(renderIssueForm(form(6), UNIT, 'n').match(/class="blank"/g)).toHaveLength(6);
    expect(renderIssueForm(form(12), UNIT, 'n')).not.toContain('class="blank"');
  });

  it('is one sheet, with no page marker, up to the 12 rows of the paper form', () => {
    const html = renderIssueForm(form(ROWS_PER_PAGE), UNIT, 'n');
    expect(html.match(/class="sheet"/g)).toHaveLength(1);
    expect(html).not.toContain('עמוד');
  });

  it('continues on another whole sheet once there are more lines than the paper form has rows', () => {
    const html = renderIssueForm(form(37), UNIT, 'n');
    const sheets = html.match(/class="sheet"/g) ?? [];
    expect(sheets).toHaveLength(4);
    // Each sheet is a complete 1008 with the one signature repeated, so any page can be checked on its own.
    expect(html.match(/class="parties"/g)).toHaveLength(4);
    expect(html.match(/alt="חתימת השואל"/g)).toHaveLength(4);
    expect(html.match(/class="declaration"/g)).toHaveLength(4);
    expect(html.match(/class="header-box"/g)).toHaveLength(4);
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`עמוד ${n} מתוך 4`);
  });

  it('fills each page to twelve rows before starting the next, and pads only the last', () => {
    const html = renderIssueForm(form(37), UNIT, 'n');
    const numbers = [...html.matchAll(/<td class="c narrow">(\d+)<\/td>\s*(?:<td class="desc">|<td><\/td>)/g)].map((m) => Number(m[1]));
    // 4 pages x 12 rows, numbered straight through; 37 real lines, so the last page has 1 line and 11 empty rows.
    expect(numbers).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
    expect(html.match(/class="blank"/g)).toHaveLength(11);
  });

  it('prints no form number and no system note, only what the operator wrote', () => {
    // The tab title (the default name of a saved PDF) keeps the number; the sheet itself does not show it.
    const onPaper = (html: string): string => html.split('</head>')[1] ?? '';
    const single = onPaper(renderIssueForm({ ...form(3), formNo: 4321, notes: 'הערה של המנפק' }, UNIT, 'n'));
    expect(single).not.toContain('4321');
    expect(single).not.toContain('מספר שובר');
    expect(single).toContain('הערה של המנפק');
    expect(onPaper(renderIssueForm({ ...form(37), formNo: 4321 }, UNIT, 'n'))).not.toContain('4321');
  });

  it("prints the signing time and date on Israel's clock, whatever timezone the server is in", () => {
    // 22:30 UTC on the 27th is 00:30 on the 28th in Israel (winter time, UTC+2).
    const html = renderIssueForm({ ...form(3), signedAt: new Date('2026-11-27T22:30:00Z') }, UNIT, 'n');
    expect(html).toContain('28.11.2026');
    expect(html).toContain('00:30');
    expect(html).not.toContain('27.11.2026');
    expect(html).not.toContain('22:30');
  });

  it("names the battalion it was printed for, never another's", () => {
    const html = renderIssueForm(form(6), UNIT, 'n');
    expect(html).toContain('5033');
    expect(html).toContain('הופק ממערכת הלוגיסטיקה של גדוד 5033');
    expect(html).not.toContain('8239');
  });

  it('escapes a battalion name, since an admin chooses it', () => {
    const html = renderIssueForm(form(6), { name: '<script>x</script>', number: '1' }, 'n');
    expect(html).not.toContain('<script>x</script>');
  });
});


describe('paginate', () => {
  const sizes = (n: number) => paginate(Array.from({ length: n }, (_, i) => i)).map((p) => p.length);

  it('keeps a form of up to twelve lines on one page, even an empty one', () => {
    expect(sizes(0)).toEqual([0]);
    expect(sizes(12)).toEqual([12]);
  });

  it('fills a page before starting the next, the last taking the remainder', () => {
    expect(sizes(13)).toEqual([12, 1]);
    expect(sizes(24)).toEqual([12, 12]);
    expect(sizes(37)).toEqual([12, 12, 12, 1]);
  });

  it('never puts more than twelve rows on a page and loses no line', () => {
    for (let n = 0; n <= 80; n++) {
      const pages = paginate(Array.from({ length: n }, (_, i) => i));
      expect(pages.flat()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(Math.max(...pages.map((p) => p.length))).toBeLessThanOrEqual(12);
    }
  });
});
