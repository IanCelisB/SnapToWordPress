// src/stores/__tests__/reviewQueueStore.test.ts — review-queue store
// unit tests (WU-3, review-queue spec R1-R6 + price-gate acceptance).
//
// The store is read-through: load() pulls all products from the DB;
// approve / delete / confirmPrice / requeue write through to the DB
// and re-load. Each test opens a fresh in-memory DB (the
// `expo-sqlite` mock keeps them isolated by name in the test setup).

import { openDB, runMigrations, __resetForTest } from '../../db';
import { productsRepo } from '../../db/repos';
import {
  createReviewQueueStore,
  countByStatus,
  __resetReviewQueueStoreForTest,
} from '../reviewQueueStore';
import type { DB } from '../../db';
import type { Product } from '../../domain/types';

const baseProduct = (
  localId: string,
  overrides: Partial<Product> = {},
): Omit<
  Product,
  'status' | 'publishOnSync' | 'priceConfirmed' | 'wcProductId' | 'lastErrorKey' | 'lastAttemptAt' | 'nextAttemptAt' | 'createdAt' | 'updatedAt'
> => ({
  localId,
  name: 'Remera',
  price: 1500,
  categoryId: 1,
  categoryName: 'Remeras',
  description: null,
  ...overrides,
});

describe('reviewQueueStore', () => {
  let db: DB;

  beforeEach(async () => {
    __resetForTest();
    __resetReviewQueueStoreForTest();
    db = await openDB();
    await runMigrations(db);
  });

  describe('load()', () => {
    it('returns an empty list when the DB has no products', async () => {
      const store = createReviewQueueStore(db);
      await store.getState().load();
      expect(store.getState().products).toEqual([]);
      expect(store.getState().isLoading).toBe(false);
    });

    it('returns all products ordered by created_at DESC', async () => {
      await productsRepo.insert(db, baseProduct('a'));
      await productsRepo.insert(db, baseProduct('b'));
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const ids = store.getState().products.map((p) => p.localId);
      // DESC: newest first → 'b' was inserted after 'a'.
      expect(ids).toEqual(['b', 'a']);
    });
  });

  describe('updateField()', () => {
    it('writes the patch through to the DB and re-reads', async () => {
      await productsRepo.insert(db, baseProduct('a'));
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const err = await store
        .getState()
        .updateField('a', { name: 'Remera nueva', price: 2000 });
      expect(err).toBeNull();
      const after = store.getState().products.find((p) => p.localId === 'a');
      expect(after?.name).toBe('Remera nueva');
      expect(after?.price).toBe(2000);
    });
  });

  describe('confirmPrice()', () => {
    it('flips price_confirmed to true when the price is valid', async () => {
      await productsRepo.insert(db, baseProduct('a'));
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const err = await store.getState().confirmPrice('a');
      expect(err).toBeNull();
      const after = store.getState().products.find((p) => p.localId === 'a');
      expect(after?.priceConfirmed).toBe(true);
    });

    it('rejects with a datos-invalidos entry if the price is 0', async () => {
      await productsRepo.insert(db, baseProduct('a', { price: 0 }));
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const err = await store.getState().confirmPrice('a');
      expect(err).not.toBeNull();
      expect(err?.message.toLowerCase()).toContain('mayor a cero');
    });
  });

  describe('approve()', () => {
    it('transitions pending → ready AND requires price_confirmed', async () => {
      await productsRepo.insert(db, baseProduct('a'));
      const store = createReviewQueueStore(db);
      await store.getState().load();

      // First call: price is unconfirmed → should reject with
      // precio-no-confirmado.
      const blocked = await store.getState().approve('a');
      expect(blocked).not.toBeNull();
      expect(blocked?.title).toBe('Precio sin confirmar');
      const stillPending = store
        .getState()
        .products.find((p) => p.localId === 'a');
      expect(stillPending?.status).toBe('pending');
      expect(stillPending?.priceConfirmed).toBe(false);

      // Confirm the price and retry.
      await store.getState().confirmPrice('a');
      const ok = await store.getState().approve('a');
      expect(ok).toBeNull();
      const after = store.getState().products.find((p) => p.localId === 'a');
      expect(after?.status).toBe('ready');
    });
  });

  describe('delete()', () => {
    it('removes the row from the products table', async () => {
      await productsRepo.insert(db, baseProduct('a'));
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const err = await store.getState().delete('a');
      expect(err).toBeNull();
      const after = await productsRepo.get(db, 'a');
      expect(after).toBeNull();
      expect(store.getState().products).toHaveLength(0);
    });
  });

  describe('requeue()', () => {
    it('moves needs-attention → ready when price is confirmed', async () => {
      await productsRepo.insert(
        db,
        baseProduct('a', { status: 'needs-attention' }),
      );
      const store = createReviewQueueStore(db);
      await store.getState().load();
      // confirm price first so requeue can move to ready
      await productsRepo.update(db, 'a', { priceConfirmed: true });
      const err = await store.getState().requeue('a');
      expect(err).toBeNull();
      const after = store.getState().products.find((p) => p.localId === 'a');
      expect(after?.status).toBe('ready');
      expect(after?.lastErrorKey).toBeNull();
    });

    it('moves needs-attention → pending when price is NOT confirmed', async () => {
      await productsRepo.insert(
        db,
        baseProduct('a', { status: 'needs-attention' }),
      );
      const store = createReviewQueueStore(db);
      await store.getState().load();
      const err = await store.getState().requeue('a');
      expect(err).toBeNull();
      const after = store.getState().products.find((p) => p.localId === 'a');
      expect(after?.status).toBe('pending');
    });
  });
});

describe('countByStatus()', () => {
  it('returns zeros for an empty list', () => {
    expect(countByStatus([])).toEqual({
      pending: 0,
      ready: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      'needs-attention': 0,
    });
  });

  it('counts one per status', () => {
    const counts = countByStatus([
      { status: 'pending' },
      { status: 'pending' },
      { status: 'ready' },
      { status: 'synced' },
      { status: 'synced' },
      { status: 'synced' },
    ] as unknown as Product[]);
    expect(counts.pending).toBe(2);
    expect(counts.ready).toBe(1);
    expect(counts.synced).toBe(3);
  });
});
