/**
 * Draws the home-screen icon (the platform medallion: three chevrons and no battalion number, since one install
 * serves every battalion; same geometry as src/components/Logo.tsx), struck on a
 * dark field with a ring of tick marks like a dial) and renders the PNG sizes the manifest and iOS need.
 *
 *   node scripts/make-icons.mjs        (CHROME_PATH overrides the browser used to rasterise)
 *
 * Everything that matters sits inside the central 80% circle, so the same artwork is safe as a "maskable"
 * icon (Android crops it to a circle, squircle or square) and iOS gets a full-bleed square it rounds itself.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(join(root, 'icons'), { recursive: true });
const EXE =
  process.env.CHROME_PATH ??
  join(homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const FIELD_BRIGHT = '#3d8a6b';
const FIELD_DARK = '#1f4a39';
const BRASS = '#8a6a16';
const BRASS_BRIGHT = '#c29b2e';

function ticks() {
  const out = [];
  for (let i = 0; i < 72; i++) {
    const major = i % 6 === 0;
    const a = (i / 72) * Math.PI * 2;
    const r1 = major ? 176 : 183;
    const r2 = 194;
    const x1 = 256 + Math.sin(a) * r1;
    const y1 = 256 - Math.cos(a) * r1;
    const x2 = 256 + Math.sin(a) * r2;
    const y2 = 256 - Math.cos(a) * r2;
    out.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${BRASS_BRIGHT}" stroke-width="${major ? 3.2 : 1.8}" stroke-linecap="round" opacity="${major ? 0.85 : 0.45}"/>`);
  }
  return out.join('');
}

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="75%"><stop offset="0%" stop-color="#27403f"/><stop offset="100%" stop-color="#0e1713"/></radialGradient>
    <radialGradient id="disc" cx="35%" cy="28%" r="85%"><stop offset="0%" stop-color="${FIELD_BRIGHT}"/><stop offset="100%" stop-color="${FIELD_DARK}"/></radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f3d98a"/><stop offset="45%" stop-color="${BRASS_BRIGHT}"/><stop offset="100%" stop-color="${BRASS}"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity="0.22"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="medal"><circle cx="22" cy="22" r="21"/></clipPath>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="0.55"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="199" fill="none" stroke="${BRASS_BRIGHT}" stroke-width="1.5" opacity="0.4"/>
  <circle cx="256" cy="256" r="171" fill="none" stroke="${BRASS_BRIGHT}" stroke-width="1" opacity="0.25"/>
  ${ticks()}
  <g transform="translate(256 256) scale(6.9) translate(-22 -22)" filter="url(#drop)">
    <circle cx="22" cy="22" r="21" fill="url(#ring)"/>
    <circle cx="22" cy="22" r="18.6" fill="url(#disc)" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
    <circle cx="22" cy="22" r="16" fill="none" stroke="${BRASS_BRIGHT}" stroke-width="0.6" opacity="0.45"/>
    <g fill="none" stroke="${BRASS_BRIGHT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 30L22 24.5L30 30"/>
      <path d="M14 24L22 18.5L30 24"/>
      <path d="M14 18L22 12.5L30 18"/>
    </g>
    <g clip-path="url(#medal)"><g transform="skewX(-18)"><rect x="4" y="-4" width="14" height="52" fill="url(#gloss)"/></g></g>
  </g>
</svg>`;

const art = svg;

writeFileSync(join(root, 'icon.svg'), art(512));

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const jobs = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/icon-maskable-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
  ['icons/favicon-48.png', 48],
];
for (const [file, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><head><style>@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@800&display=swap');html,body{margin:0;background:#0e1713}</style></head><body>${art(size)}</body></html>`,
    { waitUntil: 'networkidle' },
  ).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.screenshot({ path: join(root, file), omitBackground: false });
  console.log('wrote', file);
}
await browser.close();
