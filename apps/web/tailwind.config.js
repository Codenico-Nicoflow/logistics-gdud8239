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
        field: { DEFAULT: 'var(--field)', dark: 'var(--field-dark)', wash: 'var(--field-wash)' },
        oxide: { DEFAULT: 'var(--oxide)', wash: 'var(--oxide-wash)' },
        brass: { DEFAULT: 'var(--brass)', wash: 'var(--brass-wash)' },
      },
      fontSize: {
        // A tight scale: this is a data tool, so the steps are small and
        // deliberate rather than a wide display range.
        micro: ['11px', { lineHeight: '14px' }],
        meta: ['12px', { lineHeight: '16px' }],
        body: ['15px', { lineHeight: '22px' }],
        lead: ['17px', { lineHeight: '24px' }],
        head: ['21px', { lineHeight: '28px' }],
        display: ['30px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        figure: ['34px', { lineHeight: '38px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // Two radii only: 3px for controls, 6px for panels. One radius on
        // everything flattens hierarchy.
        ctl: '3px',
        panel: '6px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(27, 31, 35, 0.06)',
        lift: '0 8px 24px rgba(27, 31, 35, 0.12)',
      },
    },
  },
  plugins: [],
};
