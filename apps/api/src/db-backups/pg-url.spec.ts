import { describe, expect, it } from 'vitest';
import { forPgDump } from './pg-url';

describe('forPgDump', () => {
  it('turns node-pg sslmode=no-verify into require, which libpq understands', () => {
    const { url } = forPgDump('postgresql://u:p@host:5432/db?sslmode=no-verify');
    expect(new URL(url).searchParams.get('sslmode')).toBe('require');
  });

  it('leaves valid libpq sslmodes alone', () => {
    for (const mode of ['disable', 'prefer', 'require', 'verify-full']) {
      const { url } = forPgDump(`postgresql://u:p@host/db?sslmode=${mode}`);
      expect(new URL(url).searchParams.get('sslmode')).toBe(mode);
    }
  });

  it('moves Prisma\'s schema parameter out of the URL', () => {
    const { url, schema } = forPgDump('postgresql://u:p@host/db?schema=app&sslmode=no-verify');
    expect(schema).toBe('app');
    expect(new URL(url).searchParams.has('schema')).toBe(false);
  });

  it('defaults to public and adds no sslmode when none was given', () => {
    const { url, schema } = forPgDump('postgresql://u:p@localhost:5433/db');
    expect(schema).toBe('public');
    expect(new URL(url).searchParams.has('sslmode')).toBe(false);
  });
});
