import { readFileSync } from 'node:fs';
export async function api(credsFile, role = 'admin', base = 'http://localhost:3100') {
  const c = JSON.parse(readFileSync(credsFile));
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c[role]) });
  const ck = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
  return async (method, path, body) => {
    const x = await fetch(base + '/api' + path, { method, headers: { cookie: ck, 'content-type': 'application/json', origin: 'http://localhost:5174' }, body: body && JSON.stringify(body) });
    const t = await x.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: x.status, body: j };
  };
}
