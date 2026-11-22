/**
 * API authorization + hostile-input probe against a RUNNING local API (default http://localhost:3000).
 *
 *   node e2e/api-probe.mjs --creds creds.json
 *
 * 1. Every route is called as every role; the status must match the role table below (403 when not allowed,
 *    never a 2xx for the wrong role, never a 5xx for anyone).
 * 2. Hostile bodies/queries (wrong types, huge strings, injection text, negative numbers, bad ids) are sent to
 *    the write routes as an allowed role; the answer must be 4xx, never a 5xx and never a stack trace.
 *
 * Creates nothing it does not have to: mutating calls use invalid bodies, so the answer is a refusal.
 */
import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:3000');
const ORIGIN = arg('origin', 'http://localhost:5173');
const creds = JSON.parse(readFileSync(arg('creds'), 'utf8'));
const ROLES = ['admin', 'logistics', 'viewer', 'SHLISHUT', 'SAMGAD', 'COMPANY_CMDR'];
const ALL = ROLES;
const UUID = '00000000-0000-4000-8000-000000000000';

async function login(role) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds[role]),
  });
  if (res.status !== 200) throw new Error(`login ${role} -> ${res.status}`);
  const body = await res.json();
  if (!body.user) throw new Error(`login ${role}: second step required (${body.step}); turn it off locally`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

// [method, path, roles allowed]. GET routes with no decorator are open to any signed-in role.
const MATRIX = [
  ['GET', '/api/auth/me', ALL],
  ['GET', '/api/auth/mfa', ALL],
  ['GET', '/api/auth/mfa/overview', ['admin']],
  ['GET', '/api/users', ['admin']],
  ['GET', `/api/users/${UUID}/security-events`, ['admin']],
  ['GET', '/api/permissions', ['admin']],
  ['GET', '/api/db-backups', ['admin']],
  ['GET', '/api/snapshots', ['admin']],
  ['GET', '/api/excel/export?x=1', ['admin', 'logistics']],
  ['GET', '/api/counts/recent', ['admin', 'logistics']],
  ['GET', '/api/counts/sheet?shift=EVENING', ['admin', 'logistics']],
  ['GET', '/api/attendance/week', ['admin', 'logistics']],
  ['GET', '/api/attendance/members', ['admin', 'logistics']],
  ['GET', '/api/ifsun', ['admin', 'logistics']],
  ['GET', '/api/mesakem/sheet', ['admin', 'logistics']],
  ['GET', '/api/reports/summary', ['admin', 'logistics']],
  ['GET', '/api/reports/companies', ['admin', 'logistics', 'viewer', 'SAMGAD']],
  ['GET', '/api/movements', ['admin', 'logistics', 'viewer']],
  ['GET', '/api/movements/export/daily', ['admin', 'logistics']],
  ['GET', '/api/signatures', ['admin', 'logistics', 'viewer']],
  ['GET', '/api/signatures/holders', ['admin', 'logistics', 'viewer']],
  ['GET', '/api/issue-forms', ['admin', 'logistics', 'viewer']],
  ['GET', '/api/items', ALL],
  ['GET', '/api/soldiers', ALL],
  ['GET', '/api/service-periods', ALL],
  ['GET', '/api/service-periods/active', ALL],
  ['POST', '/api/users', ['admin'], {}],
  ['POST', '/api/intake', ['admin'], {}],
  ['POST', '/api/items', ['admin'], {}],
  ['POST', '/api/soldiers', ['admin', 'logistics', 'SHLISHUT'], {}],
  ['POST', '/api/signatures/issue', ['admin', 'logistics'], {}],
  ['POST', '/api/issue-forms', ['admin', 'logistics'], {}],
  ['POST', '/api/counts', ['admin', 'logistics'], {}],
  ['POST', '/api/ifsun', ['admin', 'logistics'], {}],
  ['POST', '/api/attendance/cells', ['admin'], {}],
  ['POST', '/api/attendance/members', ['admin'], {}],
  // POST /api/attendance/send-week is deliberately NOT here: as an allowed role it really posts to Slack.
  ['POST', '/api/mesakem', ['admin', 'logistics'], {}],
  ['POST', '/api/service-periods', ['admin'], {}],
  ['POST', '/api/permissions', ['admin'], {}],
  ['DELETE', `/api/users/${UUID}`, ['admin']],
  ['DELETE', `/api/items/${UUID}`, ['admin']],
  ['DELETE', `/api/counts/${UUID}`, ['admin'], { reason: 'abc' }],
  ['PATCH', `/api/items/instances/${UUID}/status`, ['admin', 'logistics'], {}],
  ['PUT', '/api/auth/mfa/enforcement', ['admin'], {}],
];

const findings = [];
const note = (sev, msg) => { findings.push(`${sev}: ${msg}`); console.log(`  ${sev} ${msg}`); };

async function call(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const jars = {};
for (const r of ROLES) jars[r] = await login(r);

console.log('== authorization matrix ==');
let checks = 0;
for (const [method, path, allowed, body] of MATRIX) {
  for (const role of ROLES) {
    const { status, text } = await call(jars[role], method, path, body);
    checks++;
    const ok = allowed.includes(role);
    if (status >= 500) note('BUG', `${role} ${method} ${path} -> ${status} ${text.slice(0, 120)}`);
    else if (!ok && status !== 403) note('BUG', `${role} ${method} ${path} should be 403, got ${status}`);
    else if (ok && (status === 401 || status === 403)) note('BUG', `${role} ${method} ${path} should be allowed, got ${status}`);
  }
}
console.log(`${checks} role/route checks`);

console.log('== no cookie at all ==');
for (const [method, path] of MATRIX) {
  const { status } = await call('', method, path, method === 'GET' ? undefined : {});
  checks++;
  if (status !== 401) note('BUG', `anonymous ${method} ${path} -> ${status} (expected 401)`);
}

console.log('== hostile input as an allowed role ==');
const HUGE = 'x'.repeat(200_000);
const HOSTILE = [
  ['POST', '/api/soldiers', 'logistics', [
    { firstName: HUGE, lastName: 'a', company: 'A' },
    { firstName: 'a', lastName: 'b', company: 'Z' },
    { firstName: { $ne: null }, lastName: 'b', company: 'A' },
    { firstName: 'a', lastName: 'b', company: 'A', personalNumber: "1'; DROP TABLE soldiers;--" },
    { firstName: ['a'], lastName: 'b', company: 'A' },
    { firstName: 'a', lastName: 'b', company: 'A', extra: 1 },
    [],
    'not json',
    null,
  ]],
  ['POST', '/api/items', 'admin', [
    { name: 'x', category: 'WEAPON', authorizedQty: -5 },
    { name: 'x', category: 'WEAPON', authorizedQty: 1e15 },
    { name: 'x', category: 'WEAPON', authorizedQty: 1.5 },
    { name: 'x', category: 'WEAPON', authorizedQty: '5; DROP' },
    { name: '', category: 'WEAPON' },
    { name: 'x', category: 'NOPE' },
    { name: HUGE, category: 'WEAPON' },
  ]],
  ['POST', '/api/users', 'admin', [
    { username: 'a', displayName: 'b', role: 'god' },
    { username: HUGE, displayName: 'b', role: 'viewer' },
    { username: 'a b', displayName: 'b', role: 'viewer' },
    { username: 'tmp_e2e_admin', displayName: 'dup', role: 'viewer' },
    { username: 'x1', displayName: 'b', role: 'COMPANY_CMDR' },
  ]],
  ['POST', '/api/signatures/issue', 'logistics', [
    { soldierId: 'nope', itemId: 'nope', quantity: 1 },
    { soldierId: UUID, itemId: UUID, quantity: -1 },
    { soldierId: UUID, itemId: UUID, quantity: 0 },
    { soldierId: UUID, itemId: UUID, quantity: 1e9 },
    { soldierId: UUID, itemId: UUID, quantity: 1, serial: HUGE },
  ]],
  ['POST', '/api/issue-forms', 'logistics', [
    { soldierId: UUID, lines: [], signatureImage: 'x' },
    { soldierId: UUID, lines: Array.from({ length: 5000 }, () => ({ itemId: UUID, quantity: 1 })), signatureImage: 'x' },
    { soldierId: UUID, lines: [{ itemId: UUID, quantity: 1 }], signatureImage: 'data:image/png;base64,' + 'A'.repeat(900_000) },
    { soldierId: UUID, lines: [{ itemId: UUID, quantity: 1 }], signatureImage: '<script>alert(1)</script>' },
  ]],
  ['POST', '/api/counts', 'logistics', [
    { shift: 'EVENING', date: 'not-a-date', lines: [] },
    { shift: 'NOON', date: '2026-01-01', lines: [] },
    { shift: 'EVENING', date: '2026-01-01', lines: [{ itemId: UUID, nashkiyaQty: -3 }] },
    { shift: 'EVENING', date: '2026-01-01', lines: [], responsibleSignatureImage: '<img src=x onerror=1>' },
  ]],
  ['POST', '/api/attendance/cells', 'admin', [
    { teamMemberId: UUID, date: '2026-01-01', status: 'XX' },
    { teamMemberId: 'bad', date: 'bad', status: 'PRESENT' },
    { teamMemberId: UUID, date: '2026-01-01', status: 'OTHER', note: HUGE },
  ]],
  ['POST', '/api/service-periods', 'admin', [
    { name: 'x', startsAt: '2026-05-01', endsAt: '2026-04-01' },
    { name: '', startsAt: 'x', endsAt: 'y' },
    { name: HUGE, startsAt: '2026-01-01', endsAt: '2026-02-01' },
  ]],
  ['POST', '/api/mesakem', 'logistics', [
    { date: 'x', lines: [] },
    { date: '2026-01-01', lines: [{ itemId: UUID, nashkiyaQty: -1 }] },
  ]],
  ['POST', '/api/ifsun', 'logistics', [
    { signatureId: UUID, quantity: -4 },
    {},
  ]],
  ['PATCH', `/api/items/instances/${UUID}/status`, 'logistics', [
    { status: 'EXPLODED' },
    { status: 'OK', notes: HUGE },
  ]],
];
const QUERIES = [
  ['logistics', '/api/soldiers?take=-1'],
  ['logistics', '/api/soldiers?take=999999999'],
  ['logistics', '/api/soldiers?take=abc'],
  ['logistics', '/api/soldiers?company=ZZ'],
  ['logistics', `/api/soldiers?q=${encodeURIComponent("' OR 1=1 --")}`],
  ['logistics', `/api/soldiers?q=${encodeURIComponent('%')}`],
  ['logistics', `/api/soldiers?q=${encodeURIComponent('x'.repeat(5000))}`],
  ['logistics', '/api/soldiers?sort=; drop table'],
  ['logistics', '/api/soldiers?skip=-5'],
  ['logistics', '/api/movements?take=-1'],
  ['logistics', '/api/movements?take=100000'],
  ['logistics', '/api/movements?action=NOPE'],
  ['logistics', '/api/movements?from=garbage&to=garbage'],
  ['logistics', '/api/signatures?take=-9'],
  ['logistics', '/api/signatures/holders?q=%00'],
  ['logistics', '/api/items?q=%27%20OR%201%3D1'],
  ['logistics', '/api/items/not-a-uuid'],
  ['logistics', `/api/items/${UUID}`],
  ['logistics', '/api/soldiers/not-a-uuid'],
  ['logistics', `/api/soldiers/${UUID}`],
  ['logistics', '/api/attendance/week?date=garbage'],
  ['logistics', '/api/counts/sheet?shift=NOON'],
  ['logistics', '/api/counts/sheet?shift=EVENING&date=9999-99-99'],
  ['logistics', '/api/mesakem/sheet?date=garbage'],
  ['logistics', '/api/issue-forms/not-a-uuid'],
  ['logistics', '/api/issue-forms?take=-1'],
  ['logistics', '/api/ifsun?status=NOPE'],
  ['admin', '/api/users/not-a-uuid/security-events'],
  ['admin', `/api/users/${UUID}/security-events?take=100000`],
  ['logistics', '/api/service-periods/not-a-uuid/company-allocations'],
  ['logistics', '/api/issue-bundle?itemName=' + 'x'.repeat(5000)],
];

for (const [method, path, role, bodies] of HOSTILE) {
  for (const body of bodies) {
    const { status, text } = await call(jars[role], method, path, body);
    checks++;
    const label = typeof body === 'string' ? body : JSON.stringify(body)?.slice(0, 70);
    if (status >= 500) note('BUG', `${method} ${path} body ${label} -> ${status} ${text.slice(0, 100)}`);
    else if (status < 400) note('BUG', `${method} ${path} ACCEPTED hostile body ${label} -> ${status}`);
    if (/at \S+ \(|node_modules|prisma|SELECT |\.ts:\d+/i.test(text)) note('LEAK', `${method} ${path} body ${label} leaks internals: ${text.slice(0, 160)}`);
  }
}
for (const [role, path] of QUERIES) {
  const { status, text } = await call(jars[role], 'GET', path);
  checks++;
  if (status >= 500) note('BUG', `GET ${path.slice(0, 90)} -> ${status} ${text.slice(0, 100)}`);
  if (/at \S+ \(|node_modules|SELECT |\.ts:\d+/i.test(text)) note('LEAK', `GET ${path.slice(0, 90)} leaks internals`);
}

console.log('== body size / content type ==');
for (const [label, cookie, body, ct] of [
  ['2 MB JSON', jars.logistics, JSON.stringify({ firstName: 'x'.repeat(2_000_000) }), 'application/json'],
  ['malformed JSON', jars.logistics, '{"firstName":', 'application/json'],
  ['form-encoded', jars.logistics, 'firstName=a&lastName=b&company=A', 'application/x-www-form-urlencoded'],
  ['text/plain', jars.logistics, 'hello', 'text/plain'],
]) {
  const res = await fetch(`${BASE}/api/soldiers`, { method: 'POST', headers: { cookie, 'content-type': ct }, body });
  const text = await res.text(); checks++;
  console.log(`  ${label} -> ${res.status}`);
  if (res.status >= 500) note('BUG', `${label} -> ${res.status} ${text.slice(0, 100)}`);
}

console.log('== CSRF / origin ==');
{
  const res = await fetch(`${BASE}/api/soldiers/check-duplicates`, {
    method: 'POST', headers: { cookie: jars.logistics, 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ firstName: 'a', lastName: 'b' }),
  });
  console.log(`  POST from foreign Origin with a valid cookie -> ${res.status}`);
  if (res.status < 400) note('RISK', `state-changing POST accepted from Origin https://evil.example (${res.status}); relies on SameSite cookies only`);
}

console.log('== headers ==');
{
  const res = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: jars.admin } });
  for (const h of ['x-powered-by']) if (res.headers.get(h)) note('RISK', `header ${h} present: ${res.headers.get(h)}`);
  for (const h of ['x-content-type-options', 'strict-transport-security', 'referrer-policy']) if (!res.headers.get(h)) note('RISK', `header ${h} missing on API`);
  const cors = await fetch(`${BASE}/api/auth/me`, { headers: { origin: 'https://evil.example', cookie: jars.admin } });
  if (cors.headers.get('access-control-allow-origin') === 'https://evil.example' || cors.headers.get('access-control-allow-origin') === '*') note('BUG', `CORS reflects evil origin: ${cors.headers.get('access-control-allow-origin')}`);
}

console.log(`\n${checks} checks, ${findings.length} findings`);
for (const f of findings) console.log(' -', f);
process.exit(findings.some((f) => f.startsWith('BUG') || f.startsWith('LEAK')) ? 1 : 0);
