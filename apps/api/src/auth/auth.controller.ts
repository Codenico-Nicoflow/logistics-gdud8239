import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tier } from '../common/throttle-tiers';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type TokenPair } from './auth.service';
import { InvitesService } from './invites.service';
import { SessionCookies } from './session-cookies';
import { WebauthnService } from './webauthn.service';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { REFRESH_COOKIE } from './auth.constants';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { AuthUser } from './auth.types';

/** Either a finished sign-in, or the next step still owed (with the token that proves the password step). */
export type LoginResult = { user: AuthUser } | { step: 'passkey' | 'enroll'; mfaToken: string };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invites: InvitesService,
    private readonly config: ConfigService,
    private readonly cookies: SessionCookies,
    private readonly webauthn: WebauthnService,
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
  ): Promise<LoginResult> {
    const user = await this.auth.validateCredentials(dto.username, dto.password, request.ip);

    // The password is only the first proof. A person with a passkey (or anyone, once passkeys are
    // required) gets no session yet — just a five-minute token good for the second step.
    const step = await this.webauthn.stepFor(user.id);
    if (step !== 'none') return { step, mfaToken: await this.webauthn.signStepToken(user.id) };

    const tokens = await this.auth.issueTokens(user, { userAgent: request.headers['user-agent'], ip: request.ip });
    this.cookies.set(response, tokens);
    return { user };
  }

  /**
   * The setup page asks this before showing the form. An invalid, used or expired link all answer
   * the same 404, so the endpoint cannot be used to learn which links ever existed.
   */
  @Public()
  @Tier('login')
  @Get('setup/:token')
  async describeSetup(@Param('token') token: string): Promise<{ username: string; displayName: string; kind: string }> {
    const invite = await this.invites.describe(token);
    if (!invite) throw new NotFoundException('הקישור אינו תקף או שפג תוקפו');
    return invite;
  }

  /** The person chooses their own password and is signed in. */
  @Public()
  @Tier('login')
  @Post('setup/:token')
  @HttpCode(HttpStatus.OK)
  async completeSetup(
    @Param('token') token: string,
    @Body() dto: SetupPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResult> {
    const user = await this.invites.complete(token, dto.password, request.ip);

    // Same rule as login: a person who still owes the second step does not get a session from the
    // password they just chose.
    const step = await this.webauthn.stepFor(user.id);
    if (step !== 'none') return { step, mfaToken: await this.webauthn.signStepToken(user.id) };

    const tokens = await this.auth.issueTokens(user, { userAgent: request.headers['user-agent'], ip: request.ip });
    this.cookies.set(response, tokens);
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
    this.cookies.set(response, tokens);
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
    this.cookies.clear(response);
    return { ok: true };
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
    this.cookies.clear(response);
    return { ok: true };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }
}
