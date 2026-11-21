import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tier } from '../common/throttle-tiers';
import { Roles } from './decorators/roles.decorator';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type TokenPair } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Tight per-IP limits (see the `login` tiers): this is the one route where guessing is the attack. */
  @Public()
  @Tier('login', 'loginHour')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.auth.validateCredentials(dto.username, dto.password, request.ip);
    const tokens = await this.auth.issueTokens(user, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    this.setCookies(response, tokens);
    return { user };
  }

  @Public()
  @Tier('authIp')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const token = this.readRefreshCookie(request);
    if (!token) throw new UnauthorizedException('נדרשת הזדהות');

    const tokens = await this.auth.refresh(token, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    this.setCookies(response, tokens);
    return { ok: true };
  }

  // Public, like `refresh`: logout must work even when the access token has
  // already expired or was revoked elsewhere — the point is to clear
  // whatever cookie is sitting in the browser, not to prove you're still
  // authenticated.
  @Public()
  @Tier('authIp')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const token = this.readRefreshCookie(request);
    if (token) await this.auth.revoke(token);
    this.clearCookies(response);
    return { ok: true };
  }

  /**
   * TEMPORARY, admin only: shows what the API sees of the connection, so the number of proxy
   * hops (Vercel, then Render) can be read once on production and set as TRUST_PROXY_HOPS.
   * Remove after that — see docs/fix-platform-hardening-and-throttling.md.
   */
  @Roles('admin')
  @Get('debug-ip')
  debugIp(@Req() request: Request): Record<string, unknown> {
    return {
      ip: request.ip,
      ips: request.ips,
      xForwardedFor: request.headers['x-forwarded-for'] ?? null,
      remoteAddress: request.socket.remoteAddress ?? null,
      trustProxyHops: this.config.get<string>('TRUST_PROXY_HOPS') ?? '0',
    };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }

  @Tier('account')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    // Every session was revoked, including this one.
    this.clearCookies(response);
    return { ok: true };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  /**
   * Tokens live in httpOnly cookies so page scripts cannot read them, which
   * removes the XSS-to-token-theft path that localStorage leaves open.
   */
  private cookieOptions(expires: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      // Strict: every call is first-party (the SPA and /api share the Vercel origin), so
      // the cookie never has a reason to travel on a cross-site request.
      sameSite: 'strict',
      path: '/',
      expires,
    };
  }

  private setCookies(response: Response, tokens: TokenPair): void {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const accessMinutes = Number(/^(\d+)m$/.exec(accessTtl)?.[1] ?? 15);
    response.cookie(
      ACCESS_COOKIE,
      tokens.accessToken,
      this.cookieOptions(new Date(Date.now() + accessMinutes * 60_000)),
    );
    response.cookie(
      REFRESH_COOKIE,
      tokens.refreshToken,
      this.cookieOptions(tokens.refreshExpiresAt),
    );
  }

  private clearCookies(response: Response): void {
    const base: CookieOptions = {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'strict',
      path: '/',
    };
    response.clearCookie(ACCESS_COOKIE, base);
    response.clearCookie(REFRESH_COOKIE, base);
  }
}
