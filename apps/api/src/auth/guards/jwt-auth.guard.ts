import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { bindBattalion } from '../../tenancy/tenant-context';
import { TenantService } from '../../tenancy/tenant.service';
import { toAuthUser } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_COOKIE } from '../auth.constants';
import type { AuthUser, JwtPayload } from '../auth.types';

/**
 * Verifies the access token and loads the user.
 *
 * The user is re-read on every request rather than trusted from the token, so
 * deactivating an account or changing a role takes effect immediately instead of
 * waiting for the token to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('נדרשת הזדהות');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    }

    // A token from before battalions existed names none: sign in again rather than guess one.
    if (!payload.battalionId) throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    bindBattalion(payload.battalionId);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('המשתמש אינו פעיל');
    }
    // A password change or reset ends sessions at once: a token issued before it is refused,
    // instead of staying valid until its 15 minutes run out.
    const issuedAt = payload.iatMs ?? (payload.iat ?? 0) * 1000;
    if (user.passwordChangedAt && issuedAt < user.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
    }

    const authUser = toAuthUser(user);
    // A platform admin inside another battalion is a stand-in row there. Both halves must agree, and the
    // real person must still be an active platform admin, so removing their access ends the session now.
    if (user.actsForId || payload.actorId) {
      if (!user.actsForId || user.actsForId !== payload.actorId) {
        throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
      }
      const actor = await this.tenants.platformActor(user.actsForId);
      if (!actor) throw new UnauthorizedException('ההזדהות פגה, נא להתחבר מחדש');
      authUser.homeBattalionId = actor.battalionId;
    }
    request.user = authUser;
    return true;
  }

  /** Prefers the httpOnly cookie; the Authorization header supports API clients. */
  private extractToken(request: Request): string | null {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const fromCookie = cookies?.[ACCESS_COOKIE];
    if (fromCookie) return fromCookie;

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return null;
  }
}
