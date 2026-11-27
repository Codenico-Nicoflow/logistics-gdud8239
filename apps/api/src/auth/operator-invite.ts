import type { PrismaClient } from '@prisma/client';
import { normalizeOrigin } from '../common/origin-check.middleware';
import { INVITE_TTL_MS, newInviteToken } from './invite-token';

/**
 * Break-glass, for the operator who holds the database credentials: issues a setup link when no admin
 * can sign in to press "קישור הגדרה חדש" (every phone lost, or the authenticator step switched on
 * before anyone set it up). It does what the button does — ends the person's sessions, blocks the old password until
 * the link is used, cancels older links and logs the event — without the admin-only checks.
 *
 * Plain Prisma on purpose: the script runs under `tsx`, which cannot do the framework's dependency
 * injection (the same reason the seed script talks to Prisma directly).
 */
export async function issueOperatorLink(
  prisma: PrismaClient,
  username: string,
  webOrigin: string,
): Promise<{ url: string; expiresAt: Date }> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`המשתמש ${username} אינו קיים`);

  const { token, tokenHash } = newInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { mustSetup: true, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null, isActive: true },
    }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.userInvite.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
    prisma.userInvite.create({
      data: { userId: user.id, tokenHash, kind: user.passwordHash ? 'RESET' : 'INVITE', expiresAt },
    }),
    prisma.securityEvent.create({ data: { type: 'INVITE_CREATED', userId: user.id, detail: 'operator', battalionId: user.battalionId } }),
  ]);
  return { url: `${normalizeOrigin(webOrigin)}/setup/${token}`, expiresAt };
}
