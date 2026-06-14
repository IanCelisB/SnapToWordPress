// src/db/index.ts — typed wrapper over `expo-sqlite`.
//
// Implements the `DB` contract from Design §5: `exec`, `query<T>`,
// `run`, `transaction`, `close`. Opens the database, enables WAL +
// foreign keys, and exposes a `withTransaction` helper for multi-statement
// operations. Pure I/O: no business logic lives here.
//
// On web, `expo-sqlite` can't load its `wa-sqlite.wasm` via Metro, so we
// fork to an in-memory shim that exposes the same async handle shape.

import { Platform } from 'react-native';
import type { MigrationError } from '../error-presentation';

// Native: real expo-sqlite. Web: in-memory shim.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SQLite = Platform.OS === 'web'
  ? require('./sqlite-shim') as typeof import('expo-sqlite')
  : require('expo-sqlite') as typeof import('expo-sqlite');

const DB_NAME = 'etiquetador.db';

export type SqlParam = string | number | null;

export type RunResult = {
  changes: number;
  lastInsertRowId: number;
};

export type DB = {
  exec(sql: string): Promise<void>;
  query<T>(sql: string, params?: ReadonlyArray<SqlParam>): Promise<T[]>;
  queryOne<T>(sql: string, params?: ReadonlyArray<SqlParam>): Promise<T | null>;
  run(sql: string, params?: ReadonlyArray<SqlParam>): Promise<RunResult>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  withTransaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  getUserVersion(): Promise<number>;
  setUserVersion(version: number): Promise<void>;
  close(): Promise<void>;
  /** Test seam: the underlying expo-sqlite (or shim) handle. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __raw: any;
};

let cached: DB | null = null;

export async function openDB(): Promise<DB> {
  if (cached) return cached;
  const raw = await SQLite.openDatabaseAsync(DB_NAME);
  await raw.execAsync('PRAGMA journal_mode = WAL;');
  await raw.execAsync('PRAGMA foreign_keys = ON;');
  cached = wrap(raw);
  return cached;
}

export function __resetForTest(): void {
  cached = null;
  // Also clear the in-memory mock databases so each test gets a fresh DB.
  const g = globalThis as { __resetExpoSqliteMock?: () => void };
  if (typeof g.__resetExpoSqliteMock === 'function') {
    g.__resetExpoSqliteMock();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(raw: any): DB {
  const db: DB = {
    async exec(sql: string): Promise<void> {
      await raw.execAsync(sql);
    },
    async query<T>(
      sql: string,
      params?: ReadonlyArray<SqlParam>,
    ): Promise<T[]> {
      return raw.getAllAsync(sql, ...(params ?? [])) as Promise<T[]>;
    },
    async queryOne<T>(
      sql: string,
      params?: ReadonlyArray<SqlParam>,
    ): Promise<T | null> {
      const row = await raw.getFirstAsync(sql, ...(params ?? []));
      return (row ?? null) as T | null;
    },
    async run(
      sql: string,
      params?: ReadonlyArray<SqlParam>,
    ): Promise<RunResult> {
      const result = await raw.runAsync(sql, ...(params ?? []));
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    },
    async transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
      // expo-sqlite exposes `withTransactionAsync` on the handle; the
      // callback receives a transaction-scoped handle. We surface the
      // SAME shape (`tx`) as the outer DB so the migration runner
      // and the worker's helpers can be written once.
      let outcome!: T;
      await raw.withTransactionAsync(async () => {
        outcome = await fn(db);
      });
      return outcome;
    },
    async withTransaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
      return db.transaction(fn);
    },
    async getUserVersion(): Promise<number> {
      const result = await raw.getFirstAsync(
        'PRAGMA user_version',
      ) as { user_version: number } | null;
      return result?.user_version ?? 0;
    },
    async setUserVersion(version: number): Promise<void> {
      await raw.execAsync(`PRAGMA user_version = ${Number(version)};`);
    },
    async close(): Promise<void> {
      await raw.closeAsync();
      cached = null;
    },
    __raw: raw,
  };
  return db;
}

/** Re-export of the typed error so callers don't reach into `error-presentation` directly. */
export type { MigrationError };

// Re-export the rest of the db module (CRUD + migrations) so callers
// can `import { productsRepo, runMigrations, ... } from '@/db'`.
export {
  TARGET_VERSION,
  MIGRATIONS,
  runMigrations,
} from './migrations';
export type { MigrationStep } from './migrations';

export {
  insertProduct,
  updateProduct,
  getProduct,
  listProductsForSync,
  listProductsByStatus,
  listAllProducts,
  deleteProduct,
} from './products';

export {
  insertImage,
  listImagesForProduct,
  setImageSyncState,
  deleteImage,
} from './product-images';

export {
  recordUpload as recordMediaUpload,
  markAttached as markMediaAttached,
  markOrphan as markMediaOrphan,
  deleteUpload as deleteMediaUpload,
  listOrphansOlderThan as listMediaOrphansOlderThan,
} from './media-uploads';

export {
  upsertCategory,
  listCategories,
  getCategory,
  deleteCategory,
  mostRecentCachedAt,
} from './store-categories';

export {
  recordAttempt,
  listAttemptsForProduct,
} from './sync-attempts';

export {
  getConfig,
  getConfigNumber,
  getConfigBoolean,
  setConfig,
  setConfigBoolean,
  listAllConfig,
} from './app-config';

export {
  enqueue as enqueueQueueItem,
  claimNext as claimNextQueueItem,
  completeItem as completeQueueItem,
  failItem as failQueueItem,
  markFailed as markQueueItemFailed,
  listQueued as listQueuedItems,
  getByProduct as getQueueItemForProduct,
} from './queue';

export {
  recordUpload as recordLedgerUpload,
  attachToProduct as attachLedgerToProduct,
  markOrphan as markLedgerOrphan,
  listOrphansOlderThan as listLedgerOrphansOlderThan,
  deleteRow as deleteLedgerRow,
} from './media-ledger';
export type { MediaLedgerRow, MediaLedgerStatus } from './media-ledger';
