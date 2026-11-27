import { useBattalionQuery } from '../../lib/api';
import { Button } from '../../components/ui';
import { he } from '../../i18n/he';
import type { AuthUser } from '../../lib/types';
import { useActAs } from './useActAs';

/**
 * Shown on every screen while the platform operator is inside a battalion that is not their own, so a
 * change made there is never mistaken for one made at home. It sits above the page and does not scroll away.
 * On a wide screen the page scrolls inside a padded container, and a sticky element pins to that padding,
 * so the negative offset cancels it and keeps the bar flush with the top edge.
 */
export function ActingBanner({ user }: { user: AuthUser }) {
  const { data } = useBattalionQuery();
  const { actAs, isLoading } = useActAs();
  if (!user.actorId) return null;
  return (
    <div
      role="status"
      className="sticky top-[calc(3.5rem+var(--safe-top))] z-20 -mx-4 -mt-5 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-brass bg-brass-wash px-4 py-2 text-meta text-ink lg:-top-8 lg:-mx-8 lg:-mt-8 lg:px-8"
    >
      <span className="font-semibold">{he.platform.acting(data?.name ?? '')}</span>
      <Button size="sm" variant="quiet" disabled={isLoading} onClick={() => void actAs(user.homeBattalionId)}>
        {he.platform.backHome}
      </Button>
    </div>
  );
}
