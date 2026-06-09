// Learn more https://docs.expo.dev/guides/customizing-metro/
//
// NativeWind v4 setup (the currently maintained release; v3 only ships as
// nightly snapshots on npm — see COMMITS.md for the v3→v4 pivot).
//
// NativeWind v4 ships a Metro `withNativeWind` wrapper that wires the
// transformer and CSS pipeline. The `__source` / `__transforms` exports
// in the wrapper are the v4-style integration (v3 used `transformerWithNW`
// + a separate `transformImportMeta` injection — that is gone in v4).
//
// Tailwind v3 globs are still honoured: the v4 `content` config in
// `tailwind.config.js` points at the same files v3 did.

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  // Re-scan the source tree for `className` occurrences. v4 supports glob
  // inputs; keeping the v3 paths so a future WU-5 polish pass doesn't have
  // to remember to update this.
  input: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
});
