import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which battalion the code running right now is acting for. The database enforces it (row-level security,
 * see docs/feat-mt-isolation.md); this only carries the answer from the login token to the connection.
 *
 * It is a mutable box rather than a plain value on purpose: the guard that reads the token runs INSIDE the
 * request, after the box was created, and a value set by an async function would not survive the `await`
 * back to its caller. Mutating the box does.
 */
export type TenantBox = { battalionId: string | null };

const storage = new AsyncLocalStorage<TenantBox>();

/** Starts a request with no battalion yet. Everything downstream sees an empty tenant until one is bound. */
export function runInRequest<T>(fn: () => T): T {
  return storage.run({ battalionId: null }, fn);
}

/**
 * Runs `fn` for one battalion — a scheduled job, a script, a test. Nothing leaks out of the callback.
 *
 * A Prisma query is lazy: it starts when it is awaited, not when it is built. Returned as-is from the
 * callback it would be awaited by the caller, outside this scope, and run for nobody. A thenable result is
 * therefore awaited here, inside the scope.
 */
export function runAsBattalion<T>(battalionId: string, fn: () => T): T {
  return storage.run({ battalionId }, () => {
    const result = fn();
    return isThenable(result) ? (settle(result) as T) : result;
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

async function settle(value: PromiseLike<unknown>): Promise<unknown> {
  return value;
}

/** True once code is running inside a request or `runAsBattalion`, even before a battalion is bound. */
export function hasTenantScope(): boolean {
  return storage.getStore() !== undefined;
}

/** The battalion of the current request, or null if none was bound (the database then shows nothing). */
export function currentBattalionId(): string | null {
  return storage.getStore()?.battalionId ?? null;
}

/**
 * Binds the current request to a battalion. Only the authentication paths call this (the token guard, the
 * login, refresh and setup-link lookups); a handler must never choose a battalion from request input.
 */
export function bindBattalion(battalionId: string | null): void {
  const box = storage.getStore();
  if (!box) throw new Error('bindBattalion called outside a request or runAsBattalion scope');
  box.battalionId = battalionId;
}
