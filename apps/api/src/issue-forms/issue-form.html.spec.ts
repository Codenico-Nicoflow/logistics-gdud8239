import { describe, expect, it } from 'vitest';
import { MAX_FILL_LINES, renderIssueForm, type FormForPrint } from './issue-form.html';

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
    const html = renderIssueForm(form(6), 'n');
    expect(html).toContain('class="sheet"');
    expect(html).toMatch(/min-height:\s*207mm/);
    // The signing block comes after the item table, so it sits at the foot of the page.
    expect(html.indexOf('class="items"')).toBeLessThan(html.indexOf('class="parties"'));
  });

  it('pads the table with ruled empty rows up to the 12 of the paper form', () => {
    expect(renderIssueForm(form(6), 'n').match(/class="blank"/g)).toHaveLength(6);
    expect(renderIssueForm(form(12), 'n')).not.toContain('class="blank"');
  });

  it('flows over several pages instead of stretching once the form has too many lines', () => {
    expect(renderIssueForm(form(MAX_FILL_LINES), 'n')).toContain('class="sheet"');
    expect(renderIssueForm(form(MAX_FILL_LINES + 1), 'n')).toContain('class="sheet flow"');
  });
});
