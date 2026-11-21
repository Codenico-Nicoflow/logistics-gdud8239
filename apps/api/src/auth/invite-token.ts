import { createHash, randomBytes } from 'node:crypto';

/** How long a setup link works. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export const hashInviteToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * A new link's secret: 256 random bits, base64url. Only `tokenHash` is ever stored. Kept in a plain
 * module (no framework) so the operator script and the server make links the same way.
 */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}
