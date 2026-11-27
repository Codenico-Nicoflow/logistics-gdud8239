import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** What can be recorded. Plain strings in the table so adding one needs no migration. */
export const SecurityEventType = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  USER_CREATED: 'USER_CREATED',
  INVITE_CREATED: 'INVITE_CREATED',
  INVITE_USED: 'INVITE_USED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_RESET: 'MFA_RESET',
  MFA_BACKUP_USED: 'MFA_BACKUP_USED',
  MFA_EXEMPTION_CHANGED: 'MFA_EXEMPTION_CHANGED',
  MFA_ENFORCEMENT_CHANGED: 'MFA_ENFORCEMENT_CHANGED',
  /** A platform admin switched into this battalion (recorded here, under their stand-in account). */
  ACT_AS: 'ACT_AS',
  /** A super admin switched an optional module on or off for the battalion. */
  MODULE_CHANGED: 'MODULE_CHANGED',
} as const;
export type SecurityEventType = (typeof SecurityEventType)[keyof typeof SecurityEventType];

export type SecurityEventInput = {
  userId?: string | null;
  actorUserId?: string | null;
  ip?: string | null;
  detail?: string;
};

/**
 * The account audit trail. Recording must never be the reason a login or an admin action fails, so
 * a write error is logged and swallowed. It never receives a password, a token or a signature.
 */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(type: SecurityEventType, input: SecurityEventInput = {}): Promise<void> {
    try {
      await this.prisma.securityEvent.create({
        data: {
          type,
          userId: input.userId ?? null,
          actorUserId: input.actorUserId ?? null,
          ip: input.ip?.slice(0, 64) ?? null,
          detail: input.detail?.slice(0, 300) ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Could not record ${type}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  recent(userId: string, take = 50) {
    return this.prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { at: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
    });
  }
}
