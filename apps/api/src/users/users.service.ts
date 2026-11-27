import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { AuthService } from '../auth/auth.service';
import { MfaService } from '../auth/mfa.service';
import { InvitesService } from '../auth/invites.service';
import { normalizeOrigin } from '../common/origin-check.middleware';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyScope: string | null;
  isActive: boolean;
  createdAt: Date;
  isSuperAdmin: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  /** A setup link is outstanding: the account cannot log in until its owner uses it. */
  mustSetup: boolean;
  /** Whether the person has set up the authenticator app. */
  mfaEnabled?: boolean;
  /** A super-admin excused them from the authenticator step. */
  mfaExempt: boolean;
};

/** The one-time link, returned exactly once when it is created. */
export type SetupLink = { url: string; expiresAt: Date };

const PUBLIC_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  companyScope: true,
  isActive: true,
  createdAt: true,
  isSuperAdmin: true,
  lockedUntil: true,
  lastLoginAt: true,
  mustSetup: true,
  mfaExempt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly invites: InvitesService,
    private readonly mfa: MfaService,
    private readonly events: SecurityEventsService,
    private readonly config: ConfigService,
    private readonly companies: CompaniesService,
  ) {}

  private linkFor(token: string, expiresAt: Date): SetupLink {
    const origin = normalizeOrigin(this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173');
    return { url: `${origin}/setup/${token}`, expiresAt };
  }

  async findAll(): Promise<PublicUser[]> {
    const rows = await this.prisma.user.findMany({
      select: { ...PUBLIC_FIELDS, totp: { select: { confirmedAt: true } } },
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
    });
    return rows.map(({ totp, ...user }) => ({ ...user, mfaEnabled: !!totp?.confirmedAt }));
  }

  /**
   * Creates an account with NO password. The admin gets a one-time setup link to hand over; the
   * person opens it and chooses their own password, so nobody else ever knows it.
   */
  async create(dto: CreateUserDto, actingUserId: string): Promise<PublicUser & { setup: SetupLink }> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('שם המשתמש כבר קיים');

    // שונם specifically cannot create a new admin account — any other role
    // is fine, just not that one. Message is deliberately a jab, not a plain
    // explanation — an inside joke, not a real security notice.
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (actor?.username === 'shunem' && dto.role === 'admin') {
      throw new BadRequestException('סתם אפס כמוך לא מקים מנהלים, תוריד ציפיות ותבחר תפקיד אחר');
    }

    // A commander without a company would be read as "unscoped" everywhere, i.e. able to see every company.
    if (dto.role === 'COMPANY_CMDR' && !dto.companyScope) {
      throw new BadRequestException('סגן מפקד פלוגה חייב להיות משויך לפלוגה');
    }
    if (dto.companyScope) await this.companies.assertActive(dto.companyScope);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        displayName: dto.displayName,
        role: dto.role,
        companyScope: dto.companyScope ?? null,
        passwordHash: null,
        mustSetup: true,
      },
      select: PUBLIC_FIELDS,
    });
    const { token, expiresAt } = await this.invites.create(user.id, 'INVITE', actingUserId);
    await this.events.record(SecurityEventType.USER_CREATED, { userId: user.id, actorUserId: actingUserId, detail: dto.role });
    await this.events.record(SecurityEventType.INVITE_CREATED, { userId: user.id, actorUserId: actingUserId, detail: 'INVITE' });
    return { ...user, setup: this.linkFor(token, expiresAt) };
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');

    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    // A regular admin cannot touch a super-admin's account at all — not even
    // their own display name — only a super-admin may edit another
    // super-admin. Checked before anything else below, including the
    // self-edit guards, since "it's my own account" isn't an exception here:
    // a non-super-admin editing a super-admin never happens, full stop.
    if (user.isSuperAdmin && !actor?.isSuperAdmin) {
      throw new BadRequestException('אין הרשאה לערוך חשבון סופר-מנהל');
    }
    // Only a super-admin can grant or revoke the flag itself.
    if (dto.isSuperAdmin !== undefined && !actor?.isSuperAdmin) {
      throw new BadRequestException('רק סופר-מנהל יכול להעניק הרשאת סופר-מנהל');
    }
    if (dto.mfaExempt !== undefined && !actor?.isSuperAdmin) {
      throw new BadRequestException('רק סופר-מנהל יכול לפטור משתמש מאימות דו-שלבי');
    }
    // A regular admin cannot rename another admin account (their own name is
    // still theirs to change) — only a super-admin may rename any admin.
    if (
      user.role === 'admin' &&
      id !== actingUserId &&
      dto.displayName !== undefined &&
      !actor?.isSuperAdmin
    ) {
      throw new BadRequestException('רק סופר-מנהל יכול לשנות את שם התצוגה של מנהל אחר');
    }
    // שונם is a special case of the above, not an exception to it: he can't
    // rename even himself, super-admin privilege notwithstanding — only
    // someone else (a super-admin) can change his display name. Message is
    // deliberately a jab, same spirit as the admin-creation block above.
    if (user.username === 'shunem' && id === actingUserId && dto.displayName !== undefined) {
      throw new BadRequestException('לא, אתה לא שווה אפילו לשנות את השם שלך בעצמך');
    }

    // An admin must not be able to lock themselves out, nor remove the last admin.
    if (id === actingUserId) {
      if (dto.isActive === false) throw new BadRequestException('לא ניתן להשבית את החשבון שלך');
      if (dto.role && dto.role !== 'admin') {
        throw new BadRequestException('לא ניתן לשנות את התפקיד של החשבון שלך');
      }
      if (dto.isSuperAdmin === false) {
        throw new BadRequestException('לא ניתן להסיר הרשאת סופר-מנהל מעצמך');
      }
    }
    if (user.role === 'admin' && (dto.role && dto.role !== 'admin' || dto.isActive === false)) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: 'admin', isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('חייב להישאר לפחות מנהל אחד פעיל');
      }
    }

    if (dto.companyScope && dto.companyScope !== user.companyScope) await this.companies.assertActive(dto.companyScope);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.companyScope !== undefined ? { companyScope: dto.companyScope } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isSuperAdmin !== undefined ? { isSuperAdmin: dto.isSuperAdmin } : {}),
      },
      select: PUBLIC_FIELDS,
    });

    if (dto.mfaExempt !== undefined && dto.mfaExempt !== user.mfaExempt) {
      await this.mfa.setExempt(actingUserId, id, dto.mfaExempt);
      updated.mfaExempt = dto.mfaExempt;
    }

    // Deactivating or demoting takes effect at once.
    if (dto.isActive === false || dto.role !== undefined) {
      await this.auth.revokeAllForUser(id);
    }
    return updated;
  }

  /** Recent account events for the admin's security log. */
  async securityEvents(id: string, take?: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');
    return this.events.recent(id, take);
  }

  /** Lifts a lock after wrong passwords — the account's owner, not an attacker, is who usually needs it. */
  async unlock(id: string, actingUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');
    await this.auth.unlock(id, actingUserId);
  }

  /**
   * Replaces "reset the password": a forgotten password or a lost device gets a fresh setup link.
   * Issuing it ends the person's sessions at once and stops the old password from working until the
   * link is used — so if the reason is a stolen phone, the thief is out immediately.
   */
  async issueSetupLink(id: string, actingUserId: string): Promise<SetupLink> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');
    if (!user.isActive) throw new BadRequestException('החשבון מושבת. יש להפעיל אותו לפני שליחת קישור');
    if (id === actingUserId) throw new BadRequestException('לא ניתן לשלוח קישור הגדרה לחשבון שלך');

    if (user.isSuperAdmin) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor?.isSuperAdmin) {
        throw new BadRequestException('אין הרשאה לשלוח קישור הגדרה לחשבון סופר-מנהל');
      }
    }

    return this.reissue(user, actingUserId);
  }

  /**
   * Lost phone and no backup codes: wipes the authenticator app and ends the person's sessions. They
   * set it up again at their next sign-in (if it is required of them) or from "אבטחה".
   */
  async resetMfa(id: string, actingUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');
    if (user.isSuperAdmin && id !== actingUserId) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor?.isSuperAdmin) throw new BadRequestException('אין הרשאה לאפס אימות לחשבון סופר-מנהל');
    }
    await this.mfa.reset(actingUserId, id);
  }

  private async reissue(user: { id: string; passwordHash: string | null }, actingUserId: string | null): Promise<SetupLink> {
    const id = user.id;
    await this.prisma.user.update({
      where: { id },
      // `passwordChangedAt` ends access tokens already issued; the refresh tokens go just below.
      data: { mustSetup: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.auth.revokeAllForUser(id);
    const { token, expiresAt } = await this.invites.create(id, user.passwordHash ? 'RESET' : 'INVITE', actingUserId);
    await this.events.record(SecurityEventType.INVITE_CREATED, { userId: id, actorUserId: actingUserId, detail: 'RESET' });
    return this.linkFor(token, expiresAt);
  }

  /**
   * A real delete, not another isActive flag — for an account that was never
   * real to begin with (test account, created by mistake). Anyone who has
   * actually signed, issued, or recorded something is protected at the DB
   * level by the default `Restrict` on those tables' user FKs, so this fails
   * with a clear message instead of silently erasing audit trail —
   * deactivating is the right tool for a real account no longer in use.
   */
  async remove(id: string, actingUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');

    if (id === actingUserId) throw new BadRequestException('לא ניתן למחוק את החשבון שלך');

    if (user.isSuperAdmin) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor?.isSuperAdmin) throw new BadRequestException('אין הרשאה למחוק חשבון סופר-מנהל');
    }

    if (user.role === 'admin') {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: 'admin', isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('חייב להישאר לפחות מנהל אחד פעיל');
      }
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          `לא ניתן למחוק את ${user.displayName} — קיימת היסטוריה (חתימות/תנועות/פעולות). ניתן להשבית את החשבון במקום.`,
        );
      }
      throw err;
    }
    await this.auth.revokeAllForUser(id);
  }
}
