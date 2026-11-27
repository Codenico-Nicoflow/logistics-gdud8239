import { useBattalionQuery } from '../lib/api';
import { Logo } from './Logo';

/**
 * The signed-in battalion's mark: its uploaded logo when it has one, otherwise the medallion engraved with
 * its own number. Auth rides on a same-origin cookie, so the picture is a plain `<img>`; the version in the
 * address changes with the file, which is what lets the browser cache it for good.
 */
export function BattalionMark({ className = 'h-9 w-9', animated = true }: { className?: string; animated?: boolean }) {
  const { data } = useBattalionQuery();
  // A blank of the same size until the battalion is known, so the header does not jump or flash another unit's mark.
  if (!data) return <span aria-hidden="true" className={`${className} inline-block shrink-0`} />;
  if (data.hasLogo) {
    return (
      <img
        src={`/api/battalion/logo?v=${data.logoVersion}`}
        alt=""
        className={`${className} shrink-0 rounded-full bg-white/95 object-contain p-0.5 ring-2 ring-brass-bright/70`}
      />
    );
  }
  return <Logo className={className} animated={animated} number={data.number} />;
}
