/**
 * Ways to break the app that are not about one feature: no network, back button after signing out, an absurdly long
 * name on a phone-sized screen, clicking create twice, a token that dies between two clicks.
 */
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';
import { api } from './seed.mjs';

const TAG = `E2E${Date.now() % 100000}`;
const credsFile = process.argv[process.argv.indexOf('--creds') + 1];
const a = await api(credsFile);
const c = creds();
const browser = await launch();
const { ctx, page } = await newPage(browser);
await signIn(page, c.admin);

await step('offline: creating a soldier with no network ends in a visible error, not a stuck spinner', async () => {
  await page.goto(BASE + '/soldiers', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'הוסף חייל' }).click();
  const d = page.getByRole('dialog');
  await d.locator('label:has-text("שם פרטי") input').fill('אופליין');
  await d.locator('label:has-text("שם משפחה") input').fill(`${TAG}-off`);
  await d.locator('label:has-text("מספר אישי") input').fill(String(4000000 + (Date.now() % 900000)));
  await ctx.setOffline(true);
  await d.getByRole('button', { name: 'צור והמשך' }).click();
  await page.waitForTimeout(2500);
  const stuck = await d.getByRole('button', { name: /צור והמשך/ }).isDisabled().catch(() => false);
  const alerts = (await page.locator('[role=alert]').allInnerTexts()).join(' ');
  await ctx.setOffline(false);
  if (!alerts.trim()) throw new Error(`no error shown while offline (create button disabled=${stuck})`);
}, page);

await step('double-click create soldier makes one soldier', async () => {
  await page.goto(BASE + '/soldiers', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'הוסף חייל' }).click();
  const d = page.getByRole('dialog');
  await d.locator('label:has-text("שם פרטי") input').fill('כפול');
  await d.locator('label:has-text("שם משפחה") input').fill(`${TAG}-dbl`);
  await d.locator('label:has-text("מספר אישי") input').fill(String(5000000 + (Date.now() % 900000)));
  await d.getByRole('button', { name: 'צור והמשך' }).dblclick();
  await page.waitForTimeout(2500);
  const r = await a('GET', `/soldiers?q=${encodeURIComponent(`${TAG}-dbl`)}&take=10`);
  if (r.body.total !== 1) throw new Error(`${r.body.total} soldiers created by one double click`);
}, page);

await step('a 60-character name does not push the soldiers page sideways at 320px', async () => {
  const long = 'א'.repeat(60);
  await a('POST', '/soldiers', { firstName: long, lastName: `${TAG}-${'ב'.repeat(50)}`.slice(0, 60), company: 'A', personalNumber: String(6000000 + (Date.now() % 900000)) });
  const m = await newPage(browser, { width: 320, height: 700, mobile: true });
  await signIn(m.page, c.admin);
  await m.page.goto(BASE + '/soldiers', { waitUntil: 'networkidle' });
  await m.page.getByPlaceholder('חפש לפי שם, מספר אישי או טלפון').fill(TAG);
  await m.page.keyboard.press('Enter');
  await m.page.waitForTimeout(900);
  const over = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await m.ctx.close();
  if (over > 1) throw new Error(`page is ${over}px wider than the screen`);
}, page);

await step('signing out then pressing Back does not show protected data', async () => {
  const p = await newPage(browser);
  await signIn(p.page, c.admin);
  await p.page.goto(BASE + '/soldiers', { waitUntil: 'networkidle' });
  await p.page.getByRole('button', { name: 'יציאה' }).click();
  await p.page.waitForSelector('input[type=password]');
  await p.page.goBack();
  await p.page.waitForTimeout(1200);
  const text = await p.page.locator('body').innerText();
  const stillLogin = (await p.page.locator('input[type=password]').count()) > 0;
  await p.ctx.close();
  if (!stillLogin && /חיילים/.test(text) && /מספר אישי/.test(text)) throw new Error('soldier list visible after sign-out + Back');
}, page);

await step('a second tab signing out ends this tab\'s session on its next action, with the login page', async () => {
  const p = await newPage(browser);
  await signIn(p.page, c.admin);
  await p.page.goto(BASE + '/soldiers', { waitUntil: 'networkidle' });
  await a('POST', '/auth/logout', {}).catch(() => {});
  await p.page.context().clearCookies();
  await p.page.getByRole('button', { name: 'הוסף חייל' }).click();
  const d = p.page.getByRole('dialog');
  await d.locator('label:has-text("שם פרטי") input').fill('סשן');
  await d.locator('label:has-text("שם משפחה") input').fill(`${TAG}-sess`);
  await d.locator('label:has-text("מספר אישי") input').fill(String(7000000 + (Date.now() % 900000)));
  await d.getByRole('button', { name: 'צור והמשך' }).click();
  await p.page.waitForTimeout(2500);
  const r = await a('GET', `/soldiers?q=${encodeURIComponent(`${TAG}-sess`)}&take=5`);
  const alerts = (await p.page.locator('[role=alert]').allInnerTexts()).join(' ');
  const onLogin = (await p.page.locator('input[type=password]').count()) > 0;
  await p.ctx.close();
  if (r.body.total) throw new Error('soldier was created with no session');
  if (!onLogin && !alerts.trim()) throw new Error('dead session: no login page and no error message');
}, page);

await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
