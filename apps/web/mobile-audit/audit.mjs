/**
 * Mobile layout audit. Opens every screen at real phone widths in a real (touch, mobile) browser and
 * reports anything that makes the PAGE scroll sideways, the exact elements that stick out, inner
 * scroll areas that actually overflow, and controls too small to tap or that make iOS zoom in.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=… node mobile-audit/audit.mjs --creds /path/creds.json [--engine webkit|chromium]
 *        [--base http://localhost:5173] [--out dir] [--widths 320,390] [--only /catalog,/users]
 *
 * A screen FAILS if the page scrolls sideways, if anything sticks out of the screen, or if any inner area
 * scrolls sideways (a table cut off inside its card is exactly what a phone user cannot read).
 *
 * Needs the dev servers running and a Chrome install. Read-only: it only navigates and opens menus.
 */
import { chromium, webkit, devices } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:5173');
const OUT = arg('out', './mobile-audit/out');
const WIDTHS = arg('widths', '320,360,375,390,430,440').split(',').map(Number);
const SHOTS = arg('shots', '390').split(',').map(Number);
const creds = JSON.parse(readFileSync(arg('creds'), 'utf8'));
const ONLY = arg('only', '');
// Safari's engine by default: it is what iPhones run, and it lays things out differently from Chrome.
const ENGINE = arg('engine', 'webkit');

const ROUTES = [
  '/issue', '/documents', '/service-periods', '/company-split', '/company-allocation', '/ifsun', '/soldiers',
  '/daily-movements', '/attendance', '/summary', '/counts', '/catalog', '/intake', '/naming', '/users',
  '/backups', '/devices',
].filter((r) => !ONLY || ONLY.split(',').includes(r));

/**
 * Dialogs and menus worth checking at phone width: [route, name, button text to click]. Each opens a
 * dialog (or the menu), measures it, takes a screenshot, and closes it. A button that is not on the
 * screen is skipped, not failed.
 */
const INTERACTIONS = [
  ['/issue', 'menu', 'תפריט'],
  ['/catalog', 'add-item', 'הוסף פריט'],
  ['/users', 'add-user', 'הוסף משתמש'],
  ['/soldiers', 'add-soldier', 'הוסף חייל'],
  ['/ifsun', 'new-ifsun', 'אפסון חדש'],
  ['/attendance', 'add-member', 'הוסף חבר צוות'],
  ['/attendance', 'send-week', 'שלח לסלאק'],
  ['/devices', 'devices', 'הוספת מכשיר'],
].filter(([r]) => !ONLY || ONLY.split(',').includes(r));

/**
 * Multi-step flows, where phone problems hide (a basket, a dialog, a signing step). Each step is
 * ['fill', placeholder, value] | ['click', buttonText] | ['clickCss', selector] | ['press', key] |
 * ['wait', ms] | ['shot', name] (measure + screenshot). A step that finds nothing is skipped and noted.
 * `{soldier}` in a value is replaced by the surname of a soldier who holds nothing.
 */
