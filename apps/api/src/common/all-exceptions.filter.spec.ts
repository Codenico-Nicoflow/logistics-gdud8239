import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown): { status: number; body: Record<string, unknown> } {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const response = {
    status: (code: number) => {
      out.status = code;
      return {
        json: (body: Record<string, unknown>) => {
          out.body = body;
        },
      };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return out;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`secret SQL detail for table "users" ${code}`, { code, clientVersion: 'test' });

describe('AllExceptionsFilter', () => {
  it('passes deliberate HTTP errors through unchanged', () => {
    const out = run(new BadRequestException('שגיאת קלט'));
    expect(out.status).toBe(400);
    expect(JSON.stringify(out.body)).toContain('שגיאת קלט');
  });

  it('maps the Prisma errors a user can cause, without leaking their text', () => {
    expect(run(prismaError('P2002')).status).toBe(HttpStatus.CONFLICT);
    expect(run(prismaError('P2025')).status).toBe(HttpStatus.NOT_FOUND);
    expect(run(prismaError('P2003')).status).toBe(HttpStatus.CONFLICT);
    expect(JSON.stringify(run(prismaError('P2002')).body)).not.toContain('secret SQL');
  });

  it('turns anything else into a generic 500 with no stack, SQL or table name', () => {
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const out = run(new Error('relation "users" does not exist at /srv/app/dist/x.js:1'));
    spy.mockRestore();
    expect(out.status).toBe(500);
    const text = JSON.stringify(out.body);
    expect(text).not.toContain('users');
    expect(text).not.toContain('/srv/app');
  });

  it('also treats an unmapped Prisma code as a plain 500', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(run(prismaError('P2999')).status).toBe(500);
  });
});
