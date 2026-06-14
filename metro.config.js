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
//
// expo-secure-store web shim:
// The expo-secure-store package ships an empty stub for its native bridge
// on web. We patched the web stub directly in node_modules (see
// src/infra/secure-store-web-bridge.ts for the canonical version).

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite@56 ships a `wa-sqlite.wasm` that its web worker imports
// (see `expo-sqlite/web/worker.ts` line 22). Metro needs `.wasm` in BOTH:
//   - `sourceExts` so the resolver can LOCATE the file on disk (otherwise
//     it treats "wa-sqlite.wasm" as a bare module name and tries
//     "wa-sqlite.wasm.ts" / ".tsx" / ".js" / etc., none of which exist).
//   - `assetExts` so the resolver can CLASSIFY it as a static asset
//     (so Metro serves the binary instead of trying to parse it as JS).
// `assetExts` alone is NOT enough: it only classifies files that the
// resolver already found. `sourceExts` does the actual finding.
// Mutating in place is required: `withNativeWind` does not merge a
// `resolver` field passed in its options.
config.resolver.assetExts.push('wasm');
config.resolver.sourceExts.push('wasm');

module.exports = withNativeWind(config, {
  // Re-scan the source tree for `className` occurrences. v4 supports glob
  // inputs; keeping the v3 paths so a future WU-5 polish pass doesn't have
  // to remember to update this.
  input: './app/**/*.{js,jsx,ts,tsx}',
});
