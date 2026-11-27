import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient, ServicePeriod } from '@prisma/client';
import { findOperationalServicePeriod } from './active-service-period';

const period = (startsAt: string, endsAt: string): ServicePeriod =>
  ({ id: 'p', name: 'x', status: 'ACTIVE', startsAt: new Date(startsAt), endsAt: new Date(endsAt) }) as ServicePeriod;

const prismaWith = (p: ServicePeriod): Pick<PrismaClient, 'servicePeriod'> =>
  ({ servicePeriod: { findMany: async () => [p] } }) as unknown as Pick<PrismaClient, 'servicePeriod'>;

afterEach(() => vi.useRealTimers());

describe('findOperationalServicePeriod', () => {
  it("counts a period that starts today in Israel as running right after Israel's midnight, though the server (UTC) is still on yesterday", async () => {
    // 22:30 UTC on the 27th is 00:30 on the 28th in Israel.
    vi.useFakeTimers({ now: new Date('2026-11-27T22:30:00Z') });
    expect(await findOperationalServicePeriod(prismaWith(period('2026-11-28', '2026-12-05')))).not.toBeNull();
  });

  it('counts a period that ended yesterday in Israel as over, though UTC still calls it today', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-27T22:30:00Z') });
    expect(await findOperationalServicePeriod(prismaWith(period('2026-11-20', '2026-11-27')))).toBeNull();
  });

  it('includes both the first and the last day', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-28T09:00:00Z') });
    expect(await findOperationalServicePeriod(prismaWith(period('2026-11-28', '2026-11-28')))).not.toBeNull();
  });
});