const FLOWS = [
  {
    name: 'issue-flow',
    route: '/issue',
    steps: [
      ['fill', 'חפש חייל לפי שם או מ.א.', '{soldier}'],
      ['click', 'חפש'],
      ['wait', 800],
      ['clickCss', 'ul button'],
      ['wait', 500],
      ['shot', 'confirm'],
      ['click', 'המשך'],
      ['wait', 600],
      ['shot', 'basket'],
      ['click', 'חפש פריט להוספה'],
      ['wait', 600],
      ['shot', 'picker'],
      ['clickCss', '[role=listbox] li'],
      ['wait', 300],
      ['shot', 'picker-selected'],
      ['click', 'הוסף 1 נבחרים'],
      ['wait', 700],
      ['shot', 'basket-with-item'],
      ['click', 'הוסף בכל זאת'],
      ['wait', 700],
      ['shot', 'basket-lines'],
    ],
  },
  {
    name: 'documents-detail',
    route: '/documents',
    steps: [['clickCss', 'tbody tr'], ['wait', 700], ['shot', 'items'], ['click', 'טופס חתום'], ['wait', 700], ['shot', 'form']],
  },
  { name: 'catalog-instances', route: '/catalog', steps: [['click', 'מסדים'], ['wait', 600], ['shot', 'instances']] },
  { name: 'catalog-edit', route: '/catalog', steps: [['click', 'עריכה'], ['wait', 500], ['shot', 'edit']] },
  { name: 'users-edit', route: '/users', steps: [['click', 'עריכה'], ['wait', 500], ['shot', 'edit']] },
  { name: 'users-log', route: '/users', steps: [['click', 'יומן אבטחה'], ['wait', 600], ['shot', 'log']] },
  { name: 'soldiers-edit', route: '/soldiers', steps: [['click', 'עריכה'], ['wait', 500], ['shot', 'edit']] },
  { name: 'ifsun-document', route: '/ifsun', steps: [['click', 'מסמך'], ['wait', 600], ['shot', 'document']] },
].filter((f) => !ONLY || ONLY.split(',').includes(f.route));

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Runs inside the page. */
function measure(deviceWidth) {
  // The device's real width, NOT the browser's layout width: a phone browser widens the layout viewport
  // to fit content that is too wide, which makes clientWidth look fine while the page is cropped.
  const vw = deviceWidth;
  const scrollerOf = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return p;
    }
    return null;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
  const sticking = [];
  const scrollAreas = [];
  const smallTargets = [];
  const zoomInputs = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.right > vw + 1 || r.left < -1) {
      const sc = scrollerOf(el);
      if (!sc) sticking.push({ el: label(el), text: (el.textContent || '').trim().slice(0, 30), left: Math.round(r.left), right: Math.round(r.right) });
    }
    const ox = cs.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      scrollAreas.push({ el: label(el), client: el.clientWidth, scroll: el.scrollWidth });
    }
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button') {
      if (el.tagName === 'INPUT' && ['checkbox', 'radio', 'hidden'].includes(el.type)) continue;
      if (r.height < 36) smallTargets.push({ el: label(el), text: (el.textContent || el.value || '').trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) });
    }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !['checkbox', 'radio', 'hidden', 'date'].includes(el.type) && parseFloat(cs.fontSize) < 16) {
      zoomInputs.push({ el: label(el), px: parseFloat(cs.fontSize) });
    }
  }
  const doc = document.documentElement;
  return {
    viewport: vw,
    layoutWidth: doc.clientWidth,
    pageScrollWidth: doc.scrollWidth,
    pageOverflow: Math.max(0, doc.scrollWidth - vw, doc.clientWidth - vw),
    sticking: sticking.slice(0, 10),
    stickingCount: sticking.length,
    scrollAreas: scrollAreas.slice(0, 6),
    smallTargets: smallTargets.slice(0, 6),
    smallTargetCount: smallTargets.length,
    zoomInputCount: zoomInputs.length,
  };
}

const browser =
  ENGINE === 'chromium'
    ? await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
    : await webkit.launch();
const report = [];
mkdirSync(OUT, { recursive: true });

