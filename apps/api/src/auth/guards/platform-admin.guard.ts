import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import type { AuthUser } from '../auth.types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(PLATFORM_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user?.isPlatformAdmin) throw new ForbiddenException('אין לך הרשאה לבצע פעולה זו');
    return true;
  }
}
