import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { BCRYPT_ROUNDS } from './auth.constants';
import { checkPassword } from './password-policy';
import type { AuthUser } from './auth.types';

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export type InviteKind = 'INVITE' | 'RESET';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
/** One answer for "no such link", "already used" and "expired": it must not say which. */
const INVALID_LINK = 'הקישור אינו תקף או שפג תוקפו';

/**
 * One-time setup links. An admin never sees or chooses anybody's password: he hands over a link,
 * and the person opens it and chooses their own. The link carries 256 random bits and only its hash
 * is stored, so a database copy (a backup, a leaked dump) holds nothing that can be opened.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  /** Issues a link for `userId`, cancelling any earlier unused one. The token is returned once. */
  async create(userId: string, kind: InviteKind, createdByUserId: string | null): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.userInvite.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date() },
      }),
      this.prisma.userInvite.create({
        data: { userId, tokenHash: sha256(token), kind, expiresAt, createdByUserId },
      }),
    ]);
    return { token, expiresAt };
  }

  /** What the setup page shows before the person chooses a password; null for any invalid link. */
  async describe(token: string): Promise<{ username: string; displayName: string; kind: InviteKind } | null> {
    const invite = await this.findUsable(token);
    if (!invite) return null;
    return { username: invite.user.username, displayName: invite.user.displayName, kind: invite.kind as InviteKind };
  }

  /**
   * Consumes the link and sets the password. The password is checked BEFORE the link is spent, so a
   * rejected password can be retried; the spend itself is a single conditional update, so two
   * simultaneous submissions cannot both succeed.
   */
  async complete(token: string, password: string, ip?: string): Promise<AuthUser> {
    const invite = await this.findUsable(token);
    if (!invite) throw new NotFoundException(INVALID_LINK);

    const problem = checkPassword(password, { username: invite.user.username, displayName: invite.user.displayName });
    if (problem) throw new BadRequestException(problem);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const spent = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.userInvite.updateMany({
        where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({
        where: { id: invite.userId },
        data: { passwordHash, passwordChangedAt: new Date(), mustSetup: false, failedLoginCount: 0, lockedUntil: null },
      });
      // Anything signed in under the old credentials ends here.
      await tx.refreshToken.updateMany({ where: { userId: invite.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!spent) throw new NotFoundException(INVALID_LINK);

    await this.events.record(SecurityEventType.INVITE_USED, { userId: invite.userId, ip, detail: invite.kind });
    const user = invite.user;
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, companyScope: user.companyScope };
  }

  private findUsable(token: string) {
    if (token.length < 20 || token.length > 100) return Promise.resolve(null);
    return this.prisma.userInvite.findFirst({
      where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
      include: { user: true },
    });
  }
}
