import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@h/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};
const prod = { ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example', COOKIE_SECURE: 'true' };

describe('validateEnv in production', () => {
  it('accepts a complete production config', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => validateEnv(prod)).not.toThrow();
  });

  it('refuses to boot without WEB_ORIGIN', () => {
    expect(() => validateEnv({ ...prod, WEB_ORIGIN: undefined })).toThrow(/WEB_ORIGIN/);
  });

  it('refuses a WEB_ORIGIN that is not an address', () => {
    expect(() => validateEnv({ ...prod, WEB_ORIGIN: 'logistics' })).toThrow(/full address/);
  });

  it('refuses to boot unless cookies are Secure', () => {
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: undefined })).toThrow(/COOKIE_SECURE/);
  });

  it('treats a Render deploy as production even when NODE_ENV was forgotten', () => {
    expect(() => validateEnv({ ...base, RENDER: 'true' })).toThrow(/WEB_ORIGIN/);
    expect(() => validateEnv({ ...prod, NODE_ENV: undefined, RENDER: 'true', DISABLE_RATE_LIMIT: 'true' })).toThrow(
      /DISABLE_RATE_LIMIT/,
    );
  });

  it('warns, without failing, when the proxy hop count is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    validateEnv(prod);
    expect(warn.mock.calls.flat().join(' ')).toContain('TRUST_PROXY_HOPS');
  });

  it('does not impose those rules in development', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });
});
