/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Assistant', 'Rubik', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f6f3',
          100: '#dbe9e2',
          200: '#b8d3c7',
          300: '#8bb5a4',
          400: '#5d9480',
          500: '#3f7865',
          600: '#2f5f50',
          700: '#274d42',
          800: '#213e36',
          900: '#1c332d',
        },
      },
    },
  },
  plugins: [],
};
