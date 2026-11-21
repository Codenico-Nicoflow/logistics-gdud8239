import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { originCheck } from './origin-check.middleware';

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

describe('originCheck', () => {
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
