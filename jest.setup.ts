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
  // @ts-expect-error - assigning polyfill in test env only
  globalThis.crypto.randomUUID = () => randomUUID();
}

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

type SqlParam = string | number | null;
type MockRow = Record<string, SqlParam>;

class MockTableSet {
  tablesByName: Map<string, MockRow[]> = new Map();
  userVersion = 0;

  rowsFor(table: string): MockRow[] {
    let arr = this.tablesByName.get(table);
    if (!arr) {
      arr = [];
      this.tablesByName.set(table, arr);
    }
    return arr;
  }
}

const mockDatabases = new Map<string, MockTableSet>();

function mockParseTableFromInsert(sql: string): string | null {
  const m = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function mockParseTableFromSelect(sql: string): string | null {
  const m = sql.match(/FROM\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function mockParseTableFromUpdate(sql: string): string | null {
  const m = sql.match(/UPDATE\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function mockParseTableFromDelete(sql: string): string | null {
  const m = sql.match(/DELETE\s+FROM\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function mockParseInsertColumns(sql: string): string[] {
  const m = sql.match(/INTO\s+\w+\s*\(([^)]+)\)/i);
  if (!m || !m[1]) return [];
  return m[1].split(',').map((c) => c.trim().replace(/["`[\]]/g, ''));
}

type MockValue =
  | { kind: 'param' }
  | { kind: 'literal'; value: SqlParam };

function mockParseValuesClause(sql: string): MockValue[] {
  const m = sql.match(/VALUES\s*\(([^)]+)\)/i);
  if (!m || !m[1]) return [];
  return m[1].split(',').map((piece): MockValue => {
    const v = piece.trim();
    if (v === '?') return { kind: 'param' };
    if (/^['"]/.test(v)) {
      return { kind: 'literal', value: v.slice(1, -1) };
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return { kind: 'literal', value: Number(v) };
    }
    if (/^NULL$/i.test(v)) {
      return { kind: 'literal', value: null };
    }
    return { kind: 'param' };
  });
}

type MockSetClause = { col: string; isParam: boolean; literal: SqlParam };

function mockParseSetClauses(sql: string): MockSetClause[] {
  const m = sql.match(/SET\s+(.+?)\s+WHERE/i);
  if (!m || !m[1]) return [];
  return m[1].split(',').map((piece): MockSetClause => {
    const [colRaw, valRaw] = piece.split('=');
    const col = (colRaw ?? '').trim().replace(/["`[\]]/g, '');
    const v = (valRaw ?? '').trim();
    if (v === '?') {
      return { col, isParam: true, literal: null };
    }
    if (/^['"]/.test(v)) {
      return { col, isParam: false, literal: v.slice(1, -1) };
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) {
      return { col, isParam: false, literal: Number(v) };
    }
    if (/^NULL$/i.test(v)) {
      return { col, isParam: false, literal: null };
    }
    return { col, isParam: true, literal: null };
  });
}

type MockFilter = {
  col: string;
  isParam: boolean;
  literal: SqlParam | string[] | null;
  op: '=' | '!=' | '<>' | 'IN_LIST';
};

function mockParseWhereFilter(sql: string): MockFilter[] {
  const whereIdx = sql.toUpperCase().indexOf('WHERE');
  if (whereIdx === -1) return [];
  const rest = sql.slice(whereIdx + 5);
  const orderIdx = rest.toUpperCase().indexOf('ORDER');
  const where = orderIdx === -1 ? rest : rest.slice(0, orderIdx);
  const parts = where.split(/\s+AND\s+/i);
  return parts
    .map((p): MockFilter => {
      const m = p.match(/(\w+)\s*(=|!=|<>|IN)\s*(\?|'[^']*'|\d+|\([^)]+\))/i);
      if (!m || !m[1] || !m[2] || !m[3]) {
        return { col: '', isParam: false, literal: null, op: '=' };
      }
      const col = m[1];
      const opRaw = m[2].toUpperCase();
      const op: MockFilter['op'] =
        opRaw === '!=' || opRaw === '<>'
          ? '!='
          : opRaw === 'IN'
            ? 'IN_LIST'
            : '=';
      const v = m[3];
      if (v === '?') return { col, isParam: true, literal: null, op };
      if (v.startsWith("'")) {
        return { col, isParam: false, literal: v.slice(1, -1), op };
      }
      if (v.startsWith('(')) {
        const inner = v.slice(1, -1);
        const items = inner
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        return { col, isParam: false, literal: items, op };
      }
      return { col, isParam: false, literal: v, op };
    })
    .filter((f) => f.col.length > 0);
}

function mockRowMatches(
  row: MockRow,
  filter: MockFilter,
  params: ReadonlyArray<SqlParam>,
  paramIdx: { i: number },
): boolean {
  if (filter.col === '') return true;
  if (filter.op === 'IN_LIST') {
    const items = (filter.literal as string[] | null) ?? [];
    const cell = row[filter.col];
    return items.includes(String(cell ?? ''));
  }
  if (filter.isParam) {
    const v = params[paramIdx.i];
    paramIdx.i += 1;
    if (filter.op === '=') {
      return String(row[filter.col] ?? '') === String(v ?? '');
    }
    return String(row[filter.col] ?? '') !== String(v ?? '');
  }
  // Literal-side filter. Honor the operator.
  const left = String(row[filter.col] ?? '');
  const right = String(filter.literal ?? '');
  if (filter.op === '!=') {
    return left !== right;
  }
  return left === right;
}

function mockApplyFilter(
  rows: ReadonlyArray<MockRow>,
  filters: ReadonlyArray<MockFilter>,
  params: ReadonlyArray<SqlParam>,
): MockRow[] {
  if (filters.length === 0) return rows.slice();
  const out: MockRow[] = [];
  for (const row of rows) {
    const idx = { i: 0 };
    let all = true;
    for (const f of filters) {
      if (!mockRowMatches(row, f, params, idx)) {
        all = false;
        break;
      }
    }
    if (all) out.push({ ...row });
  }
  return out;
}

function mockParseOrderBy(sql: string): { col: string; dir: 'ASC' | 'DESC' } | null {
  const m = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (!m || !m[1]) return null;
  return { col: m[1], dir: m[2]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
}

jest.mock('expo-sqlite', () => {
  const openDatabaseAsync = jest.fn(async (name: string) => {
    if (!mockDatabases.has(name)) {
      mockDatabases.set(name, new MockTableSet());
    }
    const tables = mockDatabases.get(name);
    if (!tables) {
      throw new Error(`Mock DB '${name}' disappeared mid-init`);
    }
    const handle = {
      execAsync: jest.fn(async (sql: string) => {
        if (/^\s*PRAGMA\s+user_version\s*=/i.test(sql)) {
          const match = sql.match(/=\s*(\d+)/);
          if (match && match[1]) {
            tables.userVersion = Number(match[1]);
          }
        }
        // CREATE TABLE / CREATE INDEX — no-op; tables are auto-created.
      }),
      runAsync: jest.fn(async (sql: string, ...params: ReadonlyArray<SqlParam>) => {
        const trimmed = sql.trim();
        if (/^INSERT/i.test(trimmed)) {
          const table = mockParseTableFromInsert(sql);
          if (!table) return { changes: 0, lastInsertRowId: 0 };
          const cols = mockParseInsertColumns(sql);
          const values = mockParseValuesClause(sql);
          // eslint-disable-next-line no-console
          console.log('INSERT ROW debug', { table, cols, values, params });
          const newRow: MockRow = {};
          let paramIdx = 0;
          for (let i = 0; i < cols.length; i += 1) {
            const colName = cols[i] ?? `col_${i}`;
            const v = values[i];
            if (!v || v.kind === 'param') {
              newRow[colName] = params[paramIdx] ?? null;
              paramIdx += 1;
            } else {
              newRow[colName] = v.value;
            }
          }
          const targetRows = tables.rowsFor(table);
          // AUTOINCREMENT integer keys: assign an `id` if the row
          // doesn't already have one.
          if (newRow.id === undefined) {
            newRow.id = targetRows.length + 1;
          }
          targetRows.push(newRow);
          return { changes: 1, lastInsertRowId: targetRows.length };
        }
        if (/^UPDATE/i.test(trimmed)) {
          const table = mockParseTableFromUpdate(sql);
          if (!table) return { changes: 0, lastInsertRowId: 0 };
          const targetRows = tables.rowsFor(table);
          const sets = mockParseSetClauses(sql);
          const filters = mockParseWhereFilter(sql);
          // Count the `?` params consumed by the SET clause so the
          // WHERE clause sees the remaining tail of `params`. SQL
          // binds SET first, WHERE second.
          const setParamCount = sets.filter((s) => s.isParam).length;
          const whereParams = params.slice(setParamCount);
          let changes = 0;
          for (const row of targetRows) {
            const idx = { i: 0 };
            let matches = filters.length === 0;
            for (const f of filters) {
              if (mockRowMatches(row, f, whereParams, idx)) {
                matches = true;
                break;
              }
            }
            if (!matches) continue;
            let pIdx = 0;
            for (const s of sets) {
              if (s.isParam) {
                row[s.col] = params[pIdx] ?? null;
                pIdx += 1;
              } else {
                row[s.col] = s.literal;
              }
            }
            changes += 1;
          }
          return { changes, lastInsertRowId: 0 };
        }
        if (/^DELETE/i.test(trimmed)) {
          const table = mockParseTableFromDelete(sql);
          if (!table) return { changes: 0, lastInsertRowId: 0 };
          const targetRows = tables.rowsFor(table);
          const filters = mockParseWhereFilter(sql);
          const before = targetRows.length;
          const kept = targetRows.filter((row) => {
            const idx = { i: 0 };
            for (const f of filters) {
              if (mockRowMatches(row, f, params, idx)) {
                return false;
              }
            }
            return true;
          });
          tables.tablesByName.set(table, kept);
          return { changes: before - kept.length, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      }),
      getAllAsync: jest.fn(
        async <T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>) => {
          if (/^SELECT.*FROM\s+sqlite_master/i.test(sql)) {
            return [
              { name: 'products' },
              { name: 'product_images' },
              { name: 'media_uploads' },
              { name: 'sync_attempts' },
              { name: 'store_categories' },
              { name: 'app_config' },
              { name: 'sync_queue' },
              { name: 'media_ledger' },
            ] as unknown as T[];
          }
          if (/^SELECT.*FROM/i.test(sql)) {
            const table = mockParseTableFromSelect(sql);
            if (!table) return [] as unknown as T[];
            const targetRows = tables.rowsFor(table);
            const filters = mockParseWhereFilter(sql);
            // eslint-disable-next-line no-console
            console.log('SELECT ALL debug', { table, filters, targetRows, params });
            const filtered = mockApplyFilter(targetRows, filters, params);
            const order = mockParseOrderBy(sql);
            if (order) {
              filtered.sort((a, b) => {
                const av = a[order.col];
                const bv = b[order.col];
                if (av === bv) return 0;
                if (av === null || av === undefined) return 1;
                if (bv === null || bv === undefined) return -1;
                return order.dir === 'DESC'
                  ? (av < bv ? 1 : -1)
                  : (av < bv ? -1 : 1);
              });
            }
            return filtered as unknown as T[];
          }
          return tables.rowsFor('__unknown__').slice() as unknown as T[];
        },
      ),
      getFirstAsync: jest.fn(
        async <T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>) => {
          if (/^PRAGMA\s+user_version/i.test(sql)) {
            return { user_version: tables.userVersion } as unknown as T;
          }
          if (/^SELECT.*FROM/i.test(sql)) {
            const table = mockParseTableFromSelect(sql);
            if (!table) return null;
            const targetRows = tables.rowsFor(table);
            const filters = mockParseWhereFilter(sql);
            const filtered = mockApplyFilter(targetRows, filters, params);
            const order = mockParseOrderBy(sql);
            if (order) {
              filtered.sort((a, b) => {
                const av = a[order.col];
                const bv = b[order.col];
                if (av === bv) return 0;
                if (av === null || av === undefined) return 1;
                if (bv === null || bv === undefined) return -1;
                return order.dir === 'DESC'
                  ? (av < bv ? 1 : -1)
                  : (av < bv ? -1 : 1);
              });
            }
            return (filtered[0] ?? null) as unknown as T;
          }
          return null;
        },
      ),
      closeAsync: jest.fn(async () => undefined),
      withTransactionAsync: jest.fn(
        async <T,>(fn: (tx: typeof handle) => Promise<T>): Promise<T> => fn(handle),
      ),
    };
    return handle;
  });

  return {
    openDatabaseAsync,
    openDatabaseSync: jest.fn(() => ({
      exec: jest.fn(),
      runSync: jest.fn(() => ({ changes: 0, lastInsertRowId: 0 })),
      getAllSync: jest.fn(() => []),
      getFirstSync: jest.fn(() => null),
      closeSync: jest.fn(),
    })),
    __resetMockDatabases: () => mockDatabases.clear(),
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
