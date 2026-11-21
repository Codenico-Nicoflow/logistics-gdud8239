import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { MfaPolicy, type LoginStep } from './mfa-policy.service';
import {
  BACKUP_CODE_COUNT,
  decryptSecret,
  encryptSecret,
  generateBackupCode,
  generateSecret,
  hashBackupCode,
  matchStep,
  normalizeBackupCode,
  otpauthUrl,
} from './totp';

const STEP_TOKEN_TTL = '5m';
const ISSUER = 'Logistics 8239';
const REFUSED = 'הקוד שגוי או שפג תוקפו. נסו שוב';

type StepToken = { sub: string; typ: 'mfa'; iatMs: number };

export type MfaStatus = {
  enabled: boolean;
  backupCodesLeft: number;
  /** Required for everyone right now. */
  enforced: boolean;
  /** A super-admin excused this person. */
  exempt: boolean;
  /** Whether they may switch it off themselves (never while it is required of them). */
  canDisable: boolean;
};

export type EnrolStart = { secret: string; otpauthUrl: string };

/**
 * The authenticator-app second step: enrolling, checking a code at sign-in, backup codes, and the
 * admin controls around them. A code is only ever accepted once (`lastStep`), failures count toward the
 * same per-account lockout as wrong passwords, and the stored secret is encrypted under a key that
 * lives on the server and not in the database.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly events: SecurityEventsService,
    private readonly auth: AuthService,
    readonly policy: MfaPolicy,
  ) {}

  // ---------- the step between password and session ----------

  stepFor(userId: string): Promise<LoginStep> {
    return this.policy.stepFor(userId);
  }

  async signStepToken(userId: string): Promise<string> {
    const payload: StepToken = { sub: userId, typ: 'mfa', iatMs: Date.now() };
    return this.jwt.signAsync(payload, { secret: this.stepSecret(), expiresIn: STEP_TOKEN_TTL });
  }

  /**
   * Resolves a step token to its user — and refuses it if the account changed in between
   * (deactivated, reset, locked): the password proof is only as fresh as the account.
   */
  async userForStepToken(token: string): Promise<AuthUser> {
    let payload: StepToken;
    try {
      payload = await this.jwt.verifyAsync<StepToken>(token, { secret: this.stepSecret() });
    } catch {
      throw new UnauthorizedException(REFUSED);
    }
    if (payload.typ !== 'mfa') throw new UnauthorizedException(REFUSED);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const changed = !!user?.passwordChangedAt && payload.iatMs < user.passwordChangedAt.getTime();
    if (!user || !user.isActive || user.mustSetup || locked || changed) throw new UnauthorizedException(REFUSED);

    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, companyScope: user.companyScope };
  }

  /** Its own key, derived from the access secret, so a step token can never be accepted as an access token. */
  private stepSecret(): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('logistics-mfa-step').digest('hex');
  }

  /** Not in the database, so a stolen backup cannot produce codes. */
  private serverSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  // ---------- enrolling ----------

  /** Creates (or replaces) the PENDING secret. It counts as enrolled only after `confirm`. */
  async enrolStart(userId: string): Promise<EnrolStart> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (await this.policy.hasTotp(userId)) throw new ConflictException('האפליקציה כבר מוגדרת. הסירו אותה קודם כדי להגדיר מחדש');

    const secret = generateSecret();
    const secretEnc = encryptSecret(secret, this.serverSecret());
    await this.prisma.userTotp.upsert({
      where: { userId },
      create: { userId, secretEnc },
      update: { secretEnc, confirmedAt: null, lastStep: 0 },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.username, ISSUER) };
  }

  /** Proves the person's app shows the right code, then turns it on and returns the backup codes (once). */
  async enrolConfirm(userId: string, code: string, ip?: string): Promise<string[]> {
    const row = await this.prisma.userTotp.findUnique({ where: { userId } });
    if (!row || row.confirmedAt) throw new UnauthorizedException(REFUSED);

    const step = matchStep(decryptSecret(row.secretEnc, this.serverSecret()), code.trim(), Date.now(), 0);
    if (step === null) {
      await this.auth.recordSecondFactorFailure(userId, ip, 'enrol');
      throw new UnauthorizedException(REFUSED);
    }

    const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await this.prisma.$transaction([
      this.prisma.userTotp.update({ where: { userId }, data: { confirmedAt: new Date(), lastStep: step } }),
      this.prisma.totpBackupCode.deleteMany({ where: { userId } }),
      this.prisma.totpBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    ]);
    await this.events.record(SecurityEventType.MFA_ENABLED, { userId, actorUserId: userId, ip });
    return codes;
  }

  // ---------- using it at sign-in ----------

  /** Verifies a 6-digit code or a backup code. Throws on anything else; returns normally only on success. */
  async verifyLogin(userId: string, input: string, ip?: string): Promise<void> {
    const code = input.trim();
    const ok = /^\d{6}$/.test(code) ? await this.verifyTotp(userId, code) : await this.useBackupCode(userId, code, ip);
    if (!ok) {
      await this.auth.recordSecondFactorFailure(userId, ip, 'sign-in');
      throw new UnauthorizedException(REFUSED);
    }
  }

  private async verifyTotp(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.userTotp.findUnique({ where: { userId } });
    if (!row?.confirmedAt) return false;
    const step = matchStep(decryptSecret(row.secretEnc, this.serverSecret()), code, Date.now(), row.lastStep);
    if (step === null) return false;
    // Claimed atomically: two requests with the same code cannot both pass.
    const claimed = await this.prisma.userTotp.updateMany({ where: { userId, lastStep: { lt: step } }, data: { lastStep: step } });
    return claimed.count === 1;
  }

  private async useBackupCode(userId: string, code: string, ip?: string): Promise<boolean> {
    if (normalizeBackupCode(code).length !== 10) return false;
    const claimed = await this.prisma.totpBackupCode.updateMany({
      where: { userId, codeHash: hashBackupCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await this.events.record(SecurityEventType.MFA_BACKUP_USED, { userId, ip });
    return true;
  }

  // ---------- the person's own settings ----------

  async status(userId: string): Promise<MfaStatus> {
    const [user, enforced, enabled, left] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaExempt: true } }),
      this.policy.isEnforced(),
      this.policy.hasTotp(userId),
      this.prisma.totpBackupCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { enabled, backupCodesLeft: left, enforced, exempt: user.mfaExempt, canDisable: user.mfaExempt || !enforced };
  }

  /** Re-checks the password for sensitive changes: a stolen session alone must not weaken the account. */
  private async requirePassword(userId: string, password: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) {
      await this.auth.recordSecondFactorFailure(userId, ip, 'password re-check');
      throw new UnauthorizedException('הסיסמה שגויה');
    }
  }

  async disable(userId: string, password: string, ip?: string): Promise<void> {
    const status = await this.status(userId);
    if (!status.canDisable) throw new ForbiddenException('האימות הדו-שלבי נדרש מכולם כרגע ולא ניתן לכבות אותו');
    await this.requirePassword(userId, password, ip);
    await this.prisma.userTotp.deleteMany({ where: { userId } });
    await this.events.record(SecurityEventType.MFA_DISABLED, { userId, actorUserId: userId, ip });
  }

  async regenerateBackupCodes(userId: string, password: string, ip?: string): Promise<string[]> {
    if (!(await this.policy.hasTotp(userId))) throw new ConflictException('האפליקציה אינה מוגדרת');
    await this.requirePassword(userId, password, ip);
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await this.prisma.$transaction([
      this.prisma.totpBackupCode.deleteMany({ where: { userId } }),
      this.prisma.totpBackupCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashBackupCode(c) })) }),
    ]);
    return codes;
  }

  // ---------- super-admin controls ----------

  private async requireSuperAdmin(actorUserId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { isSuperAdmin: true } });
    if (!actor?.isSuperAdmin) throw new ForbiddenException('רק סופר-מנהל יכול לשנות הגדרה זו');
  }

  async overview(): Promise<{ enforced: boolean; enrolled: number; active: number; exempt: number }> {
    const [enforced, enrolled, active, exempt] = await Promise.all([
      this.policy.isEnforced(),
      this.prisma.user.count({ where: { isActive: true, totp: { confirmedAt: { not: null } } } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true, mfaExempt: true } }),
    ]);
    return { enforced, enrolled, active, exempt };
  }

  /**
   * Required-for-everyone on/off. Refused unless the person flipping it has the app themselves —
   * otherwise the one admin who can turn it back off could lock themself out with it.
   */
  async setEnforced(actorUserId: string, enforced: boolean): Promise<void> {
    await this.requireSuperAdmin(actorUserId);
    if (enforced && !(await this.policy.hasTotp(actorUserId))) {
      throw new ConflictException('הגדירו קודם את אפליקציית האימות בחשבון שלכם, ורק אז אפשר לדרוש אותה מכולם');
    }
    await this.policy.setEnforced(enforced, actorUserId);
    await this.events.record(SecurityEventType.MFA_ENFORCEMENT_CHANGED, { actorUserId, detail: String(enforced) });
  }

  async setExempt(actorUserId: string, userId: string, exempt: boolean): Promise<void> {
    await this.requireSuperAdmin(actorUserId);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaExempt: exempt } });
    await this.events.record(SecurityEventType.MFA_EXEMPTION_CHANGED, { userId, actorUserId, detail: String(exempt) });
  }

  /** Lost phone and no backup codes: wipe the app, end sessions. The person enrols again at next sign-in. */
  async reset(actorUserId: string, userId: string): Promise<void> {
    await this.prisma.userTotp.deleteMany({ where: { userId } });
    // `passwordChangedAt` is what refuses access tokens already issued; without it a thief's session
    // would live on for up to 15 minutes after the reset.
    await this.prisma.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } });
    await this.auth.revokeAllForUser(userId);
    await this.events.record(SecurityEventType.MFA_RESET, { userId, actorUserId });
  }
}
