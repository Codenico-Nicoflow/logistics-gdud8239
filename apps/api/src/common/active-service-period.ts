import type { PrismaClient, ServicePeriod } from '@prisma/client';

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
/** Midnight-normalized date, for comparing against a stored date-only column —
 *  dropping the time-of-day on both sides, not just one, since a period's
 *  own `startsAt` can carry a non-midnight time (e.g. `new Date()` at
 *  creation) and comparing that directly against a zeroed "today" would
 *  wrongly exclude a period that starts later the same day. */
function dateOnly(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export async function findOperationalServicePeriod(
  prisma: Pick<PrismaClient, 'servicePeriod'>,
): Promise<ServicePeriod | null> {
  const today = dateOnly(new Date());

  const candidates = await prisma.servicePeriod.findMany({ where: { status: 'ACTIVE' } });
  return (
    candidates.find((p) => dateOnly(p.startsAt) <= today && today <= dateOnly(p.endsAt)) ?? null
  );
}
