/**
 * ניפוק and זיכוי on a phone (390x844, touch): add items, change a quantity, remove a line, sign, hold, return —
 * and that nothing scrolls sideways or sits below a thumb-sized target along the way. Also the slip that loses a
 * basket: opening and closing the menu (the ✕ at the top) in the middle of a handover must not empty it.
 *
 * Data is seeded through the API as an admin (tagged E2E…) and removed by `cleanup.sql`.
 */
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';
import { api } from './seed.mjs';

const TAG = `E2E${Date.now() % 100000}`;
const credsFile = process.argv[process.argv.indexOf('--creds') + 1];
const a = await api(credsFile);
const c = creds();

const pn = (n) => String(3000000 + ((Date.now() + n * 7919) % 6000000));
const mkSoldier = async (suffix) => {
  const r = await a('POST', '/soldiers', { firstName: 'בדיקה', lastName: `${TAG}${suffix}`, company: 'A', personalNumber: pn(suffix.charCodeAt(0)) });
  if (r.status !== 201) throw new Error(`seed soldier: ${r.status} ${JSON.stringify(r.body)}`);
  await a('PATCH', `/soldiers/${r.body.id}/enlistment`, { enlisted: true });
  return { id: r.body.id, last: `${TAG}${suffix}` };
};
const mkItem = async (suffix, over = {}) => {
  const r = await a('POST', '/items', { name: `${TAG}${suffix}`, category: 'GEAR', isSerialized: true, authorizedQty: 0, yamahQty: 0, repairQty: 0, inSummary: true, aliases: [], ...over });
  if (r.status !== 201) throw new Error(`seed item: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.id, name: `${TAG}${suffix}` };
};
const held = async (soldier) => {
  const r = await a('GET', `/signatures?soldierId=${soldier.id}&take=50`);
  const rows = Array.isArray(r.body) ? r.body : (r.body.rows ?? []);
  return rows.filter((s) => s.soldierId === soldier.id && !s.returnedAt);
};

const S = await mkSoldier('א');
const GEAR = await mkItem(' ציוד');
await a('POST', `/items/${GEAR.id}/instances`, { serial: `${TAG}-P1` });
const BULK = await mkItem(' כמותי', { isSerialized: false, authorizedQty: 20 });
const EXTRA = await mkItem(' נוסף', { isSerialized: false, authorizedQty: 20 });

const browser = await launch();
const { page } = await newPage(browser, { width: 390, height: 844, mobile: true });
await signIn(page, c.admin);

const sideways = async (label) => {
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  if (w.s > w.c + 1) throw new Error(`${label}: page scrolls sideways (${w.s} > ${w.c})`);
};
/** Anything a thumb has to hit that is shorter than 36px is reported (not failed: some are inline links). */
const smallTargets = async (label) => {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main button, main a, main input, main select, nav button')]
      .filter((el) => el.offsetParent !== null && el.type !== 'checkbox' && el.type !== 'radio')
      .map((el) => ({ t: (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.tagName).trim().slice(0, 24), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h > 0 && x.h < 36),
  );
  if (small.length) note('SMALLTARGET', `${label}: ${small.map((x) => `${x.t}(${x.h}px)`).join(', ')}`);
};
const SEARCH = 'חפש חייל לפי שם או מ.א.';
const pickSoldier = async () => {
  await page.goto(`${BASE}/issue`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder(SEARCH).fill(S.last);
  await page.getByRole('button', { name: 'חפש', exact: true }).click();
  await page.locator('ul button').first().click();
  await page.getByText('שם מלא').first().waitFor();
};
const addItem = async (item) => {
  await page.getByRole('button', { name: 'חפש פריט להוספה' }).click();
  await page.keyboard.type(item.name);
  await page.locator('[role=listbox] li').first().click();
  await page.getByRole('button', { name: /הוסף \d+ נבחרים/ }).click();
};
// Item rows only: the stepper entry for the soldier also carries the tag (it is in his surname).
const lineCount = () => page.locator('main li', { hasText: new RegExp(`${TAG} (ציוד|כמותי|נוסף)`) }).count();
const menu = () => page.getByRole('button', { name: /^(תפריט|סגור)$/ });

console.log('\n== ניפוק on a phone ==');
await step('phone: pick the soldier — no sideways scroll', async () => {
  await pickSoldier();
  await sideways('soldier details');
  await smallTargets('soldier details');
}, page);

await step('phone: add a serialized item, choose its מסד, add two bulk items', async () => {
  await pickSoldier();
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  await addItem(GEAR);
  await page.getByRole('button', { name: `${TAG}-P1` }).first().click();
  await addItem(BULK);
  await addItem(EXTRA);
  await page.waitForTimeout(600);
  if ((await lineCount()) < 3) throw new Error(`basket shows ${await lineCount()} rows, expected 3`);
  await sideways('basket');
  await smallTargets('basket');
}, null);

await step('phone: change a quantity, then remove a row', async () => {
  const qty = page.locator('main li', { hasText: BULK.name }).locator('input[type=number]').first();
  await qty.fill('7');
  if ((await qty.inputValue()) !== '7') throw new Error('quantity did not take');
  await page.locator('main li', { hasText: EXTRA.name }).getByRole('button', { name: 'הסר' }).click();
  await page.waitForTimeout(400);
  if ((await page.locator('main li', { hasText: EXTRA.name }).count()) !== 0) throw new Error('removed row is still listed');
  if ((await lineCount()) !== 2) throw new Error(`${await lineCount()} rows after remove, expected 2`);
}, null);

await step('phone: open the menu and close it with ✕ mid-handover — the basket is still there', async () => {
  await menu().click();
  await page.getByRole('button', { name: 'סגור' }).waitFor();
  await page.getByRole('button', { name: 'סגור' }).click();
  await page.waitForTimeout(500);
  if ((await lineCount()) !== 2) throw new Error('the basket changed after opening and closing the menu');
  const qty = await page.locator('main li', { hasText: BULK.name }).locator('input[type=number]').first().inputValue();
  if (qty !== '7') throw new Error(`quantity became ${qty}`);
}, null);

await step('phone: sign with a finger-sized pad and issue', async () => {
  await page.getByRole('button', { name: 'חתימת החייל' }).click();
  await sideways('signing');
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no signature pad');
  if (box.width < 250 || box.height < 120) throw new Error(`signature pad is only ${Math.round(box.width)}x${Math.round(box.height)}`);
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'חתום ונפק' }).click();
  await page.getByText(/טופס 1008 מספר/).first().waitFor({ timeout: 8000 });
  const rows = await held(S);
  if (rows.length !== 2) throw new Error(`soldier holds ${rows.length} signatures, expected 2`);
  await sideways('signed');
}, null);

console.log('\n== זיכוי on a phone ==');
await step('phone: חתימות finds the soldier and returns everything', async () => {
  await page.goto(`${BASE}/issue/documents`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('חיפוש לפי שם, מ.א. או מסד').fill(S.last);
  await page.keyboard.press('Enter');
  await sideways('signatures list');
  await page.getByText(S.last).first().click();
  await page.getByRole('button', { name: 'זכה הכל' }).click();
  const dlg = page.locator('[role=dialog],[role=alertdialog]');
  await dlg.first().waitFor();
  await sideways('return dialog');
  await dlg.getByRole('button').filter({ hasNotText: /ביטול|סגור/ }).last().click();
  await page.waitForTimeout(1500);
  const left = await held(S);
  if (left.length) throw new Error(`${left.length} items still held after returning all`);
}, null);

await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
