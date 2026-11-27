import { currentBattalionId } from '../tenancy/tenant-context';

/** גדוד 8239, the battalion every deployment already has (fixed in the foundation migration). */
export const HOME_BATTALION_ID = '00000000-0000-4000-8000-000000008239';

/**
 * Until each battalion has its own Slack configuration (step 6), the one bot token and channel IDs in the
 * environment belong to 8239. Any other battalion must never post through them — its data would land in
 * 8239's channels. Nothing falls back: a battalion with no configuration simply has no Slack.
 */
export function slackAllowedHere(): boolean {
  return currentBattalionId() === HOME_BATTALION_ID;
}
