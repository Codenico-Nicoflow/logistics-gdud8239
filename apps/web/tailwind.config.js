/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Assistant', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: 'var(--ink)', soft: 'var(--ink-soft)' },
        graphite: 'var(--graphite)',
        card: { DEFAULT: 'var(--card)', raised: 'var(--card-raised)' },
        rule: { DEFAULT: 'var(--rule)', strong: 'var(--rule-strong)' },
        field: {
          DEFAULT: 'var(--field)',
          dark: 'var(--field-dark)',
          bright: 'var(--field-bright)',
          wash: 'var(--field-wash)',
        },
        oxide: { DEFAULT: 'var(--oxide)', wash: 'var(--oxide-wash)' },
        brass: {
          DEFAULT: 'var(--brass)',
          bright: 'var(--brass-bright)',
          wash: 'var(--brass-wash)',
        },
        cat: {
          weapon: 'var(--cat-weapon)',
          'weapon-wash': 'var(--cat-weapon-wash)',
          optics: 'var(--cat-optics)',
          'optics-wash': 'var(--cat-optics-wash)',
          drone: 'var(--cat-drone)',
          'drone-wash': 'var(--cat-drone-wash)',
          accessory: 'var(--cat-accessory)',
          'accessory-wash': 'var(--cat-accessory-wash)',
          gear: 'var(--cat-gear)',
          'gear-wash': 'var(--cat-gear-wash)',
          ammo: 'var(--cat-ammo)',
          'ammo-wash': 'var(--cat-ammo-wash)',
        },
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px' }],
        meta: ['12px', { lineHeight: '16px' }],
        body: ['15px', { lineHeight: '22px' }],
        lead: ['17px', { lineHeight: '24px' }],
        head: ['21px', { lineHeight: '28px' }],
        // Mobile-first: text-display is used for every page's <h1>, so it
        // shrinks below sm by default instead of forcing every page to add
        // its own responsive classes. See CLAUDE.md's mobile principle.
        display: ['24px', { lineHeight: '30px', letterSpacing: '-0.01em' }],
        figure: ['36px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        ctl: '10px',
        panel: '16px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(22, 33, 29, 0.05), 0 8px 24px -12px rgba(31, 74, 57, 0.22)',
        lift: '0 24px 60px -16px rgba(15, 26, 22, 0.5)',
        // A faint inward shadow so form controls read as a recessed well
        // rather than a flat box with a line around it.
        'inset-field': 'inset 0 1px 2px rgba(22, 33, 29, 0.05)',
      },
    },
  },
  plugins: [],
};
