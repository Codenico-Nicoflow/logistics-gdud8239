import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHmac } from 'node:crypto';
import { normalizeOrigin } from '../common/origin-check.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import type { AuthUser } from './auth.types';

const CHALLENGE_TTL_MS = 5 * 60_000;
const STEP_TOKEN_TTL = '5m';
const RP_NAME = 'לוגיסטיקה גדוד 8239';

export type LoginStep = 'none' | 'passkey' | 'enroll';
type StepToken = { sub: string; typ: 'mfa'; iatMs: number };

export type PasskeySummary = {
  id: string;
  deviceName: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

const REFUSED = 'האימות נכשל. נסו שוב';

/**
 * Passkeys: the second step of sign-in. After the password, the person's own device (unlocked by
 * fingerprint, face or PIN) signs a fresh random challenge; the server holds only the PUBLIC key,
 * so a stolen database cannot be used to log in, and a fake login page cannot relay the proof
 * because the signature is bound to this site's address.
 */
@Injectable()
export class WebauthnService {
  private readonly logger = new Logger(WebauthnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly events: SecurityEventsService,
  ) {}

  /**
   * Read when a request arrives (not at boot) so the switch can be thrown from the Render dashboard
   * without a code change. While off, a passkey is optional: people who have one must use it, people
   * who don't log in as before. Turn it on only after enough admins have enrolled.
   */
  mfaEnforced(): boolean {
    return process.env.MFA_ENFORCED === 'true';
  }

  /**
   * The address passkeys are bound to. A credential made for one site address cannot be used on
   * another, so changing the app's address later means everyone enrols again (an admin sends setup
   * links). Defaults to the web origin the app is already configured with.
   */
  private rp(): { origin: string; rpID: string } {
    const origin = normalizeOrigin(
      process.env.WEBAUTHN_ORIGIN ?? this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173',
    );
    return { origin, rpID: process.env.WEBAUTHN_RP_ID ?? new URL(origin).hostname };
  }

  // ---------- the step between password and session ----------

  /** What a person who just proved their password must still do before getting a session. */
  async stepFor(userId: string): Promise<LoginStep> {
    const count = await this.prisma.webauthnCredential.count({ where: { userId } });
    if (count > 0) return 'passkey';
    return this.mfaEnforced() ? 'enroll' : 'none';
  }

  /** A token that proves only "this person passed the password step in the last five minutes". */
  async signStepToken(userId: string): Promise<string> {
    const payload: StepToken = { sub: userId, typ: 'mfa', iatMs: Date.now() };
    return this.jwt.signAsync(payload, { secret: this.stepSecret(), expiresIn: STEP_TOKEN_TTL });
  }

  /**
   * Resolves a step token to the user it is for — and refuses it if the account changed in between
   * (deactivated, a setup link issued, locked): the password proof is only as fresh as the account.
   */
  async userForStepToken(token: string): Promise<AuthUser> {
    let payload: StepToken;
    try {
      payload = await this.jwt.verifyAsync<StepToken>(token, { secret: this.stepSecret() });
    } catch {
      throw new UnauthorizedException(REFUSED);
    }
    if (payload.typ !== 'mfa') throw new UnauthorizedException(REFUSED);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const changed = !!user?.passwordChangedAt && payload.iatMs < user.passwordChangedAt.getTime();
    if (!user || !user.isActive || user.mustSetup || locked || changed) throw new UnauthorizedException(REFUSED);

    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role, companyScope: user.companyScope };
  }

  /** Its own key, derived from the access secret, so a step token can never be accepted as an access token. */
  private stepSecret(): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET')).update('logistics-mfa-step').digest('hex');
  }

  // ---------- registering a device ----------

  async registrationOptions(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await this.prisma.webauthnCredential.findMany({ where: { userId } });
    const { rpID } = this.rp();

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.username,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      // A device already enrolled is excluded, so the same phone is not added twice.
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
      // Fingerprint / face / PIN must actually have been checked on the device.
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await this.storeChallenge(userId, 'register', options.challenge);
    return options;
  }

  async finishRegistration(userId: string, response: RegistrationResponseJSON, deviceName: string): Promise<PasskeySummary> {
    const expectedChallenge = await this.takeChallenge(userId, 'register');
    const { origin, rpID } = this.rp();

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      this.logger.warn(`Passkey registration refused for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      throw new UnauthorizedException(REFUSED);
    }
    if (!verification.verified || !verification.registrationInfo) throw new UnauthorizedException(REFUSED);

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    try {
      const saved = await this.prisma.webauthnCredential.create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports ?? [],
          deviceName: deviceName.trim().slice(0, 60) || 'מכשיר',
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
        },
      });
      await this.events.record(SecurityEventType.PASSKEY_ADDED, { userId, actorUserId: userId, detail: saved.deviceName });
      return this.summary(saved);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('המכשיר הזה כבר רשום');
      }
      throw e;
    }
  }

  // ---------- using a device ----------

  async authenticationOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.prisma.webauthnCredential.findMany({ where: { userId } });
    const { rpID } = this.rp();
    const options = await generateAuthenticationOptions({
      rpID,
      // Only THIS person's devices are offered: several accounts can share one computer.
      allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports })),
      userVerification: 'required',
    });
    await this.storeChallenge(userId, 'authenticate', options.challenge);
    return options;
  }

  /** Verifies the device's signature. Throws if anything is off; returns normally only on success. */
  async finishAuthentication(userId: string, response: AuthenticationResponseJSON, ip?: string): Promise<void> {
    const fail = async (reason: string): Promise<never> => {
      await this.events.record(SecurityEventType.LOGIN_FAILED, { userId, ip, detail: `passkey: ${reason}` });
      throw new UnauthorizedException(REFUSED);
    };

    const expectedChallenge = await this.takeChallenge(userId, 'authenticate').catch(() => null);
    if (!expectedChallenge) return fail('no challenge');

    const stored = await this.prisma.webauthnCredential.findFirst({ where: { userId, credentialId: response.id } });
    if (!stored) return fail('unknown device');

    const { origin, rpID } = this.rp();
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(stored.publicKey),
          counter: stored.counter,
          transports: stored.transports,
        },
      });
      if (!verification.verified) return fail('not verified');

      await this.prisma.webauthnCredential.update({
        where: { id: stored.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
          backedUp: verification.authenticationInfo.credentialBackedUp,
        },
      });
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      this.logger.warn(`Passkey sign-in refused for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      return fail('invalid response');
    }
  }

  // ---------- the person's own devices ----------

  async list(userId: string): Promise<PasskeySummary[]> {
    const rows = await this.prisma.webauthnCredential.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.summary(r));
  }

  async remove(userId: string, id: string): Promise<void> {
    const mine = await this.prisma.webauthnCredential.findFirst({ where: { id, userId } });
    if (!mine) throw new UnauthorizedException(REFUSED);
    // While passkeys are required, removing the last one would lock the person out of their own account.
    if (this.mfaEnforced() && (await this.prisma.webauthnCredential.count({ where: { userId } })) <= 1) {
      throw new ConflictException('אי אפשר להסיר את המכשיר האחרון. הוסיפו קודם מכשיר אחר');
    }
    await this.prisma.webauthnCredential.delete({ where: { id } });
    await this.events.record(SecurityEventType.PASSKEY_REMOVED, { userId, actorUserId: userId, detail: mine.deviceName });
  }

  // ---------- challenges ----------

  private async storeChallenge(userId: string, purpose: 'register' | 'authenticate', challenge: string): Promise<void> {
    // Only the latest challenge of each kind is live.
    await this.prisma.$transaction([
      this.prisma.webauthnChallenge.deleteMany({ where: { userId, purpose } }),
      this.prisma.webauthnChallenge.create({ data: { userId, purpose, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) } }),
    ]);
  }

  /** Single use: removed whether or not what follows succeeds, so a challenge can never be tried twice. */
  private async takeChallenge(userId: string, purpose: 'register' | 'authenticate'): Promise<string> {
    const found = await this.prisma.webauthnChallenge.findFirst({
      where: { userId, purpose, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });
    await this.prisma.webauthnChallenge.deleteMany({ where: { userId, purpose } });
    if (!found) throw new UnauthorizedException('פג תוקף הבקשה. נסו שוב');
    return found.challenge;
  }

  private summary(row: { id: string; deviceName: string; deviceType: string | null; backedUp: boolean; createdAt: Date; lastUsedAt: Date | null }): PasskeySummary {
    return { id: row.id, deviceName: row.deviceName, deviceType: row.deviceType, backedUp: row.backedUp, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt };
  }
}
