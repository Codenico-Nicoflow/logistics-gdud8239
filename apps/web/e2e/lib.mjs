/**
 * Shared bits of the browser e2e suite: launch, sign in, record everything the page complains about.
 * Needs the API and the web dev server running (see README in docs/chore-web-test-coverage.md).
 */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
export const BASE = arg('base', 'http://localhost:5174');
export const OUT = arg('out', './e2e/out');
export const creds = () => JSON.parse(readFileSync(arg('creds'), 'utf8'));
mkdirSync(OUT, { recursive: true });

const EXE = join(homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
export const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH ?? EXE, headless: true });

export const findings = [];
let current = '';
export function note(sev, msg) {
  const line = `${sev}: [${current}] ${msg}`;
  findings.push(line);
  console.log(`    ${line}`);
}

/** A page that reports console errors, uncaught exceptions, 5xx and failed requests as findings. */
export async function newPage(browser, { width = 1280, height = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  const page = await ctx.newPage();
  // A step that cannot find its control should fail in seconds, not sit out Playwright's 30 s default.
  page.setDefaultTimeout(6000);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // A 4xx the test provoked on purpose shows up as a console error too; the response listener owns those.
    if (/Failed to load resource/.test(t)) return;
    note('CONSOLE', t.slice(0, 200));
  });
  page.on('pageerror', (e) => note('PAGEERROR', String(e.message).slice(0, 200)));
  page.on('response', (r) => {
    if (r.status() >= 500) note('HTTP5xx', `${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    if (/ABORTED/.test(f)) return; // navigations/cancelled queries
    note('REQFAIL', `${r.method()} ${new URL(r.url()).pathname} ${f}`);
  });
  page.on('dialog', (d) => { note('DIALOG', `native ${d.type()}: ${d.message().slice(0, 80)}`); void d.dismiss(); });
  return { ctx, page };
}

export async function signIn(page, { username, password }) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox').first().fill(username);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 15000 });
}

let passed = 0;
let failed = 0;
export async function step(name, fn, page) {
  current = name;
  try {
    // Start every step from a clean screen so one failed step cannot leave a dialog open over the next.
    if (page && page.url().startsWith(BASE)) await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    const lines = String(e.message).split('\n');
    const waiting = lines.find((l) => /waiting for/.test(l));
    const msg = (lines[0] + (waiting ? ` ${waiting.trim()}` : '')).slice(0, 300);
    console.log(`  FAIL ${name}: ${msg}`);
    findings.push(`FAIL: [${name}] ${msg}`);
    if (page) await page.screenshot({ path: join(OUT, `${name.replace(/[^\w]+/g, '_')}.png`), fullPage: true }).catch(() => {});
  }
}

export function report() {
  console.log(`\n${passed} steps ok, ${failed} failed, ${findings.length} findings`);
  for (const f of findings) console.log(' -', f);
}
export const summary = () => ({ passed, failed, findings });
