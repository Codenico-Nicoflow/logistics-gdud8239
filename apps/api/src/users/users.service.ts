import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
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
};

const PUBLIC_FIELDS = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  companyScope: true,
  isActive: true,
  createdAt: true,
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
  async create(dto: CreateUserDto): Promise<PublicUser & { generatedPassword?: string }> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('שם המשתמש כבר קיים');

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

    // An admin must not be able to lock themselves out, nor remove the last admin.
    if (id === actingUserId) {
      if (dto.isActive === false) throw new BadRequestException('לא ניתן להשבית את החשבון שלך');
      if (dto.role && dto.role !== 'admin') {
        throw new BadRequestException('לא ניתן לשנות את התפקיד של החשבון שלך');
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
      },
      select: PUBLIC_FIELDS,
    });

    // Deactivating or demoting takes effect at once.
    if (dto.isActive === false || dto.role !== undefined) {
      await this.auth.revokeAllForUser(id);
    }
    return updated;
  }

  /** Admin password reset. Returns the new password once and ends every session. */
  async resetPassword(id: string): Promise<{ password: string }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('המשתמש אינו קיים');

    const password = AuthService.generatePassword();
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
    });
    await this.auth.revokeAllForUser(id);
    return { password };
  }
}
