import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Tier } from '../common/throttle-tiers';
import { Roles } from './decorators/roles.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { CodeDto, EnforcementDto, PasswordDto, StepCodeDto, StepDto } from './dto/mfa.dto';
import { MfaService, type EnrolStart, type MfaStatus } from './mfa.service';
import { SessionCookies } from './session-cookies';
import type { AuthUser } from './auth.types';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly cookies: SessionCookies,
  ) {}

  // ---------- step 2 of sign-in (public: the person has a password proof, not a session yet) ----------

  @Public()
  @Tier('login')
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: StepCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.mfa.userForStepToken(dto.mfaToken);
    await this.mfa.verifyLogin(user.id, dto.code, request.ip);
    return { user: await this.signIn(user, request, response, 'authenticator app') };
  }

  /** First setup in the middle of signing in (a new account, or the app just became required). */
  @Public()
  @Tier('login')
  @Post('enrol/start')
  @HttpCode(HttpStatus.OK)
  async enrolStart(@Body() dto: StepDto): Promise<EnrolStart> {
    const user = await this.mfa.userForStepToken(dto.mfaToken);
    return this.mfa.enrolStart(user.id);
  }

  /** Confirms the app shows the right code, signs the person in, and hands over their backup codes once. */
  @Public()
  @Tier('login')
  @Post('enrol/confirm')
  @HttpCode(HttpStatus.OK)
  async enrolConfirm(
    @Body() dto: StepCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser; backupCodes: string[] }> {
    const user = await this.mfa.userForStepToken(dto.mfaToken);
    const backupCodes = await this.mfa.enrolConfirm(user.id, dto.code, request.ip);
    return { user: await this.signIn(user, request, response, 'authenticator app enrolled'), backupCodes };
  }

  private async signIn(user: AuthUser, request: Request, response: Response, detail: string): Promise<AuthUser> {
    await this.auth.finishSignIn(user.id, request.ip, detail);
    const tokens = await this.auth.issueTokens(user, { userAgent: request.headers['user-agent'], ip: request.ip });
    this.cookies.set(response, tokens);
    return user;
  }

  // ---------- the signed-in person's own settings ----------

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<MfaStatus> {
    return this.mfa.status(user.id);
  }

  @Tier('mfa')
  @Post('setup/start')
  @HttpCode(HttpStatus.OK)
  setupStart(@CurrentUser() user: AuthUser): Promise<EnrolStart> {
    return this.mfa.enrolStart(user.id);
  }

  @Tier('mfa')
  @Post('setup/confirm')
  @HttpCode(HttpStatus.OK)
  async setupConfirm(@CurrentUser() user: AuthUser, @Body() dto: CodeDto, @Req() request: Request): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.mfa.enrolConfirm(user.id, dto.code, request.ip) };
  }

  @Tier('mfa')
  @Post('backup-codes')
  @HttpCode(HttpStatus.OK)
  async backupCodes(@CurrentUser() user: AuthUser, @Body() dto: PasswordDto, @Req() request: Request): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.mfa.regenerateBackupCodes(user.id, dto.password, request.ip) };
  }

  @Tier('mfa')
  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(@CurrentUser() user: AuthUser, @Body() dto: PasswordDto, @Req() request: Request): Promise<void> {
    return this.mfa.disable(user.id, dto.password, request.ip);
  }

  // ---------- admin: the switches (super-admin enforced in the service) ----------

  @Roles('admin')
  @Get('overview')
  overview(): ReturnType<MfaService['overview']> {
    return this.mfa.overview();
  }

  @Roles('admin')
  @Tier('account')
  @Put('enforcement')
  @HttpCode(HttpStatus.NO_CONTENT)
  enforcement(@CurrentUser() user: AuthUser, @Body() dto: EnforcementDto): Promise<void> {
    return this.mfa.setEnforced(user.id, dto.enforced);
  }
}
