/**
 * A struck-medallion mark, not a generic shield — a bordered disc with the
 * battalion's own number set into it like a stamped coin, three ascending
 * chevrons underneath for rank/unit character. Reads at 32px in the rail and
 * scales up cleanly for the login screen. Brass ring + brass numerals on a
 * field-green disc: the same two accents already used for serials (brass)
 * and issued/active state (field) elsewhere in the app, so the mark doesn't
 * introduce a third color language.
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="logoDisc" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="var(--field-bright)" />
          <stop offset="100%" stopColor="var(--field-dark)" />
        </radialGradient>
      </defs>
      <circle cx="22" cy="22" r="20.5" fill="url(#logoDisc)" stroke="var(--brass-bright)" strokeWidth="1.5" />
      <circle cx="22" cy="22" r="16.5" fill="none" stroke="var(--brass-bright)" strokeWidth="0.75" opacity="0.5" />
      <text
        x="22"
        y="21.5"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="800"
        fill="var(--brass-bright)"
        fontFamily="Assistant, system-ui, sans-serif"
        letterSpacing="-0.3"
      >
        8239
      </text>
      <path
        d="M13 27.5L22 32L31 27.5M14.5 31.5L22 35.5L29.5 31.5"
        fill="none"
        stroke="var(--brass-bright)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
