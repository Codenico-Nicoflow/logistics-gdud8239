/**
 * An unsigned ניפוק survives the slips that used to empty it, on a phone: a reload, stepping back to the
 * soldier search and picking him again, and the browser coming back to the page later. It must not leak into
 * another soldier, must not keep the signature, and must be gone once the form is signed or discarded.
 *
 * Data is seeded through the API as an admin (tagged E2E…) and removed by `cleanup.sql`.
 */
import { BASE, creds, launch, newPage, signIn, step, report, summary } from './lib.mjs';
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

const S1 = await mkSoldier('א');
const S2 = await mkSoldier('ב');
const GEAR = await mkItem(' ציוד');
await a('POST', `/items/${GEAR.id}/instances`, { serial: `${TAG}-D1` });
const BULK = await mkItem(' כמותי', { isSerialized: false, authorizedQty: 20 });

const browser = await launch();
const { page } = await newPage(browser, { width: 390, height: 844, mobile: true });
await signIn(page, c.admin);

const RESTORED = /חזרנו לטופס שלא נחתם/;
const SEARCH = 'חפש חייל לפי שם או מ.א.';
const pickSoldier = async (s) => {
  await page.getByPlaceholder(SEARCH).fill(s.last);
  await page.getByRole('button', { name: 'חפש', exact: true }).click();
  await page.locator('ul button').first().click();
  // A soldier with a draft opens on his basket (with the notice) instead of the details screen.
  await page.getByText(/שם מלא|חזרנו לטופס שלא נחתם/).first().waitFor();
};
const addItem = async (item) => {
  await page.getByRole('button', { name: 'חפש פריט להוספה' }).click();
  await page.keyboard.type(item.name);
  await page.locator('[role=listbox] li').first().click();
  await page.getByRole('button', { name: /הוסף \d+ נבחרים/ }).click();
};
/** From the basket: חזור to the soldier's details, then החלף חייל to the search. */
const backToSearch = async () => {
  const back = page.getByRole('button', { name: 'חזור', exact: true });
  if (await back.count()) await back.first().click();
  await page.getByRole('button', { name: 'החלף חייל' }).click();
};
const itemRows = () => page.locator('main li', { hasText: new RegExp(`${TAG} (ציוד|כמותי)`) }).count();
const bulkQty = () => page.locator('main li', { hasText: BULK.name }).locator('input[type=number]').first().inputValue();

console.log('\n== draft on a phone ==');
await step('build a basket: serialized item with its מסד, a bulk item at quantity 7', async () => {
  await page.goto(`${BASE}/issue`, { waitUntil: 'networkidle' });
  await pickSoldier(S1);
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  await addItem(GEAR);
  await page.getByRole('button', { name: `${TAG}-D1` }).first().click();
  await addItem(BULK);
  await page.locator('main li', { hasText: BULK.name }).locator('input[type=number]').first().fill('7');
  await page.waitForTimeout(500);
  if ((await itemRows()) !== 2) throw new Error('basket was not built');
});

await step('reload mid-handover: same soldier, same rows, same מסד and quantity, with the notice', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(RESTORED).waitFor({ timeout: 6000 });
  if ((await itemRows()) !== 2) throw new Error(`${await itemRows()} rows after reload, expected 2`);
  if (!(await page.locator(`input[value="${TAG}-D1"]`).count()) && !(await page.getByText(`${TAG}-D1`).count())) throw new Error('the מסד is gone');
  if ((await bulkQty()) !== '7') throw new Error(`quantity is ${await bulkQty()}, expected 7`);
});

await step('back to the search, pick him again: his basket returns', async () => {
  await backToSearch();
  await page.getByPlaceholder(SEARCH).waitFor();
  await pickSoldier(S1);
  await page.getByText(RESTORED).waitFor({ timeout: 6000 });
  if ((await itemRows()) !== 2) throw new Error(`${await itemRows()} rows after re-picking, expected 2`);
});

await step('another soldier starts clean — never inherits that basket', async () => {
  await backToSearch();
  await pickSoldier(S2);
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  if ((await itemRows()) !== 0) throw new Error('the second soldier saw the first one\'s items');
  if (await page.getByText(RESTORED).count()) throw new Error('restore notice shown for a soldier with no draft');
});

await step('"מחק והתחל מחדש" empties the basket and it stays empty after a reload', async () => {
  await backToSearch();
  await pickSoldier(S1);
  await page.getByRole('button', { name: 'מחק והתחל מחדש' }).click();
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  if ((await itemRows()) !== 0) throw new Error('basket not emptied');
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.getByText(RESTORED).count()) throw new Error('discarded draft came back');
});

await step('a signed form leaves no draft behind', async () => {
  await page.goto(`${BASE}/issue`, { waitUntil: 'networkidle' });
  await pickSoldier(S1);
  await page.getByRole('button', { name: 'המשך לבחירת פריט' }).click();
  await addItem(GEAR);
  await page.getByRole('button', { name: `${TAG}-D1` }).first().click();
  await page.getByRole('button', { name: 'חתימת החייל' }).click();
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(RESTORED).waitFor({ timeout: 6000 });
  const sigGone = await page.locator('canvas').first().evaluate((cv) => !cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.some((v, i) => i % 4 === 3 && v !== 0));
  if (!sigGone) throw new Error('the soldier\'s signature was restored; it must never be stored');
  await page.getByRole('button', { name: 'חתום ונפק' }).waitFor();
  if (await page.getByRole('button', { name: 'חתום ונפק' }).isEnabled()) throw new Error('sign button enabled with no signature after the reload');
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
  const b2 = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(b2.x + 20, b2.y + 40);
  await page.mouse.down();
  await page.mouse.move(b2.x + 150, b2.y + 70, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'חתום ונפק' }).click();
  await page.getByText(/טופס 1008 מספר/).first().waitFor({ timeout: 8000 });
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.getByText(RESTORED).count()) throw new Error('a signed form still offered a draft');
});

await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
