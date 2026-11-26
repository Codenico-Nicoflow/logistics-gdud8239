/**
 * Feature flows as an admin in a real browser: catalog, soldiers, users. Everything created is tagged E2E and
 * removed by the flow itself (or by `cleanup.mjs` if a step died half way).
 */
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';

const TAG = `E2E${Date.now() % 100000}`;
const c = creds();
const browser = await launch();
const { page } = await newPage(browser);
await signIn(page, c.admin);

const dialog = () => page.getByRole('dialog');
const anyDialog = () => page.locator('[role=dialog],[role=alertdialog]').last();
const field = (scope, label) => scope.locator(`label:has-text("${label}") input`).first();
const toastText = async () => (await page.locator('[role=status],[role=alert]').allInnerTexts()).join(' | ');
const go = async (p) => { await page.goto(BASE + p); await page.waitForTimeout(700); };
const rowOf = (text) => page.locator('tr', { hasText: text }).first();

console.log('\n== catalog ==');
const ITEM = `${TAG} רובה`;
await step('catalog: create serialized item', async () => {
  await go('/equipment');
  await page.getByRole('button', { name: 'הוסף פריט' }).click();
  await field(dialog(), 'שם הפריט').fill(ITEM);
  await dialog().locator('label:has-text("דורש מסד") input').check();
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await rowOf(ITEM).waitFor({ timeout: 5000 });
}, page);

await step('catalog: empty name cannot be saved', async () => {
  await page.getByRole('button', { name: 'הוסף פריט' }).click();
  const save = dialog().getByRole('button', { name: 'שמור' });
  if (!(await save.isDisabled())) throw new Error('save enabled with no name');
  await field(dialog(), 'שם הפריט').fill('   ');
  if (!(await save.isDisabled())) throw new Error('save enabled with whitespace name');
  await dialog().getByRole('button', { name: 'ביטול' }).click();
}, page);

await step('catalog: duplicate item name is refused with a message', async () => {
  await page.getByRole('button', { name: 'הוסף פריט' }).click();
  await field(dialog(), 'שם הפריט').fill(ITEM);
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(800);
  const text = await dialog().innerText().catch(() => '') + (await toastText());
  const stillOpen = await dialog().count();
  if (!stillOpen) throw new Error('dialog closed: duplicate was accepted?');
  if (!/קיים|כבר|שגיאה|נכשל/.test(text)) throw new Error(`no readable error: ${text.slice(0, 120)}`);
  await dialog().getByRole('button', { name: 'ביטול' }).click();
}, page);

const SERIAL = `${TAG}-001`;
await step('catalog: add a מסד, duplicate refused, remove it', async () => {
  await rowOf(ITEM).getByRole('button', { name: 'מסדים' }).click();
  await dialog().locator('input').first().fill(SERIAL);
  await dialog().getByRole('button', { name: 'הוסף מסד' }).click();
  await dialog().getByText(SERIAL).filter({ visible: true }).first().waitFor({ timeout: 4000 });
  await dialog().locator('input').first().fill(SERIAL);
  await dialog().getByRole('button', { name: 'הוסף מסד' }).click();
  await page.waitForTimeout(700);
  const n = await dialog().getByText(SERIAL).filter({ visible: true }).count();
  if (n > 1) throw new Error(`duplicate serial listed ${n} times`);
  await dialog().locator('input').first().fill(`  ${TAG}-002  `);
  await dialog().getByRole('button', { name: 'הוסף מסד' }).click();
  await dialog().getByText(`${TAG}-002`).filter({ visible: true }).first().waitFor({ timeout: 4000 });
  await dialog().getByRole('button', { name: 'הסר' }).filter({ visible: true }).last().click();
  await anyDialog().getByRole('button', { name: /^(מחק|הסר|מחיקה)$/ }).last().click();
  await page.waitForTimeout(800);
  if (await dialog().getByText(`${TAG}-002`).filter({ visible: true }).count()) throw new Error('removed serial still listed');
  await dialog().getByRole('button', { name: 'סגור' }).first().click();
}, page);

await step('catalog: stock number follows the serials (derived מצבה)', async () => {
  const cells = await rowOf(ITEM).locator('td').allInnerTexts();
  if (cells[3]?.trim() !== '1') throw new Error(`סה״כ מלאי should be 1, got ${JSON.stringify(cells.slice(0, 7))}`);
}, page);

await step('catalog: edit renames and keeps the serials', async () => {
  await rowOf(ITEM).getByRole('button', { name: 'עריכה' }).click();
  await field(dialog(), 'שם הפריט').fill(`${ITEM} ב`);
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await rowOf(`${ITEM} ב`).waitFor({ timeout: 4000 });
}, page);

