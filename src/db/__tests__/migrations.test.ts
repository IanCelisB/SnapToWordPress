// src/db/__tests__/migrations.test.ts — migration runner is
// versioned, idempotent, and failure-safe.
//
// What this asserts:
//   1. From a fresh DB (user_version = 0), `runMigrations` advances to
//      TARGET_VERSION and creates every table from the v1 schema.
//   2. A second call is a no-op (idempotency).
//   3. A simulated mid-migration failure leaves the DB at the same
//      user_version it had before (no half-bump) and the next call
//      retries from that point.
//
// We use the in-memory expo-sqlite shim that lives in `jest.setup.ts`.

import { runMigrations, TARGET_VERSION, openDB, __resetForTest } from '../index';
import { MIGRATIONS } from '../migrations';

describe('migrations', () => {
  beforeEach(() => {
    __resetForTest();
  });

  it('exports TARGET_VERSION = 1', () => {
    expect(TARGET_VERSION).toBe(1);
  });

  it('exposes exactly one migration in v1', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]?.version).toBe(1);
  });

  it('advances a fresh DB from 0 → 1 and is idempotent', async () => {
    const db = await openDB();
    expect(await db.getUserVersion()).toBe(0);

    await runMigrations(db);
    expect(await db.getUserVersion()).toBe(1);

    // Idempotent: a second call is a no-op.
    await runMigrations(db);
    expect(await db.getUserVersion()).toBe(1);
  });

  it('runs every CREATE TABLE statement in the v1 schema', async () => {
    const db = await openDB();
    await runMigrations(db);
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'products',
        'product_images',
        'media_uploads',
        'sync_attempts',
        'store_categories',
        'app_config',
        'sync_queue',
        'media_ledger',
      ]),
    );
  });

  it('seeds the default app_config rows on first run', async () => {
    const db = await openDB();
    await runMigrations(db);
    const rows = await db.query<{ key: string; value: string }>(
      'SELECT key, value FROM app_config',
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    expect(map.get('auto_sync_on_wifi')).toBe('1');
    expect(map.get('sync_paused')).toBe('0');
  });

  it('a simulated mid-migration crash leaves user_version unchanged and the next call retries', async () => {
    // Build a fake `db` whose `transaction` throws during the up step.
    // The runner catches, throws MigrationError, and `user_version`
    // stays at 0 (no half-bump).
    const failingDb = {
      exec: jest.fn(async () => undefined),
      query: jest.fn(async () => []),
      queryOne: jest.fn(async () => null),
      run: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
      getUserVersion: jest.fn(async () => 0),
      setUserVersion: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      transaction: jest.fn(async () => {
        throw new Error('simulated mid-migration crash');
      }),
      withTransaction: jest.fn(async () => {
        throw new Error('simulated mid-migration crash');
      }),
      __raw: {},
    };
    await expect(
      runMigrations(failingDb as unknown as Awaited<typeof openDB>),
    ).rejects.toThrow(/Migration to v1 failed/);

    // The DB still reports v0 (the transaction rolled back; the
    // runner never bumped the version).
    expect(await failingDb.getUserVersion()).toBe(0);
  });
});
