import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const MFA_ENFORCED_KEY = 'mfa.enforced';

export type LoginStep = 'none' | 'totp' | 'enroll';

/**
 * Who owes the authenticator step. Two switches, both owned by a super-admin and kept in the
 * database (so they flip instantly from the Users screen, not through a redeploy):
 *  - the global one: required for everyone, or optional;
 *  - a per-person exemption.
 * Optional means a person who has enrolled still uses it, and a person who has not signs in as before.
 */
@Injectable()
export class MfaPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async isEnforced(): Promise<boolean> {
    const row = await this.prisma.appSetting.findFirst({ where: { key: MFA_ENFORCED_KEY } });
    return row?.value === 'true';
  }

  async setEnforced(enforced: boolean, actorUserId: string): Promise<void> {
    // The key is only unique together with the battalion, so there is no `upsert` by key alone; the
    // battalion itself is filled in by the database on create.
    const data = { value: String(enforced), updatedByUserId: actorUserId };
    const { count } = await this.prisma.appSetting.updateMany({ where: { key: MFA_ENFORCED_KEY }, data });
    if (count === 0) await this.prisma.appSetting.create({ data: { key: MFA_ENFORCED_KEY, ...data } });
  }

  async hasTotp(userId: string): Promise<boolean> {
    const row = await this.prisma.userTotp.findUnique({ where: { userId }, select: { confirmedAt: true } });
    return !!row?.confirmedAt;
  }

  /** What the person must still do after the password, before a session exists. */
  async stepFor(userId: string): Promise<LoginStep> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaExempt: true } });
    if (!user || user.mfaExempt) return 'none';
    if (await this.hasTotp(userId)) return 'totp';
    return (await this.isEnforced()) ? 'enroll' : 'none';
  }
}