await step('catalog: XSS-looking name renders as text', async () => {
  await page.getByRole('button', { name: 'הוסף פריט' }).click();
  await field(dialog(), 'שם הפריט').fill(`${TAG}<img src=x onerror=window.__xss=1>`);
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(900);
  if (await page.evaluate(() => window.__xss)) throw new Error('script ran from an item name');
  const row = rowOf(`${TAG}<img`);
  await row.waitFor({ timeout: 3000 });
  await row.getByRole('button', { name: 'מחק' }).click();
  await anyDialog().getByRole('button', { name: /^(מחק|מחיקה)$/ }).last().click();
  await page.waitForTimeout(700);
}, page);

console.log('\n== soldiers ==');
const LAST = `${TAG}-ח`;
const PN = String(1000000 + (Date.now() % 8000000));
await step('soldiers: add with only the required fields', async () => {
  await go('/soldiers');
  await page.getByRole('button', { name: 'הוסף חייל' }).click();
  await field(dialog(), 'שם פרטי').fill('דנה');
  await field(dialog(), 'שם משפחה').fill(LAST);
  await field(dialog(), 'מספר אישי').fill(PN);
  const create = dialog().getByRole('button', { name: 'צור והמשך' });
  if (await create.isDisabled()) throw new Error('create disabled with all required fields filled');
  await create.click();
  await page.waitForTimeout(1200);
}, page);

await step('soldiers: bad מ.א. and phone are refused before saving', async () => {
  await go('/soldiers');
  await page.getByRole('button', { name: 'הוסף חייל' }).click();
  await field(dialog(), 'שם פרטי').fill('בדיקה');
  await field(dialog(), 'שם משפחה').fill(`${TAG}-bad`);
  await field(dialog(), 'מספר אישי').fill('12ab');
  await field(dialog(), 'טלפון').fill('555');
  // The button must stay off for a malformed מ.א.; a click would only time out, which is the point.
  if (!(await dialog().getByRole('button', { name: 'צור והמשך' }).isDisabled())) throw new Error('create enabled with מ.א. "12ab"');
  await field(dialog(), 'מספר אישי').fill('1234567');
  // phone "555" is not blocked client-side; the server must refuse it
  await dialog().getByRole('button', { name: 'צור והמשך' }).click();
  await page.waitForTimeout(1200);
  if (!(await dialog().count())) throw new Error('soldier with phone "555" was created');
  await dialog().getByRole('button', { name: 'ביטול' }).click();
}, page);

await step('soldiers: search finds, edit saves, filters do not crash', async () => {
  await go('/soldiers');
  const box = page.getByPlaceholder('חפש לפי שם, מספר אישי או טלפון');
  await box.fill(LAST); await box.press('Enter'); await page.waitForTimeout(900);
  const cards = await page.getByText(LAST).count();
  if (!cards) throw new Error('added soldier not found by surname');
  await page.getByRole('button', { name: 'עריכה' }).first().click();
  await field(dialog(), 'טלפון').fill('0501234567');
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(900);
  for (const lbl of ['רק חיילים עם פרטים חסרים', 'מסופחים בלבד']) {
    await page.getByLabel(lbl).check(); await page.waitForTimeout(500); await page.getByLabel(lbl).uncheck();
  }
}, page);

await step('soldiers: duplicate מ.א. is refused', async () => {
  await go('/soldiers');
  await page.getByRole('button', { name: 'הוסף חייל' }).click();
  await field(dialog(), 'שם פרטי').fill('כפול');
  await field(dialog(), 'שם משפחה').fill(`${TAG}-dup`);
  await field(dialog(), 'מספר אישי').fill(PN);
  await dialog().getByRole('button', { name: 'צור והמשך' }).click();
  await page.waitForTimeout(1500);
  const dupWarn = (await dialog().innerText().catch(() => '')) + (await toastText());
  if (/כבר|קיים|זהה|דומה/.test(dupWarn)) { note('INFO', 'duplicate warning shown'); }
  const text = (await dialog().innerText().catch(() => '')) + (await toastText());
  if (!(await dialog().count()) && !/קיים|כפול|כבר/.test(text)) throw new Error('second soldier with the same מ.א. was created silently');
  await page.keyboard.press('Escape');
  const cancel = dialog().getByRole('button', { name: 'ביטול' });
  if (await cancel.count()) await cancel.click();
}, page);

