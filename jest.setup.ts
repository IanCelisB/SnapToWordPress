// Jest setup — runs before each test file.
// Native module mocks live here so unit tests can import the catalog + classifier
// without touching real device APIs.

/* eslint-disable @typescript-eslint/no-require-imports */

// crypto.randomUUID polyfill for older Node test environments.
import { randomUUID } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - assigning a partial polyfill in test env only
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = () => randomUUID();
}

// AsyncStorage mock — in-memory map for test isolation
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
      removeItem: jest.fn(async (key: string) => { store.delete(key); }),
      clear: jest.fn(async () => { store.clear(); }),
      getAllKeys: jest.fn(async () => Array.from(store.keys())),
    },
  };
});

// react-native-reanimated + react-native-worklets are NOT loaded by
// the WU-1/WU-2 test surface. The WU-1 setup wired
// `require('react-native-reanimated/mock')`, but the v4 mock chain
// initializes a native module that isn't present under bare Node
// and crashes the whole test run. The WU-2 surface (catalog +
// classifier + repos + WC client + credentials + logger) does not
// import reanimated; if a future WU-3 component test needs it, add
// the proper v4 mock setup (the reanimated docs recommend a custom
// mock + setting `global.__reanimatedLogger`) and revisit here.
//
// The two lines below are kept as a comment-only reference.
// jest.mock('react-native-worklets', () => ({ ... }));
// require('react-native-reanimated/mock');

// NativeWind v4 CSS interop — the WU-1 setup referenced a
// `nativewind/dist/mock.js` that does not exist in v4. The WU-2 test
// surface does NOT import nativewind (the catalog + classifier + repos
// + WC client + credentials are pure logic and node-only code paths).
// WU-3 component tests that import screens using `className="..."`
// will need a real v4 mock setup; the official path is to add
// `jest.setup.js` files at the project root and use the
// `nativewind/preset` content path. For WU-2 we just don't import
// the package from any test file.

// expo-secure-store mock — in-memory store; tests can spy as needed.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((key: string) =>
      Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
    ),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __reset: () => store.clear(),
  };
});

// ---------------------------------------------------------------------------
// expo-sqlite mock — per-table in-memory store.
//
// The mock is "good enough for the WU-2 surface" — it implements the
// surface our repos actually use:
//   - `CREATE TABLE` / `CREATE INDEX` are recorded as a no-op (the
//     table is auto-created on first INSERT/SELECT).
//   - `INSERT ... VALUES (?, ?, ...)` inserts a row into the named
//     table, mapping the column list to the VALUES clause (so SQL
//     literals like `'queued'` and `0` are stored alongside `?` params).
//   - `SELECT * FROM <table> WHERE <col> [op] ?` filters by the
//     `?`-bound value, with `=`, `!=`, `<>`, `IN (lit, lit)` supported.
//   - `SELECT ... ORDER BY <col> [ASC|DESC]` sorts the result.
//   - `UPDATE <table> SET ... WHERE <col> = ?` finds matching rows and
//     merges the SET clause into them.
//   - `DELETE FROM <table> WHERE <col> = ?` removes matching rows.
//   - `PRAGMA user_version` and `PRAGMA user_version = N` are honored.
//   - `withTransactionAsync` runs the callback with the same handle.
// ---------------------------------------------------------------------------


jest.mock('expo-sqlite', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shim = require('./src/db/sqlite-shim');
  const openDatabaseAsync = jest.fn((name: string) => shim.openDatabaseAsync(name));
  return {
    openDatabaseAsync,
    openDatabaseSync: jest.fn(() => ({
      exec: jest.fn(),
      runSync: jest.fn(() => ({ changes: 0, lastInsertRowId: 0 })),
      getAllSync: jest.fn(() => []),
      getFirstSync: jest.fn(() => null),
      closeSync: jest.fn(),
    })),
    __resetMockDatabases: () => shim.__resetMockDatabases(),
  };
});

// expo-camera mock — for tests that touch permission flow (added in WU-3).
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [
    { granted: false, canAskAgain: true },
    jest.fn(),
  ],
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

// expo-image-picker mock — for tests that touch the library fallback (WU-3).
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: null }),
  ),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: null }),
  ),
  MediaTypeOptions: { Images: 'Images' },
}));

// expo-crypto mock — bare Node doesn't have the native module. The
// `uuid()` infra helper falls back to `globalThis.crypto.randomUUID`
// when the imported function is not a function, but the safer path
// is to mock it explicitly so the call returns synchronously.
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    // Deterministic UUID-shaped string for tests if the polyfill
    // is missing.
    return '00000000-0000-4000-8000-000000000000';
  },
}));

// Silence noisy logs from libraries in test output.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = typeof args[0] === 'string' ? args[0] : '';
  if (message.includes('Animated:') || message.includes('useNativeDriver')) {
    return;
  }
  originalWarn(...args);
};

// Export a function to reset the in-memory mock DBs. The `db`
// module's `__resetForTest` will call this on next import. Pair
// it with the test's own `beforeEach` to also drop the cached `DB`
// wrapper between cases (the WU-2/WU-3 repos + store tests do this
// already).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __getMockSqliteModule = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-sqlite');
};

(globalThis as { __resetExpoSqliteMock?: () => void }).__resetExpoSqliteMock =
  () => {
    const sqlite = __getMockSqliteModule();
    if (sqlite && typeof sqlite.__resetMockDatabases === 'function') {
      sqlite.__resetMockDatabases();
    }
  };
