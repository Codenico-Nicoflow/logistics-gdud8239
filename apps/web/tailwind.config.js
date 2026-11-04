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
          gear: 'var(--cat-gear)',
          'gear-wash': 'var(--cat-gear-wash)',
        },
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px' }],
        meta: ['12px', { lineHeight: '16px' }],
        body: ['15px', { lineHeight: '22px' }],
        lead: ['17px', { lineHeight: '24px' }],
        head: ['21px', { lineHeight: '28px' }],
        display: ['30px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        figure: ['36px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        ctl: '4px',
        panel: '8px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(22, 33, 29, 0.06), 0 1px 3px rgba(22, 33, 29, 0.04)',
        lift: '0 12px 32px rgba(22, 33, 29, 0.16)',
      },
    },
  },
  plugins: [],
};