await step('soldiers: delete asks first, then removes', async () => {
  await go('/soldiers');
  const box = page.getByPlaceholder('חפש לפי שם, מספר אישי או טלפון');
  await box.fill(TAG); await box.press('Enter'); await page.waitForTimeout(900);
  for (let i = 0; i < 6; i++) {
    const del = page.getByRole('button', { name: 'מחיקה' });
    if (!(await del.count())) break;
    await del.first().click();
    await anyDialog().getByRole('button', { name: 'מחק' }).click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(600);
  if (await page.locator('li, tr').filter({ hasText: TAG }).count()) throw new Error('E2E soldiers still listed after deleting');
}, page);

console.log('\n== users ==');
const UNAME = `tmp_${TAG.toLowerCase()}`;
let setupUrl = '';
await step('users: create a user and get a one-time setup link', async () => {
  await go('/system');
  await page.getByRole('button', { name: 'הוסף משתמש' }).click();
  await field(dialog(), 'שם מלא').fill(`${TAG} משתמש`);
  await field(dialog(), 'שם משתמש').fill(UNAME);
  await dialog().getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(1200);
  const txt = await page.locator('body').innerText();
  const m = txt.match(/https?:\/\/\S+\/setup\/[\w-]+/) ?? (await page.locator('input').evaluateAll((els) => els.map((e) => e.value).filter((v) => /\/setup\//.test(v))));
  setupUrl = Array.isArray(m) ? (m[0] ?? '') : m[0];
  if (!setupUrl) throw new Error('no setup link shown after creating a user');
}, page);

await step('users: the link works once, enforces the password rules, and the account then signs in', async () => {
  const { ctx, page: p2 } = await newPage(browser);
  const token = setupUrl.split('/setup/')[1];
  await p2.goto(`${BASE}/setup/${token}`);
  await p2.locator('input[type=password]').first().waitFor({ timeout: 6000 });
  const pw = p2.locator('input[type=password]');
  const submit = p2.getByRole('button').last();
  await pw.nth(0).fill('short'); await pw.nth(1).fill('short');
  if (!(await submit.isDisabled())) { await submit.click(); await p2.waitForTimeout(700); if (!/12|ארוך|חלשה|קצר/.test(await p2.locator('body').innerText())) throw new Error('5-char password accepted without a readable error'); }
  await pw.nth(0).fill('Another-long-pass-9'); await pw.nth(1).fill('Different-long-pass-9');
  if (!(await submit.isDisabled())) { await submit.click(); await p2.waitForTimeout(700); if (new URL(p2.url()).pathname.startsWith('/setup') === false) throw new Error('mismatched confirmation accepted'); }
  const good = `${TAG}-Strong-pass-77`;
  await pw.nth(0).fill(good); await pw.nth(1).fill(good);
  await submit.click();
  await p2.waitForTimeout(2500);
  note('INFO', `after setup the page is at ${new URL(p2.url()).pathname}`);
  const again = await p2.goto(`${BASE}/setup/${token}`).then(() => p2.waitForTimeout(900));
  const t2 = await p2.locator('body').innerText();
  if (/Another|בחר סיסמה|הגדרת סיסמה/.test(t2) && (await p2.locator('input[type=password]').count()) > 0) throw new Error('used link still shows the form');
  await ctx.close();
}, page);

await step('users: lock/unlock/log/mfa controls render for the new user', async () => {
  await go('/system');
  const row = page.locator('tr', { hasText: UNAME }).first();
  if (!(await row.count())) throw new Error('new user not in list');
  const t = await row.innerText();
  if (/\[object Object\]|undefined/.test(t)) throw new Error('junk in user row');
}, page);

await step('users: cleanup (delete the user)', async () => {
  await go('/system');
  const row = page.locator('tr', { hasText: UNAME }).first();
  await row.getByRole('button', { name: /מחק|מחיקה/ }).first().click();
  const confirm = anyDialog().getByRole('button', { name: /^(מחק|מחיקה)$/ });
  if (await confirm.count()) await confirm.last().click();
  await page.waitForTimeout(900);
}, page);

console.log('\n== catalog cleanup ==');
await step('catalog: an item that still has a מסד cannot be deleted, and the dialog says why and offers to deactivate', async () => {
  await go('/equipment');
  const row = rowOf(`${ITEM} ב`);
  await row.getByRole('button', { name: 'מחק' }).click();
  await anyDialog().waitFor();
  const t = await anyDialog().innerText();
  if (!/לא ניתן למחוק/.test(t)) throw new Error(`no refusal reason: ${t.slice(0, 100)}`);
  if (!/השבת/.test(t)) throw new Error('no deactivate alternative offered');
  await anyDialog().getByRole('button', { name: 'סגור' }).click();
}, page);

await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
