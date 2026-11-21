import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Cancelling a closed count: log who/why, drop the figures it had frozen and
 * clear both signatures (they signed numbers that are about to change). Shared
 * by the admin's "בטל סגירה" and by a מסכם correction after a signed count, so
 * the two can never reopen differently.
 */
export function reopenOps(
  prisma: PrismaService,
  sessionId: string,
  userId: string,
  reason: string,
): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.countSessionReopen.create({
      data: { countSessionId: sessionId, reopenedByUserId: userId, reason },
    }),
    prisma.countSessionFigure.deleteMany({ where: { countSessionId: sessionId } }),
    prisma.countSession.update({
      where: { id: sessionId },
      data: { isClosed: false, responsibleSignatureImage: null, officerSignatureImage: null },
    }),
  ];
}
