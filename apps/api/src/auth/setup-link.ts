import { normalizeOrigin } from '../common/origin-check.middleware';

/** The one-time link, returned exactly once when it is created. */
export type SetupLink = { url: string; expiresAt: Date };

export function buildSetupLink(webOrigin: string | undefined, token: string, expiresAt: Date): SetupLink {
  const origin = normalizeOrigin(webOrigin ?? 'http://localhost:5173');
  return { url: `${origin}/setup/${token}`, expiresAt };
}
