import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { checkPassword } from './password-policy';
import { Cron } from '@nestjs/schedule';
import {
  BCRYPT_ROUNDS,
  LOCKOUT_AFTER_FAILURES,
  LOCKOUT_BASE_MINUTES,
  LOCKOUT_MAX_MINUTES,
  LOGIN_IP_FAILURES_DEFAULT,
  LOGIN_IP_FAILURE_WINDOW_MS,
  REFRESH_REUSE_GRACE_MS,
} from './auth.constants';
import type { AuthUser, JwtPayload, RefreshPayload } from './auth.types';

/**
 * `expiresIn` is typed as a template literal (`"15m"`, `"7d"`, ...) by
 * jsonwebtoken, so a value read from the environment needs validating before it
 * can be passed through. `parseDuration` already rejects anything malformed.
 */
type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

function asDuration(value: string): Duration {
  parseDuration(value);
  return value as Duration;
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export type SessionContext = {
  userAgent?: string;
  ip?: string;
};

/** Refresh tokens are stored as a SHA-256 digest; the raw value only ever leaves in a cookie. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: "${value}"`);
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return amount * factor;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: SecurityEventsService,
  ) {}

  /**
   * Verifies credentials.
   *
   * Every failure returns the same message and does the same work: a missing username is
   * compared against a dummy hash, and a locked account is too, so neither the response nor
   * its timing says which usernames exist or which are locked.
   */
  async validateCredentials(username: string, password: string, ip?: string): Promise<AuthUser> {
    if (ip && this.ipBlocked(ip)) {
      throw new HttpException('יותר מדי ניסיונות כניסה כושלים מהרשת הזו. נסו שוב בעוד כמה דקות', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({ where: { username } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();

    const hash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const matches = await bcrypt.compare(password, hash);

    // An account still waiting for its owner to choose a password (or with a setup link outstanding
    // after a reset) cannot log in: there is nothing valid to log in with.
    const awaitingSetup = !!user && (!user.passwordHash || user.mustSetup);

    if (!user || !user.isActive || locked || awaitingSetup || !matches) {
      // The id, never the typed username: people mistype passwords into that field.
      if (ip) this.noteIpFailure(ip);
      if (user && user.isActive && !locked && !awaitingSetup) {
        const lockedUntil = await this.recordFailure(user.id, user.failedLoginCount);
        await this.events.record(SecurityEventType.LOGIN_FAILED, { userId: user.id, ip });
        if (lockedUntil) {
          await this.events.record(SecurityEventType.ACCOUNT_LOCKED, { userId: user.id, ip, detail: `until ${lockedUntil.toISOString()}` });
        }
      }
      this.logger.warn(
        user
          ? `Failed login for user ${user.id}${locked ? ' (locked)' : ''}`
          : `Failed login for an unknown username (${username.length} chars)`,
      );
      throw new UnauthorizedException('שם משתמש או סיסמה שגויים, או שהחשבון ננעל זמנית');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.events.record(SecurityEventType.LOGIN_SUCCESS, { userId: user.id, ip });

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      companyScope: user.companyScope,
    };
  }

  /**
   * Failed logins per IP, in memory (the API is one instance; a restart simply forgives).
   * Only FAILURES count — a successful login neither adds to it nor clears it, so an attacker
   * cannot reset the counter by logging in to an account of their own.
   */
  private readonly ipFailures = new Map<string, number[]>();

  private recentFailures(ip: string): number[] {
    const cutoff = Date.now() - LOGIN_IP_FAILURE_WINDOW_MS;
    const recent = (this.ipFailures.get(ip) ?? []).filter((t) => t > cutoff);
    if (recent.length) this.ipFailures.set(ip, recent);
    else this.ipFailures.delete(ip);
    return recent;
  }

  private ipBlocked(ip: string): boolean {
    if (process.env.DISABLE_RATE_LIMIT === 'true') return false;
    const limit = Number(process.env.LOGIN_IP_FAILURES_PER_15MIN) || LOGIN_IP_FAILURES_DEFAULT;
    return this.recentFailures(ip).length >= limit;
  }

  private noteIpFailure(ip: string): void {
    const recent = this.recentFailures(ip);
    recent.push(Date.now());
    this.ipFailures.set(ip, recent);
    // Bounded: a flood of distinct addresses must not grow this without limit.
    if (this.ipFailures.size > 5_000) {
      const oldest = this.ipFailures.keys().next().value;
      if (oldest !== undefined) this.ipFailures.delete(oldest);
    }
  }

  /** Counts the failure and, past the threshold, locks the account for a growing time. */
  private async recordFailure(userId: string, previousCount: number): Promise<Date | null> {
    const count = previousCount + 1;
    const over = count - LOCKOUT_AFTER_FAILURES;
    const lockedUntil =
      over >= 0
        ? new Date(Date.now() + Math.min(LOCKOUT_MAX_MINUTES, LOCKOUT_BASE_MINUTES * 2 ** over) * 60_000)
        : undefined;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 }, ...(lockedUntil ? { lockedUntil } : {}) },
    });
    return lockedUntil ?? null;
  }

  /**
   * Expired and long-revoked refresh rows are dead weight (and, in a backup, a list of past
   * sessions with IPs and user agents). Revoked rows are kept a week so reuse detection still
   * recognises a recently stolen token.
   */
  @Cron('30 3 * * *', { timeZone: 'Asia/Jerusalem', name: 'prune-refresh-tokens' })
  async pruneRefreshTokens(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') !== 'production') return;
    const day = 86_400_000;
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - day) } },
          { revokedAt: { lt: new Date(Date.now() - 7 * day) } },
        ],
      },
    });
    if (count > 0) this.logger.log(`Pruned ${count} old refresh tokens`);

    // Used or long-expired setup links are dead weight, and account events are kept for over a year.
    await this.prisma.userInvite.deleteMany({
      where: { OR: [{ usedAt: { lt: new Date(Date.now() - 30 * day) } }, { expiresAt: { lt: new Date(Date.now() - 30 * day) } }] },
    });
    await this.prisma.securityEvent.deleteMany({ where: { at: { lt: new Date(Date.now() - 400 * day) } } });
  }

  /** Admin unlock: clears the counter and the lock. */
  async unlock(userId: string, actorUserId?: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
    await this.events.record(SecurityEventType.ACCOUNT_UNLOCKED, { userId, actorUserId });
  }

  async issueTokens(user: AuthUser, session: SessionContext = {}): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      companyScope: user.companyScope,
      iatMs: Date.now(),
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: asDuration(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
    });

    const jti = randomUUID();
    const refreshTtl = asDuration(this.config.get<string>('JWT_REFRESH_TTL') ?? '7d');
    const refreshPayload: RefreshPayload = { sub: user.id, jti };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    const refreshExpiresAt = new Date(Date.now() + parseDuration(refreshTtl));
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: session.userAgent?.slice(0, 500),
        ip: session.ip,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new pair issued.
   * A token that is unknown, already revoked or expired is rejected, so a stolen
   * token stops working as soon as the real session refreshes.
   */
  async refresh(refreshToken: string, session: SessionContext = {}): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Reuse of a revoked token may mean it was stolen; drop every session for
      // that user so a compromised token cannot be chained indefinitely.
      // A token rotated a moment ago is the normal result of two tabs refreshing at once,
      // not theft, so it is refused without ending every session.
      if (stored?.revokedAt && Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        this.logger.warn(`Revoked refresh token reused for user ${stored.userId}; revoking all sessions`);
        await this.revokeAllForUser(stored.userId);
      }
      throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    }

    if (stored.userId !== payload.sub || !stored.user.isActive) {
      throw new UnauthorizedException('המשתמש אינו פעיל');
    }

    // Claimed atomically: of two concurrent refreshes with the same token only one updates
    // a row, so a token can never be rotated into two live sessions.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');

    return this.issueTokens(
      {
        id: stored.user.id,
        username: stored.user.username,
        displayName: stored.user.displayName,
        role: stored.user.role,
        companyScope: stored.user.companyScope,
      },
      session,
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Changing a password revokes every other session for that user. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('המשתמש אינו קיים');

    const matches = user.passwordHash ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
    if (!matches) throw new UnauthorizedException('הסיסמה הנוכחית שגויה');

    const problem = checkPassword(newPassword, { username: user.username, displayName: user.displayName });
    if (problem) throw new BadRequestException(problem);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), passwordChangedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.events.record(SecurityEventType.PASSWORD_CHANGED, { userId, actorUserId: userId });
  }

}
