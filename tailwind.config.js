/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Calm palette — no jarring reds (design §5, §15).
        calm: {
          bg: '#FAFAF7',
          surface: '#FFFFFF',
          text: '#1F1F1F',
          muted: '#6B6B6B',
          line: '#E5E5E0',
          accent: '#3B5BDB',
          warning: '#B45309',
          error: '#9F1239',
          ok: '#15803D',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
