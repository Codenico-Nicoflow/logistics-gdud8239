import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { normalizeOrigin, originCheck } from './origin-check.middleware';

const ALLOWED = 'https://app.example';

function run(method: string, origin?: string): { status: number | null; next: boolean } {
  const result = { status: null as number | null, next: false };
  const response = {
    status: (code: number) => {
      result.status = code;
      return { json: vi.fn() };
    },
  } as unknown as Response;
  originCheck(ALLOWED)(
    { method, headers: origin ? { origin } : {} } as unknown as Request,
    response,
    (() => {
      result.next = true;
    }) as NextFunction,
  );
  return result;
}

describe('normalizeOrigin', () => {
  it('drops a trailing slash and any path, keeps scheme, host and port', () => {
    expect(normalizeOrigin('https://app.example/')).toBe('https://app.example');
    expect(normalizeOrigin('https://app.example/some/path')).toBe('https://app.example');
    expect(normalizeOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
  });
});

describe('originCheck', () => {
  it('accepts the real origin even when the configured one has a trailing slash', () => {
    const result = { status: null as number | null, next: false };
    originCheck('https://app.example/')(
      { method: 'POST', headers: { origin: 'https://app.example' } } as unknown as Request,
      { status: () => ({ json: vi.fn() }) } as unknown as Response,
      (() => {
        result.next = true;
      }) as NextFunction,
    );
    expect(result.next).toBe(true);
  });

  it('blocks a state-changing request from another site', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(run(method, 'https://evil.example')).toEqual({ status: 403, next: false });
    }
  });

  it('lets the real origin through', () => {
    expect(run('POST', ALLOWED)).toEqual({ status: null, next: true });
  });

  it('does not touch reads, whatever the origin', () => {
    expect(run('GET', 'https://evil.example').next).toBe(true);
  });

  it('leaves requests with no Origin header alone (curl, server-to-server)', () => {
    expect(run('POST').next).toBe(true);
  });
});
