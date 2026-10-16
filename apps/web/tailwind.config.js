import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Height-based breakpoints, so short screens tighten spacing instead of scrolling.
      screens: {
        short: { raw: '(max-height: 780px)' },
        tiny: { raw: '(max-height: 680px)' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: colors.blue,
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        lift: '0 4px 16px rgba(15, 23, 42, 0.08)',
      },
      keyframes: {
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        // A broadcast "buzz": short shake, then rest.
        signal: {
          '0%, 60%, 100%': { transform: 'rotate(0) scale(1)' },
          '8%': { transform: 'rotate(-12deg) scale(1.08)' },
          '16%': { transform: 'rotate(10deg) scale(1.08)' },
          '24%': { transform: 'rotate(-8deg) scale(1.05)' },
          '32%': { transform: 'rotate(6deg) scale(1.03)' },
          '40%': { transform: 'rotate(0) scale(1)' },
        },
        wiggle: { '0%, 100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-10deg)' }, '75%': { transform: 'rotate(10deg)' } },
        twinkle: { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.55', transform: 'scale(0.85)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
      },
      animation: {
        'toast-in': 'toast-in 180ms ease-out',
        'fade-in': 'fade-in 200ms ease-out',
        signal: 'signal 2.4s ease-in-out infinite',
        wiggle: 'wiggle 400ms ease-in-out',
        twinkle: 'twinkle 2s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
