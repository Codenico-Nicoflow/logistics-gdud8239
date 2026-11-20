import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY, type RequiredPermission } from '../decorators/permission.decorator';
import type { AuthUser } from '../auth.types';

const RANK: Record<string, number> = { NONE: 0, READ: 1, WRITE: 2 };

/**
 * Checks a route's required permission against the editable `role_permissions`
 * matrix, rather than a role list fixed in code — so granting e.g. סמג"ד
 * read access to חתימות is a toggle in the admin הרשאות screen, not a deploy.
 *
 * `admin` bypasses the matrix entirely: it always has WRITE on everything,
 * so the app can never be locked out by a misconfigured or empty matrix.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('נדרשת הזדהות');
    if (user.role === 'admin') return true;
    if (required.alsoAllow?.includes(user.role)) return true;

    const row = await this.prisma.rolePermission.findUnique({
      where: { role_key: { role: user.role, key: required.key } },
    });
    const level = row?.level ?? 'NONE';
    if (RANK[level] < RANK[required.level]) {
      throw new ForbiddenException('אין לך הרשאה לבצע פעולה זו');
    }
    return true;
  }
}
