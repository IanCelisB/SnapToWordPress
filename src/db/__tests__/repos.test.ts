// src/db/__tests__/repos.test.ts — round-trip + status transitions + FK cascade.
//
// We open a real (in-memory) DB, run migrations, then exercise:
//   - productsRepo.create + listForSync + listByStatus
//   - imagesRepo insert + listForProduct
//   - queueRepo.enqueue (idempotent) + claimNext
//   - deleteProduct cascades to product_images (FK)

import { openDB, runMigrations, __resetForTest } from '../index';
import { productsRepo, imagesRepo, queueRepo } from '../repos';
import { uuid } from '../../../src/infra/uuid';

describe('productsRepo', () => {
  beforeEach(() => {
    __resetForTest();
  });

  it('round-trips a product and lists it by status', async () => {
    const db = await openDB();
    await runMigrations(db);
    const id = uuid();
    await productsRepo.insert(db, {
      localId: id,
      name: 'Remera azul',
      price: 1500,
      categoryId: null,
      categoryName: null,
      description: null,
    });
    const got = await productsRepo.get(db, id);
    expect(got).not.toBeNull();
    expect(got?.name).toBe('Remera azul');
    expect(got?.price).toBe(1500);
    expect(got?.status).toBe('pending');
    expect(got?.publishOnSync).toBe(false);
    expect(got?.priceConfirmed).toBe(false);

    const pending = await productsRepo.listByStatus(db, 'pending');
    expect(pending.map((p) => p.localId)).toContain(id);
  });

  it('updates a product and reflects the new status', async () => {
    const db = await openDB();
    await runMigrations(db);
    const id = uuid();
    await productsRepo.insert(db, {
      localId: id,
      name: 'Remera',
      price: 1000,
      categoryId: null,
      categoryName: null,
      description: null,
    });
    await productsRepo.update(db, id, { status: 'ready', priceConfirmed: true });
    const after = await productsRepo.get(db, id);
    expect(after?.status).toBe('ready');
    expect(after?.priceConfirmed).toBe(true);
  });

  it('listForSync returns only pending + ready rows', async () => {
    const db = await openDB();
    await runMigrations(db);
    const a = uuid();
    const b = uuid();
    const c = uuid();
    await productsRepo.insert(db, {
      localId: a, name: 'a', price: 100, categoryId: null, categoryName: null, description: null,
      status: 'pending',
    });
    await productsRepo.insert(db, {
      localId: b, name: 'b', price: 200, categoryId: null, categoryName: null, description: null,
      status: 'ready',
    });
    await productsRepo.insert(db, {
      localId: c, name: 'c', price: 300, categoryId: null, categoryName: null, description: null,
      status: 'synced',
    });
    const syncable = await productsRepo.listForSync(db);
    const ids = syncable.map((p) => p.localId).sort();
    expect(ids).toEqual([a, b].sort());
  });

  it('deleting a product cascades to product_images', async () => {
    const db = await openDB();
    await runMigrations(db);
    const id = uuid();
    await productsRepo.insert(db, {
      localId: id, name: 'P', price: 1, categoryId: null, categoryName: null, description: null,
    });
    await imagesRepo.insert(db, {
      productLocalId: id,
      filePath: '/docs/p/1.jpg',
      position: 0,
    });
    await imagesRepo.insert(db, {
      productLocalId: id,
      filePath: '/docs/p/2.jpg',
      position: 1,
    });
    let images = await imagesRepo.listForProduct(db, id);
    expect(images).toHaveLength(2);
    await productsRepo.delete(db, id);
    images = await imagesRepo.listForProduct(db, id);
    expect(images).toHaveLength(0);
  });
});

describe('queueRepo', () => {
  beforeEach(() => {
    __resetForTest();
  });

  it('enqueue is idempotent on the same product', async () => {
    const db = await openDB();
    await runMigrations(db);
    const productId = uuid();
    await productsRepo.insert(db, {
      localId: productId, name: 'P', price: 1, categoryId: null, categoryName: null, description: null,
    });
    const a = await queueRepo.enqueue(db, productId);
    const b = await queueRepo.enqueue(db, productId);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('queued');
  });

  it('claimNext picks a queued row and marks it in-flight atomically', async () => {
    const db = await openDB();
    await runMigrations(db);
    const a = uuid();
    const b = uuid();
    await productsRepo.insert(db, {
      localId: a, name: 'A', price: 1, categoryId: null, categoryName: null, description: null,
    });
    await productsRepo.insert(db, {
      localId: b, name: 'B', price: 2, categoryId: null, categoryName: null, description: null,
    });
    await queueRepo.enqueue(db, a);
    await queueRepo.enqueue(db, b);

    const claimed = await queueRepo.claimNext(db);
    expect(claimed).not.toBeNull();
    expect(claimed?.status).toBe('in-flight');

    // The other row is still queued.
    const remaining = await queueRepo.list(db);
    const stillQueued = remaining.filter((r) => r.status === 'queued');
    expect(stillQueued).toHaveLength(1);
    expect(stillQueued[0]?.productLocalId).not.toBe(claimed?.productLocalId);
  });
});
