import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { InvitesService } from '../auth/invites.service';
import { toAuthUser } from '../auth/auth-user';
import { buildSetupLink, type SetupLink } from '../auth/setup-link';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventsService, SecurityEventType } from '../security-events/security-events.service';
import { bindBattalion, runAsBattalion } from '../tenancy/tenant-context';
import { TenantService, type PlatformBattalion } from '../tenancy/tenant.service';
import type { AdminDto, CreateBattalionDto } from './dto/platform.dto';

const UNIQUE_VIOLATION = 'P2002';

const isUnique = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION;
// A raw function call surfaces a unique violation as a plain database error rather than a Prisma code.
const isRawUnique = (e: unknown): boolean => e instanceof Error && /unique|duplicate key|23505/i.test(e.message);

export type CreatedBattalion = { battalion: PlatformBattalion; admin: { id: string; username: string }; setup: SetupLink };

/**
 * What only the platform operator does: set up a battalion, and work inside one. Every method here is
 * reached through `@PlatformAdminOnly()`; the checks below are the second line, not the first.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly invites: InvitesService,
    private readonly events: SecurityEventsService,
    private readonly config: ConfigService,
  ) {}

  list(): Promise<PlatformBattalion[]> {
    return this.tenants.listBattalions();
  }

  /**
   * A battalion starts as a ready skeleton: its row, its own 1008 counter, and one admin who has not chosen a
   * password yet (a one-time setup link is returned, so nobody else ever knows it). No companies, no catalog.
   */
  async create(dto: CreateBattalionDto, actor: AuthUser): Promise<CreatedBattalion> {
    // Checked first so a taken username does not leave a battalion behind with nobody able to run it.
    if (await this.tenants.usernameTaken(dto.adminUsername)) throw new ConflictException('שם המשתמש כבר קיים');
    let id: string;
    try {
      id = await this.tenants.createBattalion(dto.name, dto.number);
    } catch (e) {
      if (isUnique(e) || isRawUnique(e)) throw new ConflictException(`כבר קיים גדוד עם המספר ${dto.number}`);
      throw e;
    }
    const { admin, setup } = await this.addAdmin(id, dto, actor);
    const battalion = (await this.tenants.listBattalions()).find((b) => b.id === id);
    if (!battalion) throw new NotFoundException('הגדוד לא נמצא');
    return { battalion, admin, setup };
  }

  /** Also the way back in when a battalion lost its only admin. */
  async addAdmin(
    battalionId: string,
    dto: AdminDto,
    actor: AuthUser,
  ): Promise<{ admin: { id: string; username: string }; setup: SetupLink }> {
    await this.requireBattalion(battalionId);
    if (await this.tenants.usernameTaken(dto.adminUsername)) throw new ConflictException('שם המשתמש כבר קיים');
    const actorId = actor.actorId ?? actor.id;
    return runAsBattalion(battalionId, async () => {
      let user: { id: string; username: string };
      try {
        // A super-admin of its own battalion: the one who then creates everyone else and the companies.
        user = await this.prisma.user.create({
          data: {
            username: dto.adminUsername,
            displayName: dto.adminDisplayName,
            role: 'admin',
            isSuperAdmin: true,
            passwordHash: null,
            mustSetup: true,
          },
          select: { id: true, username: true },
        });
      } catch (e) {
        if (isUnique(e)) throw new ConflictException('שם המשתמש כבר קיים');
        throw e;
      }
      const { token, expiresAt } = await this.invites.create(user.id, 'INVITE', null);
      await this.events.record(SecurityEventType.USER_CREATED, { userId: user.id, actorUserId: actorId, detail: 'admin (platform)' });
      await this.events.record(SecurityEventType.INVITE_CREATED, { userId: user.id, actorUserId: actorId, detail: 'INVITE' });
      return { admin: user, setup: buildSetupLink(this.config.get<string>('WEB_ORIGIN'), token, expiresAt) };
    });
  }

  /** The name is display only. The number is printed on forms and stays as it was created. */
  async rename(battalionId: string, name: string): Promise<PlatformBattalion> {
    await this.requireBattalion(battalionId);
    await runAsBattalion(battalionId, () => this.prisma.battalion.update({ where: { id: battalionId }, data: { name } }));
    return this.requireBattalion(battalionId);
  }

  /**
   * Switches the session into a battalion. A platform admin works inside another battalion through a hidden
   * stand-in account there (see the migration), so everything they do is recorded in that battalion under
   * their own name, and the database still shows them only that battalion's rows. Asking for their own
   * battalion gives back their real account.
   *
   * Rebinding the request to the target is deliberate and the one place a handler does it: the caller was
   * verified as a platform admin, and the next step (issuing the session) writes into the target.
   */
  async actAs(caller: AuthUser, targetId: string): Promise<AuthUser> {
    const realId = caller.actorId ?? caller.id;
    const home = await this.tenants.platformActor(realId);
    if (!home) throw new NotFoundException('הגדוד לא נמצא');
    const target = await this.requireBattalion(targetId);

    if (target.id === home.battalionId) {
      const real = await runAsBattalion(home.battalionId, () => this.prisma.user.findUniqueOrThrow({ where: { id: realId } }));
      bindBattalion(home.battalionId);
      return toAuthUser(real);
    }

    const standIn = await runAsBattalion(target.id, async () => {
      const mine = { actsForId: realId };
      const data = {
        displayName: home.displayName,
        role: 'admin' as const,
        isSuperAdmin: true,
        isPlatformAdmin: true,
        // They already passed their own authenticator step to get here; a stand-in has no second factor of its own.
        mfaExempt: true,
        isActive: true,
        mustSetup: false,
        passwordHash: null,
      };
      const existing = await this.prisma.user.findFirst({ where: mine });
      const user = existing
        ? await this.prisma.user.update({ where: { id: existing.id }, data })
        : await this.createStandIn(realId, target.number, data).catch(async (e: unknown) => {
            // Two switches racing: the other one made it first.
            if (!isUnique(e)) throw e;
            return this.prisma.user.findFirstOrThrow({ where: mine });
          });
      await this.events.record(SecurityEventType.ACT_AS, { userId: user.id, actorUserId: realId, detail: `from ${home.battalionId}` });
      return user;
    });
    bindBattalion(target.id);
    return { ...toAuthUser(standIn), homeBattalionId: home.battalionId };
  }

  private createStandIn(realId: string, number: string, data: Omit<Prisma.UserUncheckedCreateInput, 'username' | 'actsForId'>) {
    // Not guessable by the battalion's own admins, since a username is unique across the platform and a
    // chosen one could otherwise be used to block this account.
    return this.prisma.user.create({ data: { ...data, username: `actor:${realId}:${number}`, actsForId: realId } });
  }

  private async requireBattalion(id: string): Promise<PlatformBattalion> {
    const found = (await this.tenants.listBattalions()).find((b) => b.id === id);
    if (!found) throw new NotFoundException('הגדוד לא נמצא');
    return found;
  }
}
