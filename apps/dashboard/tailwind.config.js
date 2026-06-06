import { venuePosTheme } from '@venue-pos/shared/tailwind-theme.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: venuePosTheme },
  plugins: [],
};
