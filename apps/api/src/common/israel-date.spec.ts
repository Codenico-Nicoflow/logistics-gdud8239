import { describe, expect, it } from 'vitest';
import { israelDayEnd, israelDayStart, israelToday } from './israel-date';

describe('israelToday', () => {
  it('is still the same Israeli day at 23:30 and rolls over at midnight (winter, UTC+2)', () => {
    expect(israelToday(new Date('2026-11-20T21:30:00Z'))).toBe('2026-11-20');
    expect(israelToday(new Date('2026-11-20T22:30:00Z'))).toBe('2026-11-21');
  });

  it('rolls over an hour earlier in UTC during daylight saving (UTC+3)', () => {
    expect(israelToday(new Date('2026-07-20T20:30:00Z'))).toBe('2026-07-20');
    expect(israelToday(new Date('2026-07-20T21:30:00Z'))).toBe('2026-07-21');
  });
});

describe('israelDayStart / israelDayEnd', () => {
  it('uses UTC+2 in winter', () => {
    expect(israelDayStart('2026-11-21').toISOString()).toBe('2026-11-20T22:00:00.000Z');
    expect(israelDayEnd('2026-11-21').toISOString()).toBe('2026-11-21T21:59:59.999Z');
  });

  it('uses UTC+3 in summer', () => {
    expect(israelDayStart('2026-07-21').toISOString()).toBe('2026-07-20T21:00:00.000Z');
    expect(israelDayEnd('2026-07-21').toISOString()).toBe('2026-07-21T20:59:59.999Z');
  });

  it('handles the 25-hour day when daylight saving ends (25.10.2026)', () => {
    expect(israelDayStart('2026-10-25').toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(israelDayEnd('2026-10-25').toISOString()).toBe('2026-10-25T21:59:59.999Z');
  });

  it('a single day covers an event at 00:30 and at 23:30 Israel time', () => {
    const start = israelDayStart('2026-11-21').getTime();
    const end = israelDayEnd('2026-11-21').getTime();
    const at = (iso: string) => new Date(iso).getTime();
    expect(at('2026-11-20T22:30:00Z')).toBeGreaterThanOrEqual(start); // 00:30 on the 21st
    expect(at('2026-11-21T21:30:00Z')).toBeLessThanOrEqual(end); // 23:30 on the 21st
    expect(at('2026-11-21T22:30:00Z')).toBeGreaterThan(end); // 00:30 on the 22nd
  });
});
