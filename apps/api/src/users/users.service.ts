import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BCRYPT_ROUNDS } from '../auth/auth.constants';
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
};

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
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: PUBLIC_FIELDS,
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
    });
  }

  /** Returns the generated password exactly once when the caller did not supply one. */
  async create(
    dto: CreateUserDto,
    actingUserId: string,
  ): Promise<PublicUser & { generatedPassword?: string }> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('שם המשתמש כבר קיים');

    // שונם specifically cannot create a new admin account — any other role
    // is fine, just not that one. Message is deliberately a jab, not a plain
    // explanation — an inside joke, not a real security notice.
    const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
    if (actor?.username === 'shunem' && dto.role === 'admin') {
      throw new BadRequestException('סתם אפס כמוך לא מקים מנהלים, תוריד ציפיות ותבחר תפקיד אחר');
    }

    const generated = dto.password ? undefined : AuthService.generatePassword();
    const password = dto.password ?? generated;
    if (!password) throw new BadRequestException('נדרשת סיסמה');

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        displayName: dto.displayName,
        role: dto.role,
        companyScope: dto.companyScope ?? null,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
      select: PUBLIC_FIELDS,
    });

    return generated ? { ...user, generatedPassword: generated } : user;
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

    // Deactivating or demoting takes effect at once.
    if (dto.isActive === false || dto.role !== undefined) {
      await this.auth.revokeAllForUser(id);
    }
    return updated;
  }

  /** Lifts a lock after wrong passwords — the account's owner, not an attacker, is who usually needs it. */
  async unlock(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');
    await this.auth.unlock(id);
  }

  /** Admin password reset. Returns the new password once and ends every session. */
  async resetPassword(id: string, actingUserId: string): Promise<{ password: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');

    if (user.isSuperAdmin) {
      const actor = await this.prisma.user.findUnique({ where: { id: actingUserId } });
      if (!actor?.isSuperAdmin) {
        throw new BadRequestException('אין הרשאה לאפס סיסמה לחשבון סופר-מנהל');
      }
    }

    const password = AuthService.generatePassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.auth.revokeAllForUser(id);
    return { password };
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
