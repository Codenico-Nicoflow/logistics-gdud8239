import { useId } from 'react';

/**
 * A struck brass medallion: a beveled ring, the battalion number engraved into a field-green disc, and
 * three ascending chevrons. The motion is the stamping of metal, not decoration: the chevrons are drawn
 * once when the mark first appears, and every few seconds light crosses the ring the way it catches a
 * coin turned in the hand (`animated`). Brass and field-green are the two accents the app already uses
 * for serials and issued state, so the mark adds no third colour. Reads at 32px in the rail and scales
 * up for the login screen.
 */
export function Logo({ className = 'h-9 w-9', animated = true }: { className?: string; animated?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const disc = `logo-disc-${uid}`;
  const ring = `logo-ring-${uid}`;
  const glint = `logo-glint-${uid}`;
  const clip = `logo-clip-${uid}`;
  return (
    <svg viewBox="0 0 44 44" className={`${className} ${animated ? 'logo-animated' : ''}`} aria-hidden="true">
      <defs>
        <radialGradient id={disc} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="var(--field-bright)" />
          <stop offset="100%" stopColor="var(--field-dark)" />
        </radialGradient>
        {/* Light falls from the top corner; the lower edge of the ring is in shade. */}
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3d98a" />
          <stop offset="45%" stopColor="var(--brass-bright)" />
          <stop offset="100%" stopColor="var(--brass)" />
        </linearGradient>
        <linearGradient id={glint} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="22" cy="22" r="21" />
        </clipPath>
      </defs>

      <circle cx="22" cy="22" r="21" fill={`url(#${ring})`} />
      <circle cx="22" cy="22" r="18.6" fill={`url(#${disc})`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
      <circle cx="22" cy="22" r="16" fill="none" stroke="var(--brass-bright)" strokeWidth="0.6" opacity="0.45" />

      {/* Engraved: a dark offset copy under the brass one reads as a cut into the disc. */}
      <g fontFamily="Assistant, system-ui, sans-serif" fontSize="12.5" fontWeight="800" letterSpacing="-0.3" textAnchor="middle">
        <text x="22" y="22.3" fill="rgba(0,0,0,0.45)">
          8239
        </text>
        <text x="22" y="21.5" fill="var(--brass-bright)">
          8239
        </text>
      </g>

      <g fill="none" stroke="var(--brass-bright)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path className="logo-chevron logo-chevron-1" d="M14.5 31.5L22 35.5L29.5 31.5" pathLength="1" />
        <path className="logo-chevron logo-chevron-2" d="M13 27.5L22 32L31 27.5" pathLength="1" />
      </g>

      {animated && (
        <g clipPath={`url(#${clip})`}>
          <g transform="skewX(-18)">
            <rect className="logo-glint" x="-20" y="-4" width="14" height="52" fill={`url(#${glint})`} />
          </g>
        </g>
      )}
    </svg>
  );
}
