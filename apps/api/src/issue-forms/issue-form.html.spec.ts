import { describe, expect, it } from 'vitest';
import { renderIssueForm, type FormForPrint } from './issue-form.html';

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
  it('does not stretch the sheet to a page, and puts the signing block after the items', () => {
    const html = renderIssueForm(form(6), 'n');
    expect(html).not.toMatch(/min-height:\s*2\d\dmm/);
    expect(html.indexOf('class="items"')).toBeLessThan(html.indexOf('class="parties"'));
  });

  it('pads the table with a few ruled empty rows', () => {
    expect(renderIssueForm(form(2), 'n').match(/class="blank"/g)).toHaveLength(4);
    expect(renderIssueForm(form(6), 'n')).not.toContain('class="blank"');
  });
});
