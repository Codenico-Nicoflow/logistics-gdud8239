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
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`טופס 1 · עמוד ${n} מתוך 4`);
  });

  it('numbers the rows straight through the pages and pads every page to a full sheet', () => {
    const html = renderIssueForm(form(37), UNIT, 'n');
    const numbers = [...html.matchAll(/<td class="c narrow">(\d*)<\/td>\s*(?:<td class="desc">|<td><\/td>)/g)].map((m) => m[1]);
    // 4 pages x 12 rows. The 37 lines are numbered 1..37; only the last page numbers its 3 empty rows, since on an
    // earlier page the next number already belongs to a line on the following one.
    expect(numbers).toHaveLength(48);
    expect(numbers.filter(Boolean).map(Number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(html.match(/class="blank"/g)).toHaveLength(11);
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

  it('spreads the lines evenly instead of leaving a nearly empty last page', () => {
    expect(sizes(13)).toEqual([7, 6]);
    expect(sizes(24)).toEqual([12, 12]);
    expect(sizes(37)).toEqual([10, 9, 9, 9]);
  });

  it('never puts more than twelve rows on a page and loses no line', () => {
    for (let n = 0; n <= 80; n++) {
      const pages = paginate(Array.from({ length: n }, (_, i) => i));
      expect(pages.flat()).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(Math.max(...pages.map((p) => p.length))).toBeLessThanOrEqual(12);
    }
  });
});
