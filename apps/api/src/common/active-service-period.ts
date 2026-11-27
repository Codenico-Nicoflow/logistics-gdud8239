import type { PrismaClient, ServicePeriod } from '@prisma/client';
import { israelToday } from './israel-date';

/**
 * The service period that actually governs weapon issue right now — not
 * just any row marked ACTIVE, but one whose own date range covers today.
 * A samgad can plan a future תעסוקה and mark it ACTIVE ahead of time (so
 * company commanders can start allocating against it), but a weapon must
 * not go out for it before the תעסוקה itself has actually started, or
 * after it's over, even though the row's status hasn't been flipped to
 * CLOSED yet. `startsAt`/`endsAt` are stored as dates (no time component),
 * so this compares against today's own date, not the current instant.
 *
 * Only used for the weapon-issue gate — the planning screens
 * (AllocationsService) deliberately keep asking for "the ACTIVE period"
 * without this extra check, since planning for a תעסוקה is meant to start
 * before it's actually underway.
 */
/**
 * A stored date-only value as a comparable day number, read as the calendar date it holds (a `@db.Date` arrives as
 * midnight UTC, so its UTC fields are the date; a period's `startsAt` can also carry a time of day, which is dropped).
 */
function dayOf(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function findOperationalServicePeriod(
  prisma: Pick<PrismaClient, 'servicePeriod'>,
): Promise<ServicePeriod | null> {
  // Today in Israel: on a UTC server `new Date()` is still yesterday until 02:00-03:00, which kept a period that
  // starts today shut, and one that ended yesterday open, during those hours.
  const [y, m, d] = israelToday().split('-').map(Number) as [number, number, number];
  const today = Date.UTC(y, m - 1, d);

  const candidates = await prisma.servicePeriod.findMany({ where: { status: 'ACTIVE' } });
  return (
    candidates.find((p) => dayOf(p.startsAt) <= today && today <= dayOf(p.endsAt)) ?? null
  );
}
