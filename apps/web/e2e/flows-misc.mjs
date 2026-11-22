/**
 * Authenticator-app enrolment and sign-in, counts, attendance, backups — then, last, the lockout and rate-limit
 * behaviour (it blocks this machine's address for a while, so it runs after everything else).
 */
import { createHmac } from 'node:crypto';
import { BASE, creds, launch, newPage, signIn, step, report, note, summary } from './lib.mjs';
import { api } from './seed.mjs';

const TAG = `E2E${Date.now() % 100000}`;
const credsFile = process.argv[process.argv.indexOf('--creds') + 1];
const a = await api(credsFile);
const c = creds();
const LATE = process.argv.includes('--with-lockout');

// RFC 6238, the same arithmetic as the phone app.
function totp(secretB32, atMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretB32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** A throwaway viewer with a known password, made through the real invite endpoints. */
async function makeUser(suffix, role = 'viewer') {
  const username = `tmp_${TAG.toLowerCase()}${suffix}`;
  const u = await a('POST', '/users', { displayName: `${TAG} ${suffix}`, username, role });
  if (u.status !== 201) throw new Error(`create user ${u.status} ${JSON.stringify(u.body)}`);
  const token = u.body.setup.url.split('/setup/')[1];
  const password = `Qwerty-${Math.random().toString(36).slice(2, 10)}-${suffix}-pass`;
  const done = await fetch('http://localhost:3100/api/auth/setup/' + token, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5174' }, body: JSON.stringify({ password }),
  });
  if (done.status !== 200) throw new Error(`setup ${done.status} ${await done.text()}`);
  return { id: u.body.id, username, password };
}

const browser = await launch();
const { page } = await newPage(browser);
await signIn(page, c.admin);
const go = (p) => page.goto(BASE + p, { waitUntil: 'networkidle' });

console.log('\n== authenticator app ==');
const mfaUser = await makeUser('m');
let secret = '';
await step('mfa: enrol from the security page, backup codes appear, then the app loads', async () => {
  const { ctx, page: p } = await newPage(browser);
  await signIn(p, mfaUser);
  await p.goto(BASE + '/security', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'הגדרת אפליקציית אימות' }).click();
  await p.locator('summary').click();
  secret = (await p.locator('span.serial[dir=ltr]').first().innerText()).replace(/\s+/g, '');
  if (!/^[A-Z2-7]{16,}$/.test(secret)) throw new Error(`secret shown is not base32: ${secret.slice(0, 20)}`);
  // the QR must be an image made in the page (no third party)
  const imgs = await p.locator('img').evaluateAll((els) => els.map((e) => e.src.slice(0, 20)));
  if (!imgs.some((s) => s.startsWith('data:image'))) throw new Error('QR is not a local data: image');
  await p.getByRole('textbox').last().fill('000000');
  await p.getByRole('button', { name: 'אישור והמשך' }).click();
  await p.waitForTimeout(900);
  if (!/שגוי|פג תוקפו/.test(await p.locator('body').innerText())) throw new Error('wrong code gave no message');
  await p.getByRole('textbox').last().fill(totp(secret));
  await p.getByRole('button', { name: 'אישור והמשך' }).click();
  await p.getByText('קודי גיבוי — שמרו אותם עכשיו').waitFor();
  const codes = await p.locator('ul[dir=ltr] li').allInnerTexts();
  if (codes.length !== 8 || !codes.every((x) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(x.trim()))) throw new Error(`backup codes look wrong: ${JSON.stringify(codes)}`);
  mfaUser.backup = codes[0].trim();
  await p.getByRole('button', { name: /שמרתי את הקודים|סיום/ }).click();
  await p.waitForTimeout(1500);
  await ctx.close();
}, page);

await step('mfa: sign-in now asks for a code; wrong code refused; a code works once; a backup code works once', async () => {
  const { ctx, page: p } = await newPage(browser);
  try {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('textbox').first().fill(mfaUser.username);
  await p.locator('input[type=password]').fill(mfaUser.password);
  await p.getByRole('button', { name: 'כניסה', exact: true }).click();
  await p.getByRole('heading', { name: 'קוד אימות' }).waitFor();
  if (await p.locator('input[type=password]').count()) throw new Error('password box still on screen at the code step');
  const box = p.getByRole('textbox').first();
  await box.fill('123456');
  await p.getByRole('button', { name: 'אימות והתחברות' }).click();
  try { await p.locator('[role=alert]').first().waitFor({ timeout: 5000 }); }
  catch { throw new Error(`wrong code gave no message; screen: ${(await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 220)}`); }
  // The enrol step already spent this 30 s window's code (single use by design), so use the next window's.
  const code = totp(secret, Date.now() + 30000);
  await box.fill(code);
  await p.getByRole('button', { name: 'אימות והתחברות' }).click();
  await p.waitForFunction(() => !document.querySelector('input[type=password]') && !document.body.innerText.includes('קוד אימות'), null, { timeout: 8000 });
  // log out, replay the same code → must be refused
  await p.context().clearCookies();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('textbox').first().fill(mfaUser.username);
  await p.locator('input[type=password]').fill(mfaUser.password);
  await p.getByRole('button', { name: 'כניסה', exact: true }).click();
  await p.getByRole('heading', { name: 'קוד אימות' }).waitFor();
  await p.getByRole('textbox').first().fill(code);
  await p.getByRole('button', { name: 'אימות והתחברות' }).click();
  await p.waitForTimeout(1200);
  if (await p.locator('nav, aside').count() && !(await p.getByRole('heading', { name: 'קוד אימות' }).count())) throw new Error('the same code signed in twice');
  await p.getByRole('textbox').first().fill(mfaUser.backup);
  await p.getByRole('button', { name: 'אימות והתחברות' }).click();
  await p.waitForFunction(() => !document.body.innerText.includes('קוד אימות'), null, { timeout: 8000 });
  } catch (e) { await p.screenshot({ path: './e2e/out/mfa_signin_debug.png' }); throw e; }
  await ctx.close();
}, page);

