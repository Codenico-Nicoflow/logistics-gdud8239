/**
 * Every role opens every route it may (and a few it may not) in a real browser. Fails on a console error,
 * an uncaught exception, a 5xx, a blank page, or a forbidden route that renders instead of redirecting.
 */
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';

const ROUTES = ['/issue', '/issue/documents', '/issue/ifsun', '/periods', '/periods/by-soldier', '/soldiers', '/attendance',
  '/reports', '/reports/companies', '/reports/counts', '/reports/movements', '/equipment', '/equipment/intake', '/equipment/kits',
  '/equipment/naming', '/system', '/system/backups', '/security'];
const ALLOWED = {
  admin: ROUTES,
  logistics: ['/issue', '/issue/documents', '/issue/ifsun', '/periods', '/soldiers', '/attendance', '/reports', '/reports/companies', '/reports/counts', '/reports/movements', '/security'],
  viewer: ['/issue/documents', '/soldiers', '/security'],
  SHLISHUT: ['/soldiers', '/security'],
  SAMGAD: ['/periods', '/reports/companies', '/soldiers', '/security'],
  COMPANY_CMDR: ['/periods/by-soldier', '/soldiers', '/security'],
};

const c = creds();
const browser = await launch();
for (const role of Object.keys(ALLOWED)) {
  console.log(`\n== ${role} ==`);
  const { ctx, page } = await newPage(browser);
  await step(`${role} sign in`, () => signIn(page, c[role]), page);
  for (const route of ROUTES) {
    await step(`${role} ${route}`, async () => {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const path = new URL(page.url()).pathname;
      const allowed = ALLOWED[role].includes(route);
      if (allowed && path !== route) throw new Error(`redirected to ${path}`);
      if (!allowed && path === route) throw new Error('forbidden route rendered');
      const text = (await page.locator('body').innerText()).trim();
      if (text.length < 20) throw new Error('blank page');
      if (/\[object Object\]|undefined|NaN/.test(text)) throw new Error(`junk text on screen: ${text.match(/\[object Object\]|undefined|NaN/)[0]}`);
    }, page);
  }
  await ctx.close();
}
await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
