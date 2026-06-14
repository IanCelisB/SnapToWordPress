// src/db/__tests__/sqlite-shim.test.ts — unit tests for the in-memory web shim.
//
// These run in the jest node environment (not web) and validate that the
// shim handles the SQL patterns the repos actually generate.

import { createWebDatabase, resetWebDatabases } from '../sqlite-shim';

beforeEach(() => {
  resetWebDatabases();
});

describe('WebSqliteShim', () => {
  it('INSERT and SELECT a row', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync(`CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
    const r = await db.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'hello');
    expect(r.changes).toBe(1);
    const rows = await db.getAllAsync<{ id: number; name: string }>('SELECT * FROM t');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('hello');
  });

  it('UPDATE modifies matching rows', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, val INTEGER)');
    await db.runAsync('INSERT INTO t (id, val) VALUES (?, ?)', 1, 10);
    await db.runAsync('INSERT INTO t (id, val) VALUES (?, ?)', 2, 20);
    const r = await db.runAsync('UPDATE t SET val = ? WHERE val > ?', 99, 15);
    expect(r.changes).toBe(1);
    const rows = await db.getAllAsync<{ id: number; val: number }>('SELECT * FROM t ORDER BY id ASC');
    expect(rows[0]!.val).toBe(10);
    expect(rows[1]!.val).toBe(99);
  });

  it('DELETE removes matching rows', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await db.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'a');
    await db.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', 2, 'b');
    const r = await db.runAsync('DELETE FROM t WHERE name = ?', 'a');
    expect(r.changes).toBe(1);
    const rows = await db.getAllAsync('SELECT * FROM t');
    expect(rows).toHaveLength(1);
  });

  it('getFirstAsync returns the first matching row', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    await db.runAsync('INSERT INTO t (id, val) VALUES (?, ?)', 1, 'x');
    await db.runAsync('INSERT INTO t (id, val) VALUES (?, ?)', 2, 'y');
    const row = await db.getFirstAsync<{ val: string }>('SELECT * FROM t WHERE id = ?', 2);
    expect(row?.val).toBe('y');
  });

  it('ORDER BY ASC and DESC', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, score INTEGER)');
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 1, 30);
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 2, 10);
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 3, 20);

    const asc = await db.getAllAsync<{ id: number }>('SELECT * FROM t ORDER BY score ASC');
    expect(asc.map((r) => r.id)).toEqual([2, 3, 1]);

    const desc = await db.getAllAsync<{ id: number }>('SELECT * FROM t ORDER BY score DESC');
    expect(desc.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it('ON CONFLICT DO UPDATE replaces an existing row', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await db.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'old');
    const r = await db.runAsync(
      'INSERT OR REPLACE INTO t (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = ?',
      1, 'new', 'new',
    );
    expect(r.changes).toBe(1);
    const row = await db.getFirstAsync<{ name: string }>('SELECT * FROM t WHERE id = ?', 1);
    expect(row?.name).toBe('new');
  });

  it('INSERT OR IGNORE with ON CONFLICT skips on conflict', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await db.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'first');
    const r = await db.runAsync(
      'INSERT OR IGNORE INTO t (id, name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING',
      1, 'second',
    );
    expect(r.changes).toBe(0);
    const row = await db.getFirstAsync<{ name: string }>('SELECT * FROM t WHERE id = ?', 1);
    expect(row?.name).toBe('first');
  });

  it('PRAGMA user_version round-trips', async () => {
    const db = await createWebDatabase('test');
    const before = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(before?.user_version).toBe(0);
    await db.execAsync('PRAGMA user_version = 42');
    const after = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(after?.user_version).toBe(42);
  });

  it('withTransactionAsync runs the callback', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)');
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (id, v) VALUES (?, ?)', 1, 10);
      await db.runAsync('INSERT INTO t (id, v) VALUES (?, ?)', 2, 20);
    });
    const rows = await db.getAllAsync('SELECT * FROM t');
    expect(rows).toHaveLength(2);
  });

  it('cascade delete for products -> product_images / sync_queue / sync_attempts', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE products (local_id TEXT PRIMARY KEY)');
    await db.execAsync('CREATE TABLE product_images (id INTEGER PRIMARY KEY, product_local_id TEXT)');
    await db.execAsync('CREATE TABLE sync_queue (id INTEGER PRIMARY KEY, product_local_id TEXT)');
    await db.execAsync('CREATE TABLE sync_attempts (id INTEGER PRIMARY KEY, product_local_id TEXT)');

    await db.runAsync('INSERT INTO products (local_id) VALUES (?)', 'p1');
    await db.runAsync('INSERT INTO product_images (id, product_local_id) VALUES (?, ?)', 1, 'p1');
    await db.runAsync('INSERT INTO sync_queue (id, product_local_id) VALUES (?, ?)', 1, 'p1');
    await db.runAsync('INSERT INTO sync_attempts (id, product_local_id) VALUES (?, ?)', 1, 'p1');

    await db.runAsync('DELETE FROM products WHERE local_id = ?', 'p1');

    const imgs = await db.getAllAsync('SELECT * FROM product_images');
    const queue = await db.getAllAsync('SELECT * FROM sync_queue');
    const attempts = await db.getAllAsync('SELECT * FROM sync_attempts');
    expect(imgs).toHaveLength(0);
    expect(queue).toHaveLength(0);
    expect(attempts).toHaveLength(0);
  });

  it('WHERE with IN list', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, status TEXT)');
    await db.runAsync('INSERT INTO t (id, status) VALUES (?, ?)', 1, 'active');
    await db.runAsync('INSERT INTO t (id, status) VALUES (?, ?)', 2, 'inactive');
    await db.runAsync('INSERT INTO t (id, status) VALUES (?, ?)', 3, 'active');
    const rows = await db.getAllAsync<{ id: number }>(
      "SELECT * FROM t WHERE status IN ('active')",
    );
    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });

  it('WHERE with numeric comparison operators', async () => {
    const db = await createWebDatabase('test');
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, score INTEGER)');
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 1, 5);
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 2, 15);
    await db.runAsync('INSERT INTO t (id, score) VALUES (?, ?)', 3, 25);
    const rows = await db.getAllAsync<{ id: number }>('SELECT * FROM t WHERE score >= ?', 15);
    expect(rows.map((r) => r.id)).toEqual([2, 3]);
  });

  it('SELECT from sqlite_master returns table list', async () => {
    const db = await createWebDatabase('test');
    const tables = await db.getAllAsync<{ name: string }>('SELECT * FROM sqlite_master');
    expect(tables.length).toBeGreaterThan(0);
  });

  it('separate databases are isolated', async () => {
    const db1 = await createWebDatabase('db1');
    const db2 = await createWebDatabase('db2');
    await db1.execAsync('CREATE TABLE t (id INTEGER)');
    await db1.runAsync('INSERT INTO t (id) VALUES (?)', 1);
    const rows2 = await db2.getAllAsync('SELECT * FROM t');
    expect(rows2).toHaveLength(0);
  });
});