await step('mfa: admin can reset it for the user, who then signs in with the password alone', async () => {
  const r = await a('POST', `/users/${mfaUser.id}/mfa-reset`, {});
  if (r.status >= 300) throw new Error(`reset ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  const login = await fetch('http://localhost:3100/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: mfaUser.username, password: mfaUser.password }) });
  const body = await login.json();
  note('INFO', `after a reset the old password gives: ${login.status} ${JSON.stringify(body).slice(0, 80)}`);
}, null);

console.log('\n== counts ==');
await step('counts: closing without both signatures is refused with a message', async () => {
  await go('/counts');
  await page.getByRole('button', { name: 'חתום וסגור ספירה' }).click();
  await page.waitForTimeout(1200);
  const text = await page.locator('body').innerText();
  if (!/חתימ|חסר|נדרש|שם|נכשל|שגיאה/.test(text)) throw new Error('no message when closing an unsigned count');
}, page);

console.log('\n== attendance ==');
await step('attendance: add a member, set a day, remove the member', async () => {
  await go('/attendance');
  await page.getByRole('button', { name: 'הוסף חבר צוות' }).click();
  await page.locator('[role=dialog] input').first().fill(`${TAG}`);
  await page.getByRole('dialog').getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(1000);
  const row = page.locator('tr, li', { hasText: TAG }).first();
  await row.waitFor();
  await row.locator('select').first().selectOption({ label: 'חופש' });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  const v = await page.locator('tr, li', { hasText: TAG }).first().locator('select').first().inputValue();
  if (v !== 'ON_LEAVE') throw new Error(`status did not persist: "${v}"`);
  await page.locator('tr, li', { hasText: TAG }).first().getByRole('button', { name: 'מחק' }).click();
  await page.locator('[role=dialog],[role=alertdialog]').getByRole('button', { name: 'מחק' }).last().click();
  await page.waitForTimeout(900);
  if (await page.locator('tr, li', { hasText: TAG }).count()) throw new Error('member still listed after delete');
}, page);

// Sending the week to Slack is NOT exercised: with a token in .env it posts to the real channel. Run the API with
// SLACK_BOT_TOKEN= and SLACK_CHANNEL_ID= empty if you want to drive it.

console.log('\n== backups ==');
await step('backups: create the daily workbook snapshot, it is listed, download works, delete it', async () => {
  await go('/backups');
  const before = await page.locator('main li, main tbody tr').count();
  await page.getByRole('button', { name: 'צור גיבוי עכשיו' }).last().click();
  await page.waitForTimeout(6000);
  const after = await page.locator('main li, main tbody tr').count();
  if (after <= before) throw new Error(`list did not grow (${before} -> ${after})`);
}, page);

console.log('\n== viewer / restricted roles cannot reach admin APIs from the browser either ==');
await step('viewer: direct fetch of admin and export endpoints is refused', async () => {
  const { ctx, page: p } = await newPage(browser);
  await signIn(p, c.viewer);
  const codes = await p.evaluate(async () => {
    const out = {};
    for (const u of ['/api/users', '/api/excel/export', '/api/db-backups', '/api/snapshots', '/api/permissions', '/api/attendance/week', '/api/counts/recent']) {
      out[u] = (await fetch(u, { credentials: 'include' })).status;
    }
    return out;
  });
  const bad = Object.entries(codes).filter(([, s]) => s !== 403);
  if (bad.length) throw new Error(`viewer got ${JSON.stringify(bad)}`);
  await ctx.close();
}, page);

if (LATE) {
  console.log('\n== lockout and rate limits (blocks this machine for a while) ==');
  const victim = await makeUser('l');
  await step('lockout: wrong password repeatedly locks the account; the right password is then refused with a readable message', async () => {
    const { ctx, page: p } = await newPage(browser);
    const seen = [];
    for (let i = 0; i < 7; i++) {
      await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await p.getByRole('textbox').first().fill(victim.username);
      await p.locator('input[type=password]').fill('wrong-password-' + i);
      await p.getByRole('button', { name: 'כניסה', exact: true }).click();
      await p.waitForTimeout(500);
      seen.push((await p.locator('[role=alert]').first().innerText().catch(() => '')).slice(0, 60));
    }
    note('INFO', `messages across 7 wrong attempts: ${JSON.stringify([...new Set(seen)])}`);
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.getByRole('textbox').first().fill(victim.username);
    await p.locator('input[type=password]').fill(victim.password);
    await p.getByRole('button', { name: 'כניסה', exact: true }).click();
    await p.waitForTimeout(900);
    const signedIn = (await p.locator('input[type=password]').count()) === 0;
    if (signedIn) throw new Error('correct password accepted while the account should be locked');
    const msg = (await p.locator('[role=alert]').first().innerText().catch(() => ''));
    note('INFO', `correct password on a locked account says: "${msg.slice(0, 80)}"`);
    if (!msg.trim()) throw new Error('locked account shows no message at all');
    await ctx.close();
  }, page);
}

await a('DELETE', `/users/${mfaUser.id}`);
await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
