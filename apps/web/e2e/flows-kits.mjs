/**
 * ערכות in a real browser: build a kit on the page, then issue its base item and see the basket fill up.
 * Items are tagged E2E and removed by cleanup.sql.
 */
import { BASE, creds, launch, newPage, signIn, step, report } from './lib.mjs';
import { api } from './seed.mjs';

const TAG = `E2EK${Date.now() % 100000}`;
const a = await api(process.argv[process.argv.indexOf('--creds') + 1]);
const mk = (name, extra = {}) =>
  a('POST', '/items', { name: `${TAG} ${name}`, category: 'GEAR', isSerialized: false, authorizedQty: 50, yamahQty: 0, repairQty: 0, inSummary: true, aliases: [], ...extra });
const rifle = await mk('רובה', { category: 'WEAPON', isSerialized: true, authorizedQty: 0 });
const mag = await mk('מחסנית');
const sling = await mk('רצועה');
const soldier = await a('POST', '/soldiers', { firstName: 'בדיקה', lastName: TAG, company: 'A', personalNumber: String(3000000 + (Date.now() % 6000000)) });
await a('PATCH', `/soldiers/${soldier.body.id}/enlistment`, { enlisted: true });
await a('POST', `/items/${rifle.body.id}/instances`, { serial: `${TAG}-1` });

const browser = await launch();
const { page } = await newPage(browser);
await signIn(page, creds().admin);
const go = async (p) => { await page.goto(BASE + p); await page.waitForTimeout(700); };
const pick = (name) => page.getByRole('button', { name: new RegExp(name) }).first().click();

console.log('\n== kits ==');
await step('kits: page is in the nav and opens', async () => {
  await go('/');
  await page.getByRole('link', { name: 'ערכות' }).first().click();
  await page.getByText('בחרו פריט כדי לראות או לערוך את הערכה שלו').waitFor();
}, page);

await step('kits: build a kit and save it', async () => {
  await go('/kits');
  await pick(`${TAG} רובה`);
  await page.getByText(`הערכה של ${TAG} רובה`).waitFor();
  const adder = page.getByLabel('הוספת פריט לערכה');
  await adder.selectOption({ label: `${TAG} מחסנית` });
  await adder.selectOption({ label: `${TAG} רצועה` });
  await page.getByLabel('כמות').first().fill('5');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByText('הערכה נשמרה').waitFor();
}, page);

await step('kits: history shows the save', async () => {
  await go('/kits');
  await pick(`${TAG} רובה`);
  await page.getByText('היסטוריית שינויים').waitFor();
  await page.getByText(/על ידי/).first().waitFor();
}, page);

await step('kits: the kit survives a reload', async () => {
  await go('/kits');
  await pick(`${TAG} רובה`);
  await page.getByText(`${TAG} רצועה`).first().waitFor();
  const q = await page.getByLabel('כמות').first().inputValue();
  if (q !== '5') throw new Error(`quantity after reload is ${q}`);
}, page);

await step('kits: issuing the rifle pre-fills the basket from the kit', async () => {
  await go('/issue');
  await page.getByPlaceholder('חפש חייל לפי שם או מ.א.').fill(TAG);
  await page.getByRole('button', { name: 'חפש' }).click();
  await page.waitForTimeout(900);
  await page.locator('ul button').first().click();
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  await page.getByRole('button', { name: 'חפש פריט להוספה' }).click();
  await page.keyboard.type(`${TAG} רובה`);
  await page.waitForTimeout(700);
  await page.locator('[role=listbox] li').first().click();
  await page.getByRole('button', { name: /הוסף \d+ נבחרים/ }).click();
  await page.waitForTimeout(900);
  const text = await page.locator('main').innerText();
  for (const n of [`${TAG} מחסנית`, `${TAG} רצועה`]) if (!text.includes(n)) throw new Error(`basket is missing ${n}`);
}, page);

await step('kits: an item in a kit cannot be deleted, and the message names the kit', async () => {
  await go('/catalog');
  await page.locator('tr', { hasText: `${TAG} מחסנית` }).first().getByRole('button', { name: /מחק|הסר/ }).first().click();
  await page.getByText(new RegExp(`מופיע בערכות: ${TAG} רובה`)).waitFor();
  await page.keyboard.press('Escape');
}, page);

await step('kits: removing every line removes the kit', async () => {
  await go('/kits');
  await pick(`${TAG} רובה`);
  await page.getByRole('button', { name: new RegExp(`הסרת ${TAG} מחסנית`) }).click();
  await page.getByRole('button', { name: new RegExp(`הסרת ${TAG} רצועה`) }).click();
  await page.getByText(/אין שורות בערכה/).waitFor();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByText('הערכה הוסרה').waitFor();
}, page);

await browser.close();
report();
