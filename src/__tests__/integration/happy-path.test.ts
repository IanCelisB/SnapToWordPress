// src/__tests__/integration/happy-path.test.ts — integration test
// for the full sync happy path (WU-5 task 5.5).
//
// Flow:
//   1. Open in-memory SQLite DB
//   2. Run migrations
//   3. Insert a product with status='ready'
//   4. Enqueue the product into sync_queue
//   5. Run the sync worker with a mocked WooClient
//   6. Assert product status → 'synced'
//   7. Assert wc_product_id is stored
//   8. Assert no error catalog card surfaces

import { openDB, runMigrations, __resetForTest } from '../../db';
import { productsRepo, queueRepo } from '../../db/repos';
import { createSyncWorker } from '../../sync/queue-worker';
import type { WooClient } from '../../services/woocommerce/client';
import type { NewWCProductBody } from '../../domain/types';

const resetSqliteMock = (): void => {
  const reset = (globalThis as { __resetExpoSqliteMock?: () => void })
    .__resetExpoSqliteMock;
  if (reset) reset();
};

const silentSleep = async (): Promise<void> => undefined;

function makeFakeWooClient(): WooClient {
  return {
    baseUrl: 'https://example.com',
    async validate() {
      return { ok: true };
    },
    async getProductByLocalId() {
      return null;
    },
    async uploadMedia() {
      return { id: 9001 };
    },
    async deleteMedia() {
      return;
    },
    async createProduct(_body: NewWCProductBody) {
      return {
        id: 1234,
        name: 'Remera azul',
        status: 'draft',
        images: [],
        metaData: [],
      };
    },
    async listCategories() {
      return [];
    },
  };
}

describe('happy-path integration', () => {
  beforeEach(() => {
    resetSqliteMock();
    __resetForTest();
  });

  it('full flow: insert → enqueue → sync → synced', async () => {
    // 1-2. Open DB and run migrations
    const db = await openDB();
    await runMigrations(db);

    // 3. Insert a product with status='ready' and priceConfirmed
    const productData = {
      localId: 'integ-prod-1',
      name: 'Remera azul',
      price: 1500,
      categoryId: null as number | null,
      categoryName: null as string | null,
      description: 'Talle M',
      status: 'ready' as const,
      publishOnSync: false,
      priceConfirmed: true,
    };
    await productsRepo.insert(db, productData);
    const before = await productsRepo.get(db, productData.localId);
    expect(before).not.toBeNull();
    expect(before?.status).toBe('ready');

    // 4. Enqueue the product
    await queueRepo.enqueue(db, productData.localId);
    const queueItem = await queueRepo.getForProduct(db, productData.localId);
    expect(queueItem).not.toBeNull();
    expect(queueItem?.status).toBe('queued');

    // 5. Run the sync worker with a mocked WooClient
    const client = makeFakeWooClient();
    const events: unknown[] = [];
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => events.push(e),
      sleep: silentSleep,
    });

    const result = await worker.start();

    // 6. Assert product status transitions to 'synced'
    const after = await productsRepo.get(db, productData.localId);
    expect(after).not.toBeNull();
    expect(after?.status).toBe('synced');

    // 7. Assert wc_product_id is stored
    expect(after?.wcProductId).toBe(1234);

    // 8. Assert no error catalog card surfaces
    expect(after?.lastErrorKey).toBeNull();

    // Additional assertions: worker result
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.paused).toBe(false);

    // Queue row should be removed
    const queueAfter = await queueRepo.getForProduct(db, productData.localId);
    expect(queueAfter).toBeNull();

    // Events should include started, progress, finished — no needs-attention
    const eventKinds = events.map((e) => (e as { kind: string }).kind);
    expect(eventKinds).toContain('started');
    expect(eventKinds).toContain('progress');
    expect(eventKinds).toContain('finished');
    expect(eventKinds).not.toContain('needs-attention');
    expect(eventKinds).not.toContain('auth-blocked');
  });
});
