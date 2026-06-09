import { venuePosTheme } from '@venue-pos/shared/tailwind-theme.js';

/**
 * Dashboard-only premium design system. We spread the shared Venue POS palette
 * (so primary/secondary tokens used elsewhere keep working) and layer on a
 * richer set of tokens — emerald accent, navy ink, layered surfaces, soft
 * shadows, and motion — without touching the POS app.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      ...venuePosTheme,
      colors: {
        ...venuePosTheme.colors,
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        ink: {
          DEFAULT: '#0f172a',
          900: '#0b1220',
          800: '#111a2b',
          700: '#1c2738',
          600: '#334155',
          500: '#64748b',
          400: '#94a3b8',
        },
        surface: {
          base: '#f5f7fa',
          sunken: '#eef1f6',
          raised: '#ffffff',
          overlay: '#fbfcfe',
          sidebar: '#0b1220',
          'sidebar-soft': '#111a2b',
          'sidebar-line': '#1e293b',
        },
        hairline: 'rgba(15,23,42,0.08)',
      },
      backgroundImage: {
        ...venuePosTheme.backgroundImage,
        'accent-gradient': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'ink-gradient': 'linear-gradient(160deg, #111a2b 0%, #0b1220 100%)',
        'hero-glow':
          'radial-gradient(120% 120% at 0% 0%, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0) 45%), radial-gradient(120% 120% at 100% 0%, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 50%)',
        shimmer:
          'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.06)',
        'card-hover':
          '0 14px 30px -10px rgba(15,23,42,0.18), 0 6px 12px -6px rgba(15,23,42,0.10)',
        elevated: '0 24px 60px -18px rgba(15,23,42,0.32)',
        focus: '0 0 0 4px rgba(16,185,129,0.18)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
        '3xl': '1.375rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.45)' },
          '70%': { boxShadow: '0 0 0 6px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 2s infinite',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
