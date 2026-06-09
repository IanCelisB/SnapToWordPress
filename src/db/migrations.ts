// src/db/migrations.ts — versioned, idempotent, failure-safe migration runner.
//
// Per Design §6 + local-persistence spec R1:
//   - The current schema is `TARGET_VERSION = 1`.
//   - Each migration is a `(db) => Promise<void>` function that runs
//     inside a transaction. If ANY statement fails, the transaction
//     rolls back, no PRAGMA bump happens, and the next launch retries
//     the SAME migration from scratch.
//   - `runMigrations` is idempotent: it inspects `PRAGMA user_version`
//     and only runs the steps whose index is `>= user_version`.
//   - A failed step throws `MigrationError`; the launcher surfaces
//     `almacenamiento-error` and BLOCKS new captures.

import { MigrationError } from '../error-presentation';
import type { DB } from './index';

export const TARGET_VERSION = 1;

export type MigrationStep = {
  version: number;
  up: (db: DB) => Promise<void>;
};

/** A list of every migration in order. v1 is the only step in v1. */
export const MIGRATIONS: ReadonlyArray<MigrationStep> = [
  {
    version: 1,
    async up(db) {
      // 1. products
      await db.exec(`
        CREATE TABLE products (
          local_id            TEXT PRIMARY KEY,
          name                TEXT NOT NULL,
          price               INTEGER NOT NULL CHECK (price > 0),
          category_id         INTEGER,
          category_name       TEXT,
          description         TEXT,
          status              TEXT NOT NULL
                              CHECK (status IN ('pending','ready','syncing','synced','failed','needs-attention')),
          publish_on_sync     INTEGER NOT NULL DEFAULT 0,
          price_confirmed     INTEGER NOT NULL DEFAULT 0,
          wc_product_id       INTEGER,
          last_error_key      TEXT,
          last_attempt_at     INTEGER,
          next_attempt_at     INTEGER,
          created_at          INTEGER NOT NULL,
          updated_at          INTEGER NOT NULL
        );
      `);
      await db.exec(
        'CREATE INDEX idx_products_status ON products(status);',
      );
      await db.exec(
        'CREATE INDEX idx_products_next ON products(next_attempt_at) WHERE status IN (\'pending\',\'ready\');',
      );

      // 2. product_images
      await db.exec(`
        CREATE TABLE product_images (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          product_local_id    TEXT NOT NULL REFERENCES products(local_id) ON DELETE CASCADE,
          file_path           TEXT NOT NULL,
          position            INTEGER NOT NULL,
          sync_state          TEXT NOT NULL DEFAULT 'pending'
                              CHECK (sync_state IN ('pending','excluded','missing')),
          created_at          INTEGER NOT NULL
        );
      `);
      await db.exec(
        'CREATE INDEX idx_images_product ON product_images(product_local_id);',
      );

      // 3. media_uploads
      await db.exec(`
        CREATE TABLE media_uploads (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          wc_media_id         INTEGER NOT NULL UNIQUE,
          product_local_id    TEXT REFERENCES products(local_id) ON DELETE SET NULL,
          status              TEXT NOT NULL
                              CHECK (status IN ('uploaded','attached','orphan')),
          orphan_since        INTEGER,
          uploaded_at         INTEGER NOT NULL,
          attached_at         INTEGER
        );
      `);
      await db.exec(
        'CREATE INDEX idx_media_orphans ON media_uploads(status, orphan_since) WHERE status = \'orphan\';',
      );

      // 4. sync_attempts
      await db.exec(`
        CREATE TABLE sync_attempts (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          product_local_id    TEXT NOT NULL REFERENCES products(local_id) ON DELETE CASCADE,
          attempted_at        INTEGER NOT NULL,
          error_class         TEXT NOT NULL
                              CHECK (error_class IN ('transient','auth','validation','unexpected')),
          error_key           TEXT NOT NULL,
          http_status         INTEGER,
          attempt_in_run      INTEGER NOT NULL
        );
      `);
      await db.exec(
        'CREATE INDEX idx_attempts_product ON sync_attempts(product_local_id, attempted_at DESC);',
      );

      // 5. store_categories
      await db.exec(`
        CREATE TABLE store_categories (
          wc_category_id      INTEGER PRIMARY KEY,
          name                TEXT NOT NULL,
          parent_id           INTEGER,
          cached_at           INTEGER NOT NULL
        );
      `);

      // 6. app_config
      await db.exec(`
        CREATE TABLE app_config (
          key                 TEXT PRIMARY KEY,
          value               TEXT NOT NULL
        );
      `);

      // 7. sync_queue (the serial worker's queue; status transitions live
      //    here so the worker can claim/advance atomically).
      await db.exec(`
        CREATE TABLE sync_queue (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          product_local_id    TEXT NOT NULL UNIQUE REFERENCES products(local_id) ON DELETE CASCADE,
          enqueued_at         INTEGER NOT NULL,
          status              TEXT NOT NULL
                              CHECK (status IN ('queued','in-flight','failed')),
          attempt_count       INTEGER NOT NULL DEFAULT 0,
          next_attempt_at     INTEGER NOT NULL,
          last_error_key      TEXT,
          claimed_at          INTEGER
        );
      `);
      await db.exec(
        'CREATE INDEX idx_queue_status ON sync_queue(status, next_attempt_at);',
      );

      // 8. media_ledger (WU-2 / WU-3 — tracks which product used which
      //    uploaded media item; the orphan sweeper scans for items where
      //    no product claims them).
      await db.exec(`
        CREATE TABLE media_ledger (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          wc_media_id         INTEGER NOT NULL UNIQUE,
          product_local_id    TEXT REFERENCES products(local_id) ON DELETE SET NULL,
          status              TEXT NOT NULL
                              CHECK (status IN ('uploaded','attached','orphan')),
          orphan_since        INTEGER,
          uploaded_at         INTEGER NOT NULL,
          attached_at         INTEGER
        );
      `);
      await db.exec(
        'CREATE INDEX idx_ledger_orphans ON media_ledger(status, orphan_since) WHERE status = \'orphan\';',
      );

      // 9. Default app_config rows.
      await db.run(
        'INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)',
        ['auto_sync_on_wifi', '1'],
      );
      await db.run(
        'INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)',
        ['sync_paused', '0'],
      );
    },
  },
];

export async function runMigrations(db: DB): Promise<void> {
  const current = await db.getUserVersion();
  if (current >= TARGET_VERSION) {
    return;
  }
  for (const step of MIGRATIONS) {
    if (step.version <= current) {
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        await step.up(tx);
        await tx.setUserVersion(step.version);
      });
    } catch (err) {
      throw new MigrationError(
        `Migration to v${step.version} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }
  }
}
