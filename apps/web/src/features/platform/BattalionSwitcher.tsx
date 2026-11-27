import { usePlatformBattalionsQuery } from '../../lib/api';
import { he } from '../../i18n/he';
import type { AuthUser } from '../../lib/types';
import { useActAs } from './useActAs';

/** The platform operator's way into any battalion, from anywhere. Nobody else is offered it. */
export function BattalionSwitcher({ user }: { user: AuthUser }) {
  const { data } = usePlatformBattalionsQuery(undefined, { skip: !user.isPlatformAdmin });
  const { actAs, isLoading } = useActAs();
  if (!user.isPlatformAdmin || !data || data.length < 2) return null;
  return (
    <label className="mb-3 block">
      <span className="mb-1 block px-1 text-micro font-semibold tracking-wide text-white/40">{he.platform.switchLabel}</span>
      <select
        value={user.battalionId}
        disabled={isLoading}
        onChange={(e) => void actAs(e.target.value)}
        className="liquid-glass h-11 w-full appearance-none rounded-ctl px-3 text-body text-white focus:outline-none disabled:opacity-60"
      >
        {data.map((b) => (
          <option key={b.id} value={b.id} className="text-ink">
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