for (const width of WIDTHS) {
  const context = await browser.newContext(
    ENGINE === 'chromium'
      ? { viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, locale: 'he-IL' }
      : { ...devices['iPhone 14 Pro Max'], viewport: { width, height: 900 }, locale: 'he-IL' },
  );
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: creds });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
  const page = await context.newPage();

  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    const result = await page.evaluate(measure, width);
    report.push({ route, width, ...result });
    if (SHOTS.includes(width)) {
      mkdirSync(join(OUT, String(width)), { recursive: true });
      // The first screens' worth is what a person sees; a whole 9000px catalogue is not readable.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({
        path: join(OUT, String(width), `${route.slice(1) || 'home'}.png`),
        clip: { x: 0, y: 0, width, height: Math.min(height, 2600) },
        fullPage: true,
      });
    }

    for (const [r, name, text] of INTERACTIONS.filter(([r]) => r === route)) {
      const target = page.getByRole('button', { name: text }).first();
      if (!(await target.isVisible().catch(() => false))) continue;
      await target.click().catch(() => {});
      await page.waitForTimeout(400);
      const opened = await page.evaluate(measure, width);
      report.push({ route: `${r} [${name}]`, width, ...opened });
      if (SHOTS.includes(width)) {
        await page.screenshot({ path: join(OUT, String(width), `${r.slice(1)}__${name}.png`) });
      }
      await page.keyboard.press('Escape').catch(() => {});
      // A dialog closes on its own cancel button; fall back to reloading to get a clean screen.
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // Flows. A soldier who holds nothing, so the issuing flow is not blocked by "already holds".
  // Enlisted too (מחויל), or the flow stops at the confirmation step.
  const free = await context.request.get(`${BASE}/api/soldiers?holding=without&take=200&sort=name`).then((r) => r.json()).catch(() => null);
  let chosen = (free?.rows ?? []).find((r) => r.isEnlisted);
  let restoreEnlistment = null;
  if (!chosen && free?.rows?.[0]) {
    // Enlist one for the run and put it back afterwards (local dev database only).
    chosen = free.rows[0];
    const r = await context.request.patch(`${BASE}/api/soldiers/${chosen.id}/enlistment`, { data: { enlisted: true } });
    if (r.ok()) restoreEnlistment = chosen.id;
  }
  const surname = chosen?.lastName ?? '';
  for (const flow of FLOWS) {
    await page.goto(`${BASE}${flow.route}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(400);
    const notes = [];
    for (const [act, a, b] of flow.steps) {
      try {
        if (act === 'fill') {
          const box = page.getByPlaceholder(a).first();
          if (await box.isVisible()) await box.fill(String(b).replace('{soldier}', surname));
          else notes.push(`no field "${a}"`);
        } else if (act === 'click') {
          const t = page.getByRole('button', { name: a }).first();
          if (await t.isVisible()) await t.click();
          else notes.push(`no button "${a}"`);
        } else if (act === 'clickCss') {
          const t = page.locator(a).first();
          if (await t.isVisible()) await t.click();
          else notes.push(`no element ${a}`);
        } else if (act === 'press') {
          await page.keyboard.press(a);
        } else if (act === 'wait') {
          await page.waitForTimeout(a);
        } else if (act === 'shot') {
          const m = await page.evaluate(measure, width);
          report.push({ route: `${flow.name} [${a}]`, width, ...m, notes });
          if (SHOTS.includes(width)) {
            mkdirSync(join(OUT, String(width)), { recursive: true });
            await page.screenshot({ path: join(OUT, String(width), `flow-${flow.name}__${a}.png`) });
          }
        }
      } catch (e) {
        notes.push(`${act} failed: ${String(e.message).split('\n')[0]}`);
      }
    }
    if (notes.length) console.log(`  note ${flow.name} @${width}: ${notes.join('; ')}`);
  }
  if (restoreEnlistment) await context.request.patch(`${BASE}/api/soldiers/${restoreEnlistment}/enlistment`, { data: { enlisted: false } });
  await context.close();
}
await browser.close();

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

// Summary: per route, the worst page overflow across widths.
const byRoute = new Map();
for (const r of report) {
  const cur = byRoute.get(r.route) ?? { worst: 0, worstWidth: 0, widths: [], sticking: [], areas: new Set(), small: 0, zoom: 0 };
  if (r.pageOverflow > cur.worst) { cur.worst = r.pageOverflow; cur.worstWidth = r.width; cur.sticking = r.sticking; }
  if (r.pageOverflow > 0) cur.widths.push(r.width);
  r.scrollAreas.forEach((a) => cur.areas.add(a.el));
  cur.small = Math.max(cur.small, r.smallTargetCount);
  cur.zoom = Math.max(cur.zoom, r.zoomInputCount);
  byRoute.set(r.route, cur);
}
let failing = 0;
for (const [route, v] of byRoute) {
  const bad = v.worst > 0 || v.areas.size > 0;
  if (bad) failing += 1;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${route.padEnd(22)} page-overflow=${String(v.worst).padStart(4)}px${v.worst ? ` @${v.worstWidth} (widths: ${v.widths.join(',')})` : ''}  inner-scroll=${v.areas.size}  small-targets=${v.small}  zoom-inputs=${v.zoom}`);
  if (v.worst > 0) v.sticking.slice(0, 4).forEach((s) => console.log(`       sticks out: ${s.el} "${s.text}" [${s.left}..${s.right}]`));
  if (v.areas.size) console.log(`       scroll areas: ${[...v.areas].join(' | ')}`);
}
console.log(`\n${failing} of ${byRoute.size} screens still scroll or overflow sideways at some phone width.`);
process.exitCode = failing ? 1 : 0;
