import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bindBattalion, runAsBattalion } from './tenant-context';

export type PlatformActor = { battalionId: string; username: string; displayName: string };

export type PlatformBattalion = {
  id: string;
  name: string;
  number: string;
  createdAt: Date;
  userCount: number;
  adminCount: number;
  hasLogo: boolean;
};

/**
 * Finds which battalion a request belongs to when the request is not yet signed in — a username, a
 * refresh token's user, a setup link — and binds it. The answers come from SECURITY DEFINER functions that
 * return only an id, so the restricted role needs no way around row-level security to ask.
 *
 * An unknown username, user or link binds nothing: the request then sees no rows, and the caller's usual
 * "wrong credentials" path answers it exactly as before.
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async bindByUsername(username: string): Promise<void> {
    const [row] = await this.prisma.$queryRaw<{ id: string | null }[]>`SELECT battalion_of_username(${username}) AS id`;
    bindBattalion(row?.id ?? null);
  }

  async bindByUserId(userId: string): Promise<void> {
    const [row] = await this.prisma.$queryRaw<{ id: string | null }[]>`SELECT battalion_of_user(${userId}) AS id`;
    bindBattalion(row?.id ?? null);
  }

  async bindByInviteHash(tokenHash: string): Promise<void> {
    const [row] = await this.prisma.$queryRaw<{ id: string | null }[]>`SELECT battalion_of_invite(${tokenHash}) AS id`;
    bindBattalion(row?.id ?? null);
  }

  /**
   * The platform admin behind this user id, if there is a live one: their own battalion and name. Null for
   * anyone else, a stand-in, an inactive account — so a stand-in session dies the moment its owner does.
   */
  async usernameTaken(username: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ id: string | null }[]>`SELECT battalion_of_username(${username}) AS id`;
    return !!row?.id;
  }

  async platformActor(userId: string): Promise<PlatformActor | null> {
    const [row] = await this.prisma.$queryRaw<{ battalion_id: string; username: string; display_name: string }[]>`SELECT * FROM platform_actor(${userId})`;
    return row ? { battalionId: row.battalion_id, username: row.username, displayName: row.display_name } : null;
  }

  async listBattalions(): Promise<PlatformBattalion[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; number: string; created_at: Date; user_count: number; admin_count: number; has_logo: boolean }[]
    >`SELECT * FROM platform_battalions()`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      number: r.number,
      createdAt: r.created_at,
      userCount: r.user_count,
      adminCount: r.admin_count,
      hasLogo: r.has_logo,
    }));
  }

  /** Creates the battalion row and its 1008 counter; a duplicate number surfaces as a unique violation. */
  async createBattalion(name: string, number: string): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`SELECT create_battalion(${name}, ${number}) AS id`;
    if (!row) throw new Error('create_battalion returned nothing');
    return row.id;
  }

  async battalionIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT all_battalion_ids() AS id`;
    return rows.map((r) => r.id);
  }

  /** Runs a scheduled job once for every battalion, each in its own scope; one failing does not stop the rest. */
  async forEachBattalion(job: (battalionId: string) => Promise<void>, onError: (battalionId: string, error: unknown) => void): Promise<void> {
    for (const battalionId of await this.battalionIds()) {
      try {
        await runAsBattalion(battalionId, () => job(battalionId));
      } catch (error) {
        onError(battalionId, error);
      }
    }
  }
}
