import { describe, expect, it } from 'vitest';
import { notesHeightMm, paginate, renderIssueForm, rowHeightMm, ROWS_PER_PAGE, type FormForPrint } from './issue-form.html';

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

describe('rowHeightMm', () => {
  const line = (name: string, serial: string | null = null, notes: string | null = null) => ({
    itemNameSnapshot: name, serialSnapshot: serial, unitOfMeasure: "יח'", quantity: 1, lineNotes: notes,
  });

  it('is one line for ordinary text', () => {
    expect(rowHeightMm(line('M-4'))).toBeCloseTo(8.4);
  });

  it('grows with the tallest cell: the narrow identifier column breaks first, then notes, then the description', () => {
    expect(rowHeightMm(line('M-4', '9'.repeat(40)))).toBeCloseTo(8.4 + 3 * 5.7);
    expect(rowHeightMm(line('M-4', null, 'x'.repeat(200)))).toBeCloseTo(8.4 + 9 * 5.7);
    expect(rowHeightMm(line('x'.repeat(80)))).toBeCloseTo(8.4 + 2 * 5.7);
    // The tallest wins, the cells do not add up.
    expect(rowHeightMm(line('x'.repeat(80), '9'.repeat(40), 'x'.repeat(200)))).toBeCloseTo(8.4 + 9 * 5.7);
  });

  it('gives notes their own share of the sheet', () => {
    expect(notesHeightMm(null)).toBe(0);
    expect(notesHeightMm('x'.repeat(500))).toBeCloseTo(6 * 4.7 + 2.8);
  });
});

describe('paginate by height', () => {
  const tall = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('starts a new page when the next row would not fit, before twelve rows', () => {
    // Rows of 20 mm in a 142 mm budget: seven fit.
    expect(paginate(tall(15), () => 20, 142).map((p) => p.length)).toEqual([7, 7, 1]);
  });

  it('gives a row too tall for any page a page to itself instead of dropping it', () => {
    expect(paginate([1, 2, 3], (n) => (n === 2 ? 500 : 10), 142).map((p) => p.length)).toEqual([1, 1, 1]);
  });

  it('never loses or reorders a line, whatever the heights', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let run = 0; run < 100; run++) {
      const lines = tall(Math.floor(rnd() * 60));
      const heights = lines.map(() => 8.4 + Math.floor(rnd() * 10) * 5.7);
      const pages = paginate(lines, (n) => heights[n] ?? 8.4, 142);
      expect(pages.flat()).toEqual(lines);
      for (const page of pages) {
        expect(page.length).toBeLessThanOrEqual(12);
        if (page.length > 1) expect(page.reduce((sum, n) => sum + (heights[n] ?? 0), 0)).toBeLessThanOrEqual(142);
      }
    }
  });
});

describe('renderIssueForm with long text', () => {
  const longForm = (n: number): FormForPrint => ({
    ...form(n),
    lines: Array.from({ length: n }, (_, i) => ({
      itemNameSnapshot: `פריט עם שם ארוך מאוד שנמשך על פני כמה שורות ${i} `.repeat(2).slice(0, 80),
      serialSnapshot: null, unitOfMeasure: "יח'", quantity: 1, lineNotes: null,
    })),
  });

  it('does not pad a page of tall rows to twelve, which would push the sheet past the page', () => {
    const html = renderIssueForm(longForm(7), UNIT, 'n');
    // Seven 3-line rows use the room of about sixteen one-line rows, so there is none left for blanks.
    expect(html.match(/class="blank"/g) ?? []).toHaveLength(0);
    expect(html.match(/class="sheet"/g)).toHaveLength(1);
  });

  it('splits twelve long rows over several sheets instead of cramming them onto one', () => {
    expect((renderIssueForm(longForm(12), UNIT, 'n').match(/class="sheet"/g) ?? []).length).toBeGreaterThan(1);
  });

  it('lets a long form note take room from the rows on every sheet', () => {
    const plain = (renderIssueForm({ ...form(12), notes: null }, UNIT, 'n').match(/class="sheet"/g) ?? []).length;
    const noted = (renderIssueForm({ ...form(12), notes: 'x'.repeat(500) }, UNIT, 'n').match(/class="sheet"/g) ?? []).length;
    expect(plain).toBe(1);
    expect(noted).toBeGreaterThanOrEqual(plain);
  });
});
