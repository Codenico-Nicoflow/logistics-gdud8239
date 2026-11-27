import { useSlackQuery } from '../../lib/api';
import type { SlackKind, SlackOverview } from '../../lib/types';

/**
 * Whether a send to Slack can go anywhere for this battalion, so a screen hides the button instead of
 * offering one that can only fail. While the answer is unknown the button stays: the server refuses a send
 * that cannot happen, and a slow read must not hide what works.
 */
export function useSlack(): { isConfigured: (kind: SlackKind) => boolean; overview: SlackOverview | undefined; isLoading: boolean } {
  const { data, isLoading } = useSlackQuery();
  return { isConfigured: (kind) => (data ? data.configured[kind] : true), overview: data, isLoading };
}
