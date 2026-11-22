/**
 * Every role opens every route it may (and a few it may not) in a real browser. Fails on a console error,
 * an uncaught exception, a 5xx, a blank page, or a forbidden route that renders instead of redirecting.
 */
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';

const ROUTES = ['/issue', '/documents', '/service-periods', '/company-split', '/company-allocation', '/ifsun', '/soldiers',
  '/daily-movements', '/attendance', '/summary', '/counts', '/catalog', '/intake', '/naming', '/users', '/backups', '/security'];
const ALLOWED = {
  admin: ROUTES,
  logistics: ['/issue', '/documents', '/service-periods', '/company-split', '/ifsun', '/soldiers', '/daily-movements', '/attendance', '/summary', '/counts', '/security'],
  viewer: ['/documents', '/soldiers', '/security'],
  SHLISHUT: ['/soldiers', '/security'],
  SAMGAD: ['/service-periods', '/company-split', '/soldiers', '/security'],
  COMPANY_CMDR: ['/company-allocation', '/soldiers', '/security'],
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
