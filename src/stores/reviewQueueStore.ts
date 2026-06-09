// src/stores/reviewQueueStore.ts — read-through state for the review
// queue (WU-3, review-queue spec R1-R6).
//
// This store is a thin façade over the local DB. It does NOT hold a
// mirrored copy of products; on every `load()` it queries the
// `products` table. Subsequent updates write through to the DB and
// re-read to keep the list fresh.
//
// The store is intentionally coupled to a `DB` instance. The factory
// `createReviewQueueStore(db)` returns a Zustand `useStore` hook plus
// the underlying `getState`/`setState` for tests that don't need
// React.

import { create } from 'zustand';
import { productsRepo } from '../db/repos';
import type { DB } from '../db';
import type {
  Product,
  ProductStatus,
} from '../domain/types';
import { canTransition } from '../domain/status';
import { presentError, type CatalogEntry } from '../error-presentation';

export type ReviewQueueState = {
  db: DB | null;
  products: ReadonlyArray<Product>;
  selectedId: string | null;
  isLoading: boolean;
  lastError: CatalogEntry | null;
};

export type ReviewQueueActions = {
  setDb: (db: DB) => void;
  load: () => Promise<void>;
  selectProduct: (id: string | null) => void;
  updateField: (
    id: string,
    patch: Partial<
      Pick<
        Product,
        'name' | 'price' | 'description' | 'categoryId' | 'categoryName' | 'publishOnSync'
      >
    >,
  ) => Promise<CatalogEntry | null>;
  confirmPrice: (id: string) => Promise<CatalogEntry | null>;
  approve: (id: string) => Promise<CatalogEntry | null>;
  delete: (id: string) => Promise<CatalogEntry | null>;
  requeue: (id: string) => Promise<CatalogEntry | null>;
};

export type ReviewQueueStore = ReviewQueueState & ReviewQueueActions;

export const createReviewQueueStore = (db: DB) =>
  create<ReviewQueueStore>((set, get) => {
    const setError = (errOrKey: unknown): CatalogEntry => {
      const entry = presentError(errOrKey);
      set({ lastError: entry });
      return entry;
    };

    const reload = async (): Promise<void> => {
      const database = get().db ?? db;
      const products = await productsRepo.listAll(database);
      set({ products });
    };

    return {
      db,
      products: [],
      selectedId: null,
      isLoading: false,
      lastError: null,

      setDb: (database) => {
        set({ db: database });
      },
      load: async () => {
        set({ isLoading: true, lastError: null });
        try {
          await reload();
        } catch (err) {
          setError(err);
        } finally {
          set({ isLoading: false });
        }
      },
      selectProduct: (id) => {
        set({ selectedId: id });
      },
      updateField: async (id, patch) => {
        set({ lastError: null });
        try {
          await productsRepo.update(db, id, patch);
          await reload();
          return null;
        } catch (err) {
          return setError(err);
        }
      },
      confirmPrice: async (id) => {
        set({ lastError: null });
        try {
          const product = await productsRepo.get(db, id);
          if (!product) {
            return setError('error-inesperado');
          }
          if (!Number.isInteger(product.price) || product.price <= 0) {
            const entry = presentError('datos-invalidos', {
              field: 'precio',
              reason: 'must-be-positive',
            });
            set({ lastError: entry });
            return entry;
          }
          await productsRepo.update(db, id, { priceConfirmed: true });
          await reload();
          return null;
        } catch (err) {
          return setError(err);
        }
      },
      approve: async (id) => {
        set({ lastError: null });
        try {
          const product = await productsRepo.get(db, id);
          if (!product) {
            return setError('error-inesperado');
          }
          if (!product.priceConfirmed) {
            const entry = presentError('precio-no-confirmado', { productId: id });
            set({ lastError: entry });
            return entry;
          }
          const nextStatus: ProductStatus = 'ready';
          if (!canTransition(product.status, nextStatus)) {
            const entry = presentError('datos-invalidos', {
              field: 'estado',
              reason: 'invalid-format',
            });
            set({ lastError: entry });
            return entry;
          }
          await productsRepo.update(db, id, { status: nextStatus });
          await reload();
          return null;
        } catch (err) {
          return setError(err);
        }
      },
      delete: async (id) => {
        set({ lastError: null });
        try {
          await productsRepo.delete(db, id);
          await reload();
          return null;
        } catch (err) {
          return setError(err);
        }
      },
      requeue: async (id) => {
        set({ lastError: null });
        try {
          const product = await productsRepo.get(db, id);
          if (!product) {
            return setError('error-inesperado');
          }
          const nextStatus: ProductStatus = product.priceConfirmed
            ? 'ready'
            : 'pending';
          if (!canTransition(product.status, nextStatus)) {
            return setError(
              presentError('datos-invalidos', {
                field: 'estado',
                reason: 'invalid-format',
              }),
            );
          }
          await productsRepo.update(db, id, {
            status: nextStatus,
            lastErrorKey: null,
          });
          await reload();
          return null;
        } catch (err) {
          return setError(err);
        }
      },
    };
  });

// ---------------------------------------------------------------------------
// Module-level singleton — the review queue is a single read-through
// façade for the app. The DB is wired lazily on first call to
// `useReviewQueueStore()` (which `openDB()`s the default handle and
// memoizes the store). Production code (the capture, queue, and
// edit screens) calls the hook; tests can call
// `__resetReviewQueueStoreForTest` between cases to drop the memoized
// instance.
// ---------------------------------------------------------------------------

import { openDB as openDefaultDB } from '../db';

type UseReviewQueueStoreFn = ReturnType<typeof createReviewQueueStore>;
let cachedStore: UseReviewQueueStoreFn | null = null;

async function getOrCreateStore(): Promise<UseReviewQueueStoreFn> {
  if (cachedStore === null) {
    const db = await openDefaultDB();
    cachedStore = createReviewQueueStore(db);
  }
  return cachedStore;
}

/**
 * Async getter used by screens and tests. Returns a memoized Zustand
 * hook bound to the default DB.
 */
export async function useReviewQueueStore(): Promise<UseReviewQueueStoreFn> {
  return getOrCreateStore();
}

export function __resetReviewQueueStoreForTest(): void {
  cachedStore = null;
}

/** Pure helper: count products per status. */
export function countByStatus(
  products: ReadonlyArray<Product>,
): Record<ProductStatus, number> {
  const counts: Record<ProductStatus, number> = {
    pending: 0,
    ready: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    'needs-attention': 0,
  };
  for (const p of products) {
    counts[p.status] += 1;
  }
  return counts;
}
