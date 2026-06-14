// App.tsx — re-export so legacy bundlers stop emitting a
// "Web Bundling failed: Unable to resolve ../../App" warning for the
// deprecated expo/AppEntry.js entry. The real entry is expo-router/entry,
// which is set in package.json's "main" field and is what Metro actually
// bundles. This file is only here to silence that legacy probe.
//
// See metro.config.js (no app.json-level router override) and
// package.json (`"main": "expo-router/entry"`) for the actual entry.

export { default } from 'expo-router/entry';
