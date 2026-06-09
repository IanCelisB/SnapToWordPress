/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.expo/',
    '/android/',
    '/ios/',
  ],
  transformIgnorePatterns: [
    // NativeWind v4 + Reanimated + Worklets need to be transpiled by Jest.
    // The v4 CSS interop layer is published as `react-native-css-interop`;
    // we also allow `nativewind` and the new `tailwindcss` v3 ESM bundle.
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-native-community|expo(nent)?|@expo(nent)?/.*|expo-modules-core|expo-secure-store|expo-sqlite|expo-camera|expo-image-picker|expo-crypto|expo-file-system|expo-network|expo-constants|expo-status-bar|@testing-library/react-native|react-native-reanimated|react-native-worklets|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-css-interop|nativewind|tailwindcss)/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  testEnvironment: 'node',
};
