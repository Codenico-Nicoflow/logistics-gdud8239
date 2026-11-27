import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bindBattalion, runAsBattalion } from './tenant-context';

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
