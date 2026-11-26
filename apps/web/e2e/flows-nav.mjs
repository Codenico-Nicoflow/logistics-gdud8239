/**
 * The hub/tab navigation in a real browser, for every role: the rail offers exactly its hubs, every allowed
 * tab opens and shows its screen, the active tab is marked, tabs a role may not open are absent and
 * unreachable by address, old addresses redirect, and on a phone nothing scrolls sideways.
 * Read-only: it only navigates.
 */
import { BASE, creds, launch, newPage, signIn, step, report, summary } from './lib.mjs';

const HUBS = {
  issue: { label: 'ניפוק וחתימות', path: '/issue' },
  periods: { label: 'תקופת שרות', path: '/periods' },
  soldiers: { label: 'חיילים', path: '/soldiers' },
  reports: { label: 'דוחות', path: '/reports' },
  equipment: { label: 'ציוד', path: '/equipment' },
  system: { label: 'מערכת', path: '/system' },
  attendance: { label: 'ימי יציאה', path: '/attendance' },
  help: { label: 'מדריך', path: '/help' },
  security: { label: 'אבטחה', path: '/security' },
};
const TABS = {
  issue: [['ניפוק', '/issue'], ['חתימות', '/issue/documents'], ['אפסון', '/issue/ifsun']],
  periods: [['הקצאה לתקופת שרות', '/periods'], ['חלוקה לפי חייל', '/periods/by-soldier']],
  reports: [['מסכם', '/reports'], ['חלוקה לפלוגות', '/reports/companies'], ['ספירת נשקיה', '/reports/counts'], ['דוח תנועות יומי', '/reports/movements']],
  equipment: [['קטלוג פריטים', '/equipment'], ['קליטת ציוד', '/equipment/intake'], ['ערכות', '/equipment/kits'], ['מיפוי שמות', '/equipment/naming']],
  system: [['משתמשים', '/system'], ['גיבויים', '/system/backups']],
};
// role -> hub ids it sees, and which tab paths it may open inside each tabbed hub.
const EXPECT = {
  admin: { hubs: Object.keys(HUBS), tabs: { issue: [0, 1, 2], periods: [0, 1], reports: [0, 1, 2, 3], equipment: [0, 1, 2, 3], system: [0, 1] } },
  logistics: { hubs: ['issue', 'periods', 'soldiers', 'reports', 'attendance', 'help', 'security'], tabs: { issue: [0, 1, 2], periods: [0], reports: [0, 1, 2, 3] } },
  viewer: { hubs: ['issue', 'soldiers', 'security'], tabs: { issue: [1] } },
  SHLISHUT: { hubs: ['soldiers', 'security'], tabs: {} },
  SAMGAD: { hubs: ['periods', 'soldiers', 'reports', 'security'], tabs: { periods: [0], reports: [1] } },
  COMPANY_CMDR: { hubs: ['periods', 'soldiers', 'security'], tabs: { periods: [1] } },
};
const LEGACY = [
  ['/documents', '/issue/documents'], ['/ifsun', '/issue/ifsun'], ['/service-periods', '/periods'], ['/company-allocation', '/periods/by-soldier'],
  ['/summary', '/reports'], ['/company-split', '/reports/companies'], ['/counts', '/reports/counts'], ['/daily-movements', '/reports/movements'],
  ['/catalog', '/equipment'], ['/intake', '/equipment/intake'], ['/kits', '/equipment/kits'], ['/naming', '/equipment/naming'],
  ['/users', '/system'], ['/backups', '/system/backups'],
];
const landing = { admin: '/issue', logistics: '/issue', viewer: '/issue/documents', SHLISHUT: '/soldiers', SAMGAD: '/periods', COMPANY_CMDR: '/periods/by-soldier' };

