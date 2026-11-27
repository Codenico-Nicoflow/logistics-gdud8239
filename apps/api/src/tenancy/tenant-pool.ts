import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { currentBattalionId, hasTenantScope } from './tenant-context';

/** The Postgres setting every row-level-security policy compares `battalion_id` against. */
export const TENANT_SETTING = 'app.battalion_id';

export type TenantPoolOptions = PoolConfig & {
  /** Serve this battalion whenever no request or job scope says otherwise. Scripts and tests only. */
  fallbackBattalionId?: string;
  /** Always serve this battalion, ignoring any scope (a script bound to one battalion). */
  fixedBattalionId?: string;
};

type Done = (release?: boolean | Error) => void;
type ConnectCallback = (err: Error | undefined, client: PoolClient | undefined, done: Done) => void;

/**
 * A connection pool that tells Postgres which battalion each connection is for, every single time one is
 * handed out. Prisma talks to Postgres only through this pool, so one hook covers every kind of query:
 * plain reads, interactive transactions, batch transactions and raw SQL — which a per-query Prisma
 * extension cannot reach.
 *
 * The setting is written on EVERY checkout, with an empty value when there is no battalion, so a
 * connection never carries the previous request's battalion into the next one.
 *
 * The battalion is read when `connect` is CALLED, not when a connection becomes free: with the pool busy a
 * request waits in a queue and is served from whichever request released a connection, whose context is a
 * different one.
 */
export class TenantPool extends Pool {
  private readonly fallback: string | undefined;
  private readonly fixed: string | undefined;

  constructor(options: TenantPoolOptions) {
    const { fallbackBattalionId, fixedBattalionId, ...config } = options;
    super(config);
    this.fallback = fallbackBattalionId;
    this.fixed = fixedBattalionId;
  }

  private tenantNow(): string {
    if (this.fixed) return this.fixed;
    const bound = currentBattalionId();
    if (bound) return bound;
    // Inside a request an unbound tenant means "nobody": only code running with no scope at all falls back.
    if (hasTenantScope()) return '';
    return this.fallback ?? '';
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    const battalionId = this.tenantNow();
    const tell = (client: PoolClient): Promise<unknown> =>
      client.query('SELECT set_config($1, $2, false)', [TENANT_SETTING, battalionId]);

    if (callback) {
      super.connect((err, client, done) => {
        if (err || !client) return callback(err, client, done);
        tell(client).then(
          () => callback(undefined, client, done),
          (failure: unknown) => {
            const error = failure instanceof Error ? failure : new Error(String(failure));
            client.release(error);
            callback(error, undefined, () => undefined);
          },
        );
      });
      return;
    }
    return super.connect().then(async (client) => {
      try {
        await tell(client);
      } catch (failure) {
        client.release(failure instanceof Error ? failure : new Error(String(failure)));
        throw failure;
      }
      return client;
    });
  }
}
