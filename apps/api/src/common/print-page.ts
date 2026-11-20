import { randomBytes } from 'node:crypto';
import type { Response } from 'express';

/**
 * The print button on the HTML print pages (1008, ספירת נשקיה).
 *
 * Helmet's CSP sets `script-src-attr 'none'`, which silently drops an inline
 * `onclick="window.print()"` — the button rendered but did nothing. Instead
 * each response gets a fresh nonce, allowed by its own CSP header, and one
 * nonce'd script attaches the handler. Nothing else may run on the page.
 */
export function printButton(nonce: string): string {
  return `<div class="print-bar"><button type="button" id="print-btn">הדפס / שמור כ‑PDF</button></div>
  <script nonce="${nonce}">document.getElementById('print-btn').addEventListener('click', function () { window.print(); });</script>`;
}

export function sendPrintPage(res: Response, render: (nonce: string) => string): void {
  const nonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Holds names, מ.א. and signatures — never cached by a proxy.
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
  );
  res.send(render(nonce));
}
