import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { Tier } from '../common/throttle-tiers';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthenticateVerifyDto, RegisterVerifyDto, RegisterVerifyWithStepDto, StepDto } from './dto/webauthn.dto';
import { SessionCookies } from './session-cookies';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { WebauthnService, type PasskeySummary } from './webauthn.service';
import type { AuthUser } from './auth.types';

/** A real WebAuthn response is a couple of kilobytes; anything far larger is not one. */
const MAX_RESPONSE_JSON = 30_000;
const tooBig = (value: unknown): boolean => JSON.stringify(value).length > MAX_RESPONSE_JSON;

@Controller('auth')
export class WebauthnController {
  constructor(
    private readonly auth: AuthService,
    private readonly webauthn: WebauthnService,
    private readonly cookies: SessionCookies,
    private readonly events: SecurityEventsService,
  ) {}

  // ---------- step 2 of sign-in (public: the person has a password proof, not a session yet) ----------

  @Public()
  @Tier('login')
  @Post('webauthn/authenticate/options')
  @HttpCode(HttpStatus.OK)
  async authenticateOptions(@Body() dto: StepDto): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const user = await this.webauthn.userForStepToken(dto.mfaToken);
    return this.webauthn.authenticationOptions(user.id);
  }

  @Public()
  @Tier('login')
  @Post('webauthn/authenticate/verify')
  @HttpCode(HttpStatus.OK)
  async authenticateVerify(
    @Body() dto: AuthenticateVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    if (tooBig(dto.response)) throw new BadRequestException('בקשה לא תקינה');
    const user = await this.webauthn.userForStepToken(dto.mfaToken);
    await this.webauthn.finishAuthentication(user.id, dto.response, request.ip);

    const tokens = await this.auth.issueTokens(user, { userAgent: request.headers['user-agent'], ip: request.ip });
    this.cookies.set(response, tokens);
    await this.events.record(SecurityEventType.LOGIN_SUCCESS, { userId: user.id, ip: request.ip, detail: 'passkey' });
    return { user };
  }

  /** First device, enrolled in the middle of signing in (a new account, or passkeys just became required). */
  @Public()
  @Tier('login')
  @Post('webauthn/register/options')
  @HttpCode(HttpStatus.OK)
  async enrolOptions(@Body() dto: StepDto): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.webauthn.userForStepToken(dto.mfaToken);
    return this.webauthn.registrationOptions(user.id);
  }

  @Public()
  @Tier('login')
  @Post('webauthn/register/verify')
  @HttpCode(HttpStatus.OK)
  async enrolVerify(
    @Body() dto: RegisterVerifyWithStepDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    if (tooBig(dto.response)) throw new BadRequestException('בקשה לא תקינה');
    const user = await this.webauthn.userForStepToken(dto.mfaToken);
    await this.webauthn.finishRegistration(user.id, dto.response, dto.deviceName ?? '');

    const tokens = await this.auth.issueTokens(user, { userAgent: request.headers['user-agent'], ip: request.ip });
    this.cookies.set(response, tokens);
    await this.events.record(SecurityEventType.LOGIN_SUCCESS, { userId: user.id, ip: request.ip, detail: 'passkey enrolled' });
    return { user };
  }

  // ---------- the signed-in person's own devices ----------

  @Get('passkeys')
  list(@CurrentUser() user: AuthUser): Promise<PasskeySummary[]> {
    return this.webauthn.list(user.id);
  }

  @Tier('device')
  @Post('passkeys/register/options')
  @HttpCode(HttpStatus.OK)
  addOptions(@CurrentUser() user: AuthUser): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.webauthn.registrationOptions(user.id);
  }

  @Tier('device')
  @Post('passkeys/register/verify')
  @HttpCode(HttpStatus.OK)
  async addVerify(@CurrentUser() user: AuthUser, @Body() dto: RegisterVerifyDto): Promise<PasskeySummary> {
    if (tooBig(dto.response)) throw new BadRequestException('בקשה לא תקינה');
    return this.webauthn.finishRegistration(user.id, dto.response, dto.deviceName ?? '');
  }

  @Tier('device')
  @Delete('passkeys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.webauthn.remove(user.id, id);
  }
}
