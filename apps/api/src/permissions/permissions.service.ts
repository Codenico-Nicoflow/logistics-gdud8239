import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PermissionLevel, Role } from '@prisma/client';

/**
 * The screens/features the permission matrix governs. `admin` is deliberately
 * absent — it always has WRITE on everything, outside the matrix — and
 * non-matrix-controlled roles (`logistics`, `viewer`) still work through the
 * original `@Roles()` routes where those are used.
 */
export const PERMISSION_KEYS = [
  'soldiers',
  'signatures',
  'issue',
  'allocations.battalion',
  'allocations.company',
] as const;

const MATRIX_ROLES: Role[] = ['SHLISHUT', 'SAMGAD', 'COMPANY_CMDR'];

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every role × key combination, filling in NONE where nothing is set. */
  async findMatrix() {
    const rows = await this.prisma.rolePermission.findMany();
    const byRoleKey = new Map(rows.map((r) => [`${r.role}|${r.key}`, r]));

    return MATRIX_ROLES.map((role) => ({
      role,
      permissions: PERMISSION_KEYS.map((key) => ({
        key,
        level: byRoleKey.get(`${role}|${key}`)?.level ?? 'NONE',
      })),
    }));
  }

  async set(role: Role, key: string, level: PermissionLevel) {
    if (!MATRIX_ROLES.includes(role)) {
      throw new Error(`${role} is not governed by the permission matrix`);
    }
    return this.prisma.rolePermission.upsert({
      where: { role_key: { role, key } },
      update: { level },
      create: { role, key, level },
    });
  }
}
