/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 still consumes a Tailwind v3 config. The `presets`
  // directive from v3 is gone in v4 — instead, NativeWind registers its
  // own Tailwind plugin via `nativewind/preset`, which v4 looks up at
  // the package's `tailwind.preset.js` entry. We don't import the preset
  // here because v4 auto-registers it when the `nativewind` package is
  // installed; an explicit `presets: [require('nativewind/preset')]`
  // line now throws "preset not found" because v4 removed that file.
  //
  // v4 docs: https://www.nativewind.dev/v4
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
