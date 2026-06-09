// src/db/index.ts — typed wrapper over `expo-sqlite`.
//
// Implements the `DB` contract from Design §5: `exec`, `query<T>`,
// `run`, `transaction`, `close`. Opens the database, enables WAL +
// foreign keys, and exposes a `withTransaction` helper for multi-statement
// operations. Pure I/O: no business logic lives here.

import * as SQLite from 'expo-sqlite';
import type { MigrationError } from '../error-presentation';

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
  /** Test seam: the underlying expo-sqlite handle. */
  __raw: SQLite.SQLiteDatabase;
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
}

function wrap(raw: SQLite.SQLiteDatabase): DB {
  const db: DB = {
    async exec(sql: string): Promise<void> {
      await raw.execAsync(sql);
    },
    async query<T>(
      sql: string,
      params?: ReadonlyArray<SqlParam>,
    ): Promise<T[]> {
      return raw.getAllAsync<T>(sql, ...(params ?? []));
    },
    async queryOne<T>(
      sql: string,
      params?: ReadonlyArray<SqlParam>,
    ): Promise<T | null> {
      const row = await raw.getFirstAsync<T>(sql, ...(params ?? []));
      return row ?? null;
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
      await raw.withTransactionAsync(async (txHandle) => {
        const tx = wrap(txHandle as unknown as SQLite.SQLiteDatabase);
        outcome = await fn(tx);
      });
      return outcome;
    },
    async withTransaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
      return db.transaction(fn);
    },
    async getUserVersion(): Promise<number> {
      const result = await raw.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
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
