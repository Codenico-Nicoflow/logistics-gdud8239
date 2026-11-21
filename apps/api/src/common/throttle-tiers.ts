import type { ExecutionContext } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { REFRESH_COOKIE } from '../auth/auth.constants';

/**
 * Throttle tiers are opt-in per route. A named throttler in `ThrottlerModule` applies to
 * every route by default, so each tier's `skipIf` checks this metadata and stays out of the
 * way unless the handler asked for it — otherwise a 10/min export budget would be spent by
 * ordinary page loads.
 */
export type ThrottleTier =
  | 'login' // login attempts, per IP
  | 'loginHour' // the hourly cap on the same
  | 'authIp' // other anonymous auth routes (refresh, logout), per IP
  | 'account' // password changes, per user
  | 'mfa' // setting up / switching off the authenticator app, per user
  | 'heavy' // whole-database exports, file downloads, posts to Slack, per user
  | 'print' // single-document print pages, per user (many in a row on a signing day)
  | 'heavyCreate'; // routes that spawn pg_dump or build a workbook, per user

export const THROTTLE_TIER_KEY = 'throttleTier';

export const Tier = (...tiers: ThrottleTier[]) => SetMetadata(THROTTLE_TIER_KEY, tiers);

export function tiersOf(context: ExecutionContext): readonly ThrottleTier[] {
  const handler = Reflect.getMetadata(THROTTLE_TIER_KEY, context.getHandler()) as ThrottleTier[] | undefined;
  const klass = Reflect.getMetadata(THROTTLE_TIER_KEY, context.getClass()) as ThrottleTier[] | undefined;
  return handler ?? klass ?? [];
}

/** `skipIf` for a tier: skipped unless the route opted in (and always skipped when limits are disabled for tests). */
export function onlyForTier(tier: ThrottleTier): (context: ExecutionContext) => boolean {
  return (context) => process.env.DISABLE_RATE_LIMIT === 'true' || !tiersOf(context).includes(tier);
}

/** A per-minute limit that can be raised or lowered from the environment without a deploy of code. */
export function perMinute(envKey: string, fallback: number): number {
  const value = Number(process.env[envKey]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** The caller's address only — used where a cookie must not be able to pick the bucket. */
export function ipTracker(req: Record<string, unknown>): string {
  return (req.ip as string) ?? 'anonymous';
}

/**
 * Who a request counts against. The whole unit shares ONE network address (poor connectivity on
 * base), so an address is the worst possible identity: one busy morning would spend everyone's
 * budget at once. So: the logged-in user when there is one; else the session, identified by a
 * hash of its refresh cookie (so `refresh` is limited per session, not per building); else the
 * address, which only ever applies to traffic that has no identity at all.
 */
export function trackerOf(req: Record<string, unknown>): string {
  const user = req.user as { id?: string } | undefined;
  if (user?.id) return user.id;
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const refresh = cookies?.[REFRESH_COOKIE];
  if (refresh) return `session:${createHash('sha256').update(refresh).digest('hex').slice(0, 24)}`;
  return ipTracker(req);
}
