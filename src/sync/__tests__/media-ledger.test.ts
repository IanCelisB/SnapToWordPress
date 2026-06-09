// src/sync/__tests__/media-ledger.test.ts — the typed wrapper over the
// `media_ledger` table that the worker reads/writes.

import { openDB, runMigrations, __resetForTest } from '../../db';
import { productsRepo } from '../../db/repos';

const resetSqliteMock = (): void => {
  const reset = (globalThis as { __resetExpoSqliteMock?: () => void })
    .__resetExpoSqliteMock;
  if (reset) reset();
};
import {
  recordUpload,
  attachToProduct,
  markOrphan,
  listOrphansOlderThan,
  deleteRow,
  reconcileOrphans,
} from '../media-ledger';
import type { NewProduct } from '../../domain/types';

function makeProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return {
    localId: 'prod-1',
    name: 'Remera',
    price: 1500,
    categoryId: 1,
    categoryName: 'Remeras',
    description: null,
    publishOnSync: false,
    priceConfirmed: true,
    ...overrides,
  };
}

describe('sync/media-ledger', () => {
  beforeEach(() => {
    resetSqliteMock();
    __resetForTest();
  });

  it('records an upload and lists it as orphan after grace', async () => {
    const db = await openDB();
    await runMigrations(db);
    const now = 1_000_000;
    await recordUpload(db, 1001, now);
    const list = await listOrphansOlderThan(db, now + 1, 10);
    // The row is "uploaded" — listOrphansOlderThan filters on
    // status='orphan' so it won't appear. We markOrphan to make
    // it visible.
    expect(list).toEqual([]);
    await markOrphan(db, 1001, now);
    const after = await listOrphansOlderThan(db, now + 1, 10);
    expect(after).toHaveLength(1);
    expect(after[0]?.status).toBe('orphan');
  });

  it('attaches a media to a product and removes it from the orphan list', async () => {
    const db = await openDB();
    await runMigrations(db);
    const p = makeProduct();
    await productsRepo.insert(db, p);
    const now = 2_000_000;
    await recordUpload(db, 2002, now);
    await markOrphan(db, 2002, now);
    expect(await listOrphansOlderThan(db, now + 1, 10)).toHaveLength(1);
    await attachToProduct(db, 2002, p.localId, now);
    expect(await listOrphansOlderThan(db, now + 1, 10)).toHaveLength(0);
  });

  it('deleteRow removes the row from the ledger', async () => {
    const db = await openDB();
    await runMigrations(db);
    const now = 3_000_000;
    await recordUpload(db, 3003, now);
    await markOrphan(db, 3003, now);
    expect(await listOrphansOlderThan(db, now + 1, 10)).toHaveLength(1);
    await deleteRow(db, 3003);
    expect(await listOrphansOlderThan(db, now + 1, 10)).toHaveLength(0);
  });

  it('reconcileOrphans is a no-op on a clean tree', async () => {
    const db = await openDB();
    await runMigrations(db);
    const count = await reconcileOrphans(db, 0, 1_000_000);
    expect(count).toBe(0);
  });
});
