import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { HOME_BATTALION_ID } from '../common/slack-bridge';
import { TenantPool } from './tenant-pool';

/**
 * A Prisma client for a command-line script, connected as the database OWNER and bound to ONE battalion
 * (8239 unless told otherwise). A script has no login token to name a battalion, and a create with none
 * is refused, so the battalion is stated here, once, rather than left to a default.
 */
export function scriptPrisma(connectionString: string, battalionId: string = HOME_BATTALION_ID): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(new TenantPool({ connectionString, fixedBattalionId: battalionId }), { disposeExternalPool: true }),
  });
}
