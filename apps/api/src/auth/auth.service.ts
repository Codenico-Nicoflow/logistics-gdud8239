import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS } from './auth.constants';
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
  ) {}

  /**
   * Verifies credentials.
   *
   * A missing username is compared against a dummy hash anyway, so the response
   * time does not reveal which usernames exist.
   */
  async validateCredentials(username: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    const hash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const matches = await bcrypt.compare(password, hash);

    if (!user || !matches || !user.isActive) {
      this.logger.warn(`Failed login attempt for username="${username}"`);
      throw new UnauthorizedException('שם משתמש או סיסמה שגויים');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      companyScope: user.companyScope,
    };
  }

  async issueTokens(user: AuthUser, session: SessionContext = {}): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      companyScope: user.companyScope,
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
      if (stored?.revokedAt) {
        this.logger.warn(`Revoked refresh token reused for user ${stored.userId}; revoking all sessions`);
        await this.revokeAllForUser(stored.userId);
      }
      throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    }

    if (stored.userId !== payload.sub || !stored.user.isActive) {
      throw new UnauthorizedException('המשתמש אינו פעיל');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

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

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('הסיסמה הנוכחית שגויה');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  static generatePassword(): string {
    return randomBytes(12).toString('base64url');
  }
}
