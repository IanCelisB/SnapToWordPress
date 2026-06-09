// babel.config.js — Babel preset chain for Expo SDK 56 + NativeWind v4.
//
// NativeWind v4 (the currently maintained release; v3 only ships as
// nightly snapshots on npm — see COMMITS.md and apply-progress for the
// pivot decision) is wired up via a "preset-like" pattern: the
// `nativewind/babel` wrapper returns `{ plugins: [...] }` from a
// function. Babel's `presets` field accepts a function returning that
// shape, so we wire `nativewind/babel` as a PRESET (not a plugin).
//
// `react-native-worklets/plugin` is listed separately under `plugins`
// (not as a preset) because it's a leaf plugin — it transforms inline
// worklet functions and does not return a sub-config.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'react' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated 4 worklets. MUST stay LAST per the Reanimated docs.
      'react-native-worklets/plugin',
    ],
  };
};