const c = creds();
const browser = await launch();
const pathOf = (page) => new URL(page.url()).pathname;
const settle = (page) => page.waitForTimeout(900);
const blank = async (page, what) => {
  const text = (await page.locator('main').innerText()).trim();
  if (text.length < 15) throw new Error(`${what}: blank screen`);
  if (/\[object Object\]|undefined|NaN/.test(text)) throw new Error(`${what}: junk text ${text.match(/\[object Object\]|undefined|NaN/)[0]}`);
};
const railLabels = (page) => page.locator('nav a[href]').evaluateAll((as) => as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), current: a.getAttribute('aria-current') })));

for (const [role, exp] of Object.entries(EXPECT)) {
  console.log(`\n== ${role} (desktop) ==`);
  const { ctx, page } = await newPage(browser);
  await signIn(page, c[role]);

  await step(`${role}: lands on ${landing[role]}`, async () => {
    await page.goto(BASE + '/'); await settle(page);
    if (pathOf(page) !== landing[role]) throw new Error(`landed on ${pathOf(page)}`);
    await blank(page, 'landing');
  });

  await step(`${role}: rail offers exactly its hubs`, async () => {
    await page.goto(BASE + landing[role]); await settle(page);
    const links = await railLabels(page);
    const texts = links.map((l) => l.text);
    for (const id of Object.keys(HUBS)) {
      const has = texts.includes(HUBS[id].label);
      if (has !== exp.hubs.includes(id)) throw new Error(`hub ${HUBS[id].label}: ${has ? 'shown' : 'missing'}`);
    }
  });

  for (const id of exp.hubs) {
    await step(`${role}: hub ${HUBS[id].label} opens from the rail`, async () => {
      await page.goto(BASE + landing[role]); await settle(page);
      await page.locator('nav a', { hasText: HUBS[id].label }).first().click(); await settle(page);
      if (!pathOf(page).startsWith(HUBS[id].path)) throw new Error(`went to ${pathOf(page)}`);
      const links = await railLabels(page);
      const active = links.find((l) => l.text === HUBS[id].label);
      if (active?.current !== 'page') throw new Error('rail entry not marked active');
      await blank(page, HUBS[id].label);
    });
  }

  for (const [id, allowed] of Object.entries(exp.tabs)) {
    const all = TABS[id];
    for (const i of allowed) {
      const [label, path] = all[i];
      await step(`${role}: tab ${HUBS[id].label} › ${label}`, async () => {
        await page.goto(BASE + HUBS[id].path); await settle(page);
        if (allowed.length > 1) {
          await page.getByRole('navigation', { name: 'מסכים בקבוצה' }).getByRole('link', { name: label, exact: true }).click();
          await settle(page);
        } else {
          await page.goto(BASE + path); await settle(page);
        }
        if (pathOf(page) !== path) throw new Error(`went to ${pathOf(page)}`);
        await blank(page, label);
        if (allowed.length > 1) {
          const bar = page.getByRole('navigation', { name: 'מסכים בקבוצה' });
          const links = await bar.locator('a').evaluateAll((as) => as.map((a) => ({ t: a.textContent.trim(), cur: a.getAttribute('aria-current') })));
          const on = links.filter((l) => l.cur === 'page').map((l) => l.t);
          if (on.length !== 1 || on[0] !== label) throw new Error(`active tab is [${on}]`);
        }
      });
    }
    await step(`${role}: ${HUBS[id].label} shows ${allowed.length > 1 ? 'only its allowed tabs' : 'no tab bar'}`, async () => {
      await page.goto(BASE + HUBS[id].path); await settle(page);
      const bar = page.getByRole('navigation', { name: 'מסכים בקבוצה' });
      if (allowed.length <= 1) {
        if (await bar.count()) throw new Error('tab bar shown for a single tab');
        return;
      }
      const shown = await bar.locator('a').allInnerTexts();
      const want = allowed.map((i) => all[i][0]);
      if (JSON.stringify(shown.map((s) => s.trim())) !== JSON.stringify(want)) throw new Error(`tabs [${shown}] want [${want}]`);
    });
    for (const [i, [label, path]] of all.entries()) {
      if (allowed.includes(i)) continue;
      await step(`${role}: forbidden ${path} (${label}) is not rendered`, async () => {
        await page.goto(BASE + path); await settle(page);
        if (pathOf(page) === path && !allowed.includes(0)) throw new Error('forbidden address rendered');
        if (pathOf(page) === path && allowed.includes(0) && i !== 0) throw new Error('forbidden address rendered');
      });
    }
  }

  await step(`${role}: old addresses redirect (or are refused)`, async () => {
    for (const [from, to] of LEGACY) {
      await page.goto(BASE + from); await settle(page);
      const got = pathOf(page);
      const mayOpen = (() => {
        const [, hubPath] = to.match(/^(\/[a-z]+)/) ?? [];
        const id = Object.keys(HUBS).find((k) => HUBS[k].path === hubPath);
        if (!exp.hubs.includes(id)) return false;
        const tabs = TABS[id];
        const idx = tabs.findIndex(([, p]) => p === to);
        return (exp.tabs[id] ?? []).includes(idx);
      })();
      if (mayOpen && got !== to) throw new Error(`${from} -> ${got}, wanted ${to}`);
      if (!mayOpen && got === to) throw new Error(`${from} rendered ${to} for ${role}`);
    }
  });
  await ctx.close();

  console.log(`== ${role} (phone 390px) ==`);
  const phone = await newPage(browser, { width: 390, height: 844, mobile: true });
  await signIn(phone.page, c[role]);
  const urls = [...new Set([landing[role], ...exp.hubs.map((h) => HUBS[h].path), ...Object.entries(exp.tabs).flatMap(([id, a]) => a.map((i) => TABS[id][i][1]))])];
  await step(`${role}: phone — every reachable screen has no sideways page scroll`, async () => {
    const bad = [];
    for (const u of urls) {
      await phone.page.goto(BASE + u); await settle(phone.page);
      const w = await phone.page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      if (w.s > w.c + 1) bad.push(`${u} (${w.s}>${w.c})`);
    }
    if (bad.length) throw new Error(`page scrolls sideways: ${bad.join(', ')}`);
  });
  await step(`${role}: phone — menu opens, shows its hubs, tapping one navigates and closes it`, async () => {
    await phone.page.goto(BASE + landing[role]); await settle(phone.page);
    await phone.page.getByRole('button', { name: 'תפריט' }).click();
    const target = exp.hubs.filter((h) => h !== 'security').at(-1) ?? 'security';
    const link = phone.page.locator('nav a', { hasText: HUBS[target].label }).first();
    await link.waitFor({ state: 'visible' });
    await link.click(); await settle(phone.page);
    if (!pathOf(phone.page).startsWith(HUBS[target].path)) throw new Error(`went to ${pathOf(phone.page)}`);
    if (await phone.page.getByRole('button', { name: 'סגור' }).count()) throw new Error('menu stayed open');
  });
  if (exp.tabs.reports?.length > 1 || exp.tabs.equipment?.length > 1) {
    await step(`${role}: phone — tab bar is reachable and tappable`, async () => {
      const id = exp.tabs.equipment ? 'equipment' : 'reports';
      await phone.page.goto(BASE + HUBS[id].path); await settle(phone.page);
      const last = TABS[id][exp.tabs[id].at(-1)];
      const tab = phone.page.getByRole('navigation', { name: 'מסכים בקבוצה' }).getByRole('link', { name: last[0], exact: true });
      await tab.scrollIntoViewIfNeeded(); await tab.click(); await settle(phone.page);
      if (pathOf(phone.page) !== last[1]) throw new Error(`went to ${pathOf(phone.page)}`);
    });
  }
  await phone.ctx.close();
}
await browser.close();
report();
process.exit(summary().failed ? 1 : 0);
