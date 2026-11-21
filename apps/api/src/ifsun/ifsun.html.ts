import type { IfsunRecord } from '@prisma/client';
import { printButton } from '../common/print-page';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function when(d: Date | null): string {
  return d
    ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
    : '';
}

const STATUS_HE = { STORED: 'מאופסן', COLLECTED: 'נלקח', CREDITED: 'זוכה' } as const;

/**
 * The אפסון document as a print-ready page: the item, who left it and when with
 * their drawn signature, and — once closed — who took it and when with theirs.
 * HTML rather than a PDF binary for the same reason as the 1008: the browser's
 * own Hebrew layout is right, and its print dialog produces the PDF.
 */
export function renderIfsun(r: IfsunRecord, nonce: string): string {
  const half = (title: string, name: string | null, at: Date | null, image: string | null, by: string | null) => `
    <div class="party">
      <h2>${esc(title)}</h2>
      <div class="fields">
        <div class="field"><span>שם</span><span>${esc(name)}</span></div>
        <div class="field"><span>תאריך ושעה</span><span>${esc(when(at))}</span></div>
        <div class="field"><span>נרשם ע״י</span><span>${esc(by)}</span></div>
      </div>
      <div class="sign-slot">${image ? `<img src="${esc(image)}" alt="" />` : '<span class="cap">אין חתימה שמורה</span>'}</div>
    </div>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>אפסון — ${esc(r.soldierNameSnapshot)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Assistant, "Segoe UI", Arial, sans-serif; color: #000; background: #fff; font-size: 11pt; }
  .sheet { width: 210mm; margin: 0 auto; padding: 14mm 12mm; }
  h1 { font-size: 18pt; margin: 0 0 4pt; text-align: center; }
  .sub { text-align: center; font-size: 9pt; margin-bottom: 12pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
  th, td { border: 1px solid #000; padding: 4pt 8pt; text-align: right; }
  th { background: #e8e8e8; width: 28%; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; break-inside: avoid; }
  .party { border: 1px solid #000; }
  .party h2 { font-size: 11pt; margin: 0; padding: 4pt 8pt; background: #e8e8e8; border-bottom: 1px solid #000; }
  .party .fields { padding: 6pt 8pt 0; }
  .field { display: flex; gap: 6pt; align-items: baseline; margin-bottom: 5pt; }
  .field > span:first-child { font-size: 9pt; width: 62pt; flex: none; }
  .field > span:last-child { flex: 1; border-bottom: 1px solid #000; min-height: 14pt; font-weight: 600; }
  .sign-slot { height: 30mm; border: 1px solid #000; margin: 4pt 8pt 8pt; display: flex; align-items: center; justify-content: center; }
  .sign-slot img { max-width: 94%; max-height: 94%; }
  .cap { font-size: 8pt; color: #666; }
  .notes { margin-top: 12pt; font-size: 10pt; }
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
  <h1>אפסון ציוד בנשקייה</h1>
  <div class="sub">גדוד 8239 · הופק ${esc(when(new Date()))}</div>
  <table>
    <tr><th>חייל</th><td>${esc(r.soldierNameSnapshot)}</td></tr>
    <tr><th>פריט</th><td>${esc(r.itemNameSnapshot)}${r.quantity > 1 ? ` ×${esc(r.quantity)}` : ''}</td></tr>
    <tr><th>מסד</th><td>${esc(r.serialSnapshot)}</td></tr>
    <tr><th>סטטוס</th><td>${esc(STATUS_HE[r.status])}</td></tr>
  </table>
  <div class="parties">
    ${half('הפקדה', r.storeSignerName, r.storedAt, r.storeSignatureImage, r.storedByName)}
    ${r.status === 'STORED' ? '' : half(r.status === 'CREDITED' ? 'זיכוי' : 'לקיחה', r.collectSignerName, r.closedAt, r.collectSignatureImage, r.closedByName)}
  </div>
  ${r.notes || r.closeNotes ? `<div class="notes">הערות: ${esc([r.notes, r.closeNotes].filter(Boolean).join(' · '))}</div>` : ''}
</div>
</body>
</html>`;
}
