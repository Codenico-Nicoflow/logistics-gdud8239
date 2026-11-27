import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TenantPool } from '../tenancy/tenant-pool';
import { rlsProblems, type RlsFacts } from './rls-check';

/**
 * The application's database client. It connects as the restricted `logistics_app` role
 * (`APP_DATABASE_URL`), never as the owner, so the database itself keeps each battalion to its own rows.
 * `DATABASE_URL` is the owner, used only for migrations, pg_dump and scripts.
 *
 * `TENANT_FALLBACK_BATTALION_ID` serves one battalion to code that runs outside any request or job scope.
 * It exists for the test suite and is refused in production by the env validation.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('APP_DATABASE_URL is not set');
    }
    const pool = new TenantPool({ connectionString, fallbackBattalionId: process.env.TENANT_FALLBACK_BATTALION_ID || undefined });
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    const problems = rlsProblems(await this.readRlsFacts());
    if (problems.length > 0) {
      throw new Error(
        `Refusing to start: the database connection is not tenant-safe. ${problems.join('; ')}. ` +
          'Point APP_DATABASE_URL at the restricted role (see docs/feat-mt-isolation.md).',
      );
    }
    this.logger.log('Database connection is subject to row-level security');
  }

  private async readRlsFacts(): Promise<RlsFacts> {
    const [who] = await this.$queryRaw<{ role: string; superuser: boolean; bypass: boolean }[]>`
      SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolbypassrls AS bypass
      FROM pg_roles r WHERE r.rolname = current_user`;
    const owned = await this.$queryRaw<{ name: string }[]>`
      SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
    const unprotected = await this.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'battalion_id' AND NOT a.attisdropped
      WHERE c.relkind = 'r' AND c.relname <> 'battalions' AND NOT c.relrowsecurity`;
    return {
      role: who?.role ?? 'unknown',
      superuser: who?.superuser ?? true,
      bypassRls: who?.bypass ?? true,
      ownedTables: owned.map((r) => r.name),
      unprotectedTables: unprotected.map((r) => r.name),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
