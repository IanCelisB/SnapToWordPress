// src/db/sqlite-shim.ts — In-memory SQLite-compatible shim for web.
//
// Mirrors the API surface of expo-sqlite's `SQLiteDatabase` (the async
// subset this codebase actually uses: `execAsync`, `runAsync`,
// `getAllAsync`, `getFirstAsync`, `closeAsync`, `withTransactionAsync`).
//
// Metro can't resolve `expo-sqlite`'s `wa-sqlite.wasm` for the web
// target, so when `Platform.OS === 'web'` the app opens a shim-backed
// database instead of the native one. The shim stores everything in
// plain JS Maps — no persistence, no real SQL parsing — but it handles
// the INSERT / SELECT / UPDATE / DELETE / WHERE / ORDER BY / ON CONFLICT
// patterns that the repos actually generate.

type SqlParam = string | number | null;
type MockRow = Record<string, SqlParam>;

// ---------------------------------------------------------------------------
// Internal data structures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SQL helpers (parse the subset the repos actually generate)
// ---------------------------------------------------------------------------

function parseTableFromInsert(sql: string): string | null {
  const m = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function parseTableFromSelect(sql: string): string | null {
  const m = sql.match(/FROM\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function parseTableFromUpdate(sql: string): string | null {
  const m = sql.match(/UPDATE\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function parseTableFromDelete(sql: string): string | null {
  const m = sql.match(/DELETE\s+FROM\s+["`[]?(\w+)["`\]]?/i);
  return m && m[1] ? m[1] : null;
}

function parseInsertColumns(sql: string): string[] {
  const normalized = sql.replace(/\s+/g, ' ');
  const m = normalized.match(/INTO\s+\w+\s*\(([^)]+)\)/i);
  if (!m || !m[1]) return [];
  return m[1].split(',').map((c) => c.trim().replace(/["`[\]]/g, ''));
}

type MockValue =
  | { kind: 'param' }
  | { kind: 'literal'; value: SqlParam };

function parseValuesClause(sql: string): MockValue[] {
  const normalized = sql.replace(/\s+/g, ' ');
  const m = normalized.match(/VALUES\s*\(([^)]+)\)/i);
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

function parseSetClauses(sql: string): MockSetClause[] {
  const normalized = sql.replace(/\s+/g, ' ');
  const m = normalized.match(/SET\s+(.+?)\s+WHERE/i);
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
  op: '=' | '!=' | '<>' | 'IN_LIST' | '<' | '>' | '<=' | '>=';
};

function parseWhereFilter(sql: string): MockFilter[] {
  const normalized = sql.replace(/\s+/g, ' ');
  const whereIdx = normalized.toUpperCase().indexOf(' WHERE ');
  if (whereIdx === -1) return [];
  const rest = normalized.slice(whereIdx + 7);
  const endMatch = rest.toUpperCase().match(/\s+(ORDER|GROUP|LIMIT)\b/);
  const where = endMatch && endMatch.index !== undefined
    ? rest.slice(0, endMatch.index)
    : rest;
  const parts = where.split(/\s+AND\s+/i);
  return parts
    .map((p): MockFilter => {
      const m = p.match(
        /(\w+)\s*(!=|<>|<=|>=|IN|=|<|>)\s*(\?|'[^']*'|\d+|\([^)]+\))/i,
      );
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
            : opRaw === '<'
              ? '<'
              : opRaw === '>'
                ? '>'
                : opRaw === '<='
                  ? '<='
                  : opRaw === '>='
                    ? '>='
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
      return { col, isParam: false, literal: Number(v) || v, op };
    })
    .filter((f) => f.col.length > 0);
}

function rowMatches(
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
  const cellValue = row[filter.col];
  const rightValue = filter.isParam ? params[paramIdx.i] : filter.literal;
  if (filter.isParam) paramIdx.i += 1;

  if (filter.op === '<' || filter.op === '>' || filter.op === '<=' || filter.op === '>=') {
    const left = Number(cellValue);
    const right = Number(rightValue);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      if (filter.op === '<') return left < right;
      if (filter.op === '>') return left > right;
      if (filter.op === '<=') return left <= right;
      if (filter.op === '>=') return left >= right;
    }
    return false;
  }

  const left = String(cellValue ?? '');
  const right = String(rightValue ?? '');
  if (filter.op === '=') return left === right;
  if (filter.op === '!=') return left !== right;
  return left === right;
}

function applyFilter(
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
      if (!rowMatches(row, f, params, idx)) {
        all = false;
        break;
      }
    }
    if (all) out.push({ ...row });
  }
  return out;
}

function parseOrderBy(sql: string): { col: string; dir: 'ASC' | 'DESC' } | null {
  const normalized = sql.replace(/\s+/g, ' ');
  const m = normalized.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (!m || !m[1]) return null;
  return { col: m[1], dir: m[2]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
}

// ---------------------------------------------------------------------------
// Shim handle factory
// ---------------------------------------------------------------------------

const databases = new Map<string, MockTableSet>();

function resetDatabases(): void {
  databases.clear();
}

type WebDatabaseHandle = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<T[]>;
  getFirstAsync<T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<T | null>;
  closeAsync(): Promise<void>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
};

function openDatabaseAsync(name: string): Promise<WebDatabaseHandle> {
  if (!databases.has(name)) {
    databases.set(name, new MockTableSet());
  }
  const tables = databases.get(name)!;

  const handle: WebDatabaseHandle = {
    async execAsync(sql: string): Promise<void> {
      if (/^\s*PRAGMA\s+user_version\s*=/i.test(sql)) {
        const match = sql.match(/=\s*(\d+)/);
        if (match && match[1]) {
          tables.userVersion = Number(match[1]);
        }
      }
      // CREATE TABLE / CREATE INDEX — no-op; tables are auto-created.
    },

    async runAsync(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<{ changes: number; lastInsertRowId: number }> {
      const trimmed = sql.trim();
      if (/^INSERT/i.test(trimmed)) {
        const table = parseTableFromInsert(sql);
        if (!table) return { changes: 0, lastInsertRowId: 0 };
        const cols = parseInsertColumns(sql);
        const values = parseValuesClause(sql);
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
        // ON CONFLICT handling
        if (/ON\s+CONFLICT/i.test(sql)) {
          const conflictMatch = sql.match(
            /ON\s+CONFLICT\s*\(\s*(\w+)\s*\)/i,
          );
          const conflictCol = conflictMatch?.[1];
          if (conflictCol) {
            const existingIdx = targetRows.findIndex(
              (r) => r[conflictCol] === newRow[conflictCol],
            );
            if (existingIdx !== -1) {
              if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
                return { changes: 0, lastInsertRowId: Number(targetRows[existingIdx]?.id) || 0 };
              }
              // REPLACE / DO UPDATE: replace the existing row.
              newRow.id = targetRows[existingIdx]?.id ?? null;
              targetRows[existingIdx] = { ...newRow };
              return { changes: 1, lastInsertRowId: Number(newRow.id) || 0 };
            }
          }
        }
        if (newRow.id === undefined) {
          newRow.id = targetRows.length + 1;
        }
        targetRows.push(newRow);
        return { changes: 1, lastInsertRowId: targetRows.length };
      }
      if (/^UPDATE/i.test(trimmed)) {
        const table = parseTableFromUpdate(sql);
        if (!table) return { changes: 0, lastInsertRowId: 0 };
        const targetRows = tables.rowsFor(table);
        const sets = parseSetClauses(sql);
        const filters = parseWhereFilter(sql);
        const setParamCount = sets.filter((s) => s.isParam).length;
        const whereParams = params.slice(setParamCount);
        let changes = 0;
        for (const row of targetRows) {
          const idx = { i: 0 };
          let matches = filters.length === 0;
          for (const f of filters) {
            if (rowMatches(row, f, whereParams, idx)) {
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
        const table = parseTableFromDelete(sql);
        if (!table) return { changes: 0, lastInsertRowId: 0 };
        const targetRows = tables.rowsFor(table);
        const filters = parseWhereFilter(sql);
        const before = targetRows.length;
        const deleted: MockRow[] = [];
        const kept = targetRows.filter((row) => {
          const idx = { i: 0 };
          for (const f of filters) {
            if (rowMatches(row, f, params, idx)) {
              deleted.push(row);
              return false;
            }
          }
          return true;
        });
        tables.tablesByName.set(table, kept);
        // Cascade delete for known FK relationships.
        for (const dRow of deleted) {
          if (table === 'products' && dRow.local_id != null) {
            const imgRows = tables.rowsFor('product_images');
            tables.tablesByName.set(
              'product_images',
              imgRows.filter((r) => r.product_local_id !== dRow.local_id),
            );
            const qRows = tables.rowsFor('sync_queue');
            tables.tablesByName.set(
              'sync_queue',
              qRows.filter((r) => r.product_local_id !== dRow.local_id),
            );
            const aRows = tables.rowsFor('sync_attempts');
            tables.tablesByName.set(
              'sync_attempts',
              aRows.filter((r) => r.product_local_id !== dRow.local_id),
            );
          }
        }
        return { changes: before - kept.length, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },

    async getAllAsync<T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<T[]> {
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
        const table = parseTableFromSelect(sql);
        if (!table) return [] as unknown as T[];
        const targetRows = tables.rowsFor(table);
        const filters = parseWhereFilter(sql);
        const filtered = applyFilter(targetRows, filters, params);
        const order = parseOrderBy(sql);
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

    async getFirstAsync<T = MockRow>(sql: string, ...params: ReadonlyArray<SqlParam>): Promise<T | null> {
      if (/^PRAGMA\s+user_version/i.test(sql)) {
        return { user_version: tables.userVersion } as unknown as T;
      }
      if (/^SELECT.*FROM/i.test(sql)) {
        const table = parseTableFromSelect(sql);
        if (!table) return null;
        const targetRows = tables.rowsFor(table);
        const filters = parseWhereFilter(sql);
        const filtered = applyFilter(targetRows, filters, params);
        const order = parseOrderBy(sql);
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

    async closeAsync(): Promise<void> {
      // no-op for in-memory shim
    },

    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      await fn();
    },
  };

  return Promise.resolve(handle);
}

// ---------------------------------------------------------------------------
// Public API — shaped like expo-sqlite's module exports
// ---------------------------------------------------------------------------

export function createWebDatabase(name: string): Promise<WebDatabaseHandle> {
  return openDatabaseAsync(name);
}

export function resetWebDatabases(): void {
  resetDatabases();
}

export type { WebDatabaseHandle };

// Named export matching the expo-sqlite module shape consumed in index.ts
export { openDatabaseAsync };
export { resetDatabases as __resetMockDatabases };
