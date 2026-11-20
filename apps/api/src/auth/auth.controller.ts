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
import { SkipThrottle } from '@nestjs/throttler';
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

  /**
   * Tight limit: this is the one route where guessing is the attack. Only the
   * named `login` bucket applies — leaving the `default` bucket active too would
   * make both counters decrement and lock the route after a single attempt.
   */
  @Public()
  @SkipThrottle({ default: true })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.auth.validateCredentials(dto.username, dto.password);
    const tokens = await this.auth.issueTokens(user, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    this.setCookies(response, tokens);
    return { user };
  }

  @Public()
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

  @Get('me')
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }

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
      sameSite: 'lax',
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
      sameSite: 'lax',
      path: '/',
    };
    response.clearCookie(ACCESS_COOKIE, base);
    response.clearCookie(REFRESH_COOKIE, base);
  }
}
