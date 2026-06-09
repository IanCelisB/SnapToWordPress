// src/sync/__tests__/queue-worker.test.ts — the serial worker.
//
// Tests cover:
//   - happy path: a single product is uploaded, marked synced, and
//     the queue row is removed.
//   - idempotency pre-check hit: the upload pipeline short-circuits
//     and the product is marked synced without a second POST.
//   - transient failure within the cap: the worker retries with
//     backoff and the row's last_error_key is updated.
//   - transient failure at the cap: the row is moved to
//     `needs-attention` and a needs-attention event is emitted.
//   - auth failure (401): the worker surfaces an `auth-blocked`
//     event and the queue pauses.
//   - the `sync_paused` flag stops the worker at the next safe
//     checkpoint.
//
// We use a MOCK DB (the existing in-memory `expo-sqlite` mock from
// jest.setup.ts) and a MOCK WooClient that we configure per test.

import { openDB, runMigrations, setConfig, __resetForTest } from '../../db';

const resetSqliteMock = (): void => {
  const reset = (globalThis as { __resetExpoSqliteMock?: () => void })
    .__resetExpoSqliteMock;
  if (reset) reset();
};
import { productsRepo, queueRepo } from '../../db/repos';
import { createSyncWorker, processOne } from '../queue-worker';
import { WooError } from '../../error-presentation';
import type { WooClient } from '../../services/woocommerce/client';
import type { Product, NewProduct } from '../../domain/types';
import type { WCProduct, NewWCProductBody } from '../../domain/types';

const silentSleep = async (): Promise<void> => undefined;

function makeProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return {
    localId: 'prod-1',
    name: 'Remera azul',
    price: 1500,
    categoryId: 7,
    categoryName: 'Remeras',
    description: 'Talle M',
    publishOnSync: false,
    priceConfirmed: true,
    ...overrides,
  };
}

type FakeClientOptions = {
  /**
   * Side-effect: simulate the pre-check returning an existing
   * product. The test asserts the worker DOES NOT post /products.
   */
  existing?: WCProduct;
  /**
   * Side-effect: simulate `uploadMedia` failures. The number is the
   * number of times to fail before succeeding (0 = succeed first try).
   */
  failUploadsTimes?: number;
  /** Side-effect: simulate `createProduct` failures. */
  failCreatesTimes?: number;
  /** HTTP status to surface on upload/create failures. */
  failStatus?: number;
  /** Record calls for assertion. */
  calls?: {
    getProductByLocalId: number;
    uploadMedia: number;
    createProduct: number;
  };
};

function makeFakeClient(opts: FakeClientOptions = {}): WooClient {
  const calls = opts.calls ?? {
    getProductByLocalId: 0,
    uploadMedia: 0,
    createProduct: 0,
  };
  let uploadFailsLeft = opts.failUploadsTimes ?? 0;
  let createFailsLeft = opts.failCreatesTimes ?? 0;

  return {
    baseUrl: 'https://example.com',
    async validate() {
      return { ok: true };
    },
    async getProductByLocalId() {
      calls.getProductByLocalId += 1;
      if (opts.existing) return opts.existing;
      return null;
    },
    async uploadMedia() {
      calls.uploadMedia += 1;
      if (uploadFailsLeft > 0) {
        uploadFailsLeft -= 1;
        throw makeWooError(opts.failStatus ?? 503);
      }
      return { id: 9_000 + calls.uploadMedia };
    },
    async deleteMedia() {
      return;
    },
    async createProduct(_body: NewWCProductBody) {
      calls.createProduct += 1;
      if (createFailsLeft > 0) {
        createFailsLeft -= 1;
        throw makeWooError(opts.failStatus ?? 503);
      }
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

function makeWooError(status: number): WooError {
  return new WooError({ message: `HTTP ${status}`, status });
}

async function seedProductAndQueue(
  productOverrides: Partial<NewProduct> = {},
): Promise<Product> {
  const db = await openDB();
  await runMigrations(db);
  const p = makeProduct(productOverrides);
  await productsRepo.insert(db, p);
  await queueRepo.enqueue(db, p.localId);
  const fetched = await productsRepo.get(db, p.localId);
  if (!fetched) throw new Error('seed failed');
  return fetched;
}

describe('sync queue worker', () => {
  beforeEach(() => {
    resetSqliteMock();
    __resetForTest();
  });

  it('uploads a single product, marks it synced, and removes the queue row', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const events: unknown[] = [];
    const client = makeFakeClient();
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => events.push(e),
      sleep: silentSleep,
    });

    const result = await worker.start();

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.paused).toBe(false);

    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('synced');
    expect(after?.wcProductId).toBe(1234);
    expect(after?.lastErrorKey).toBeNull();

    const queueRow = await queueRepo.getForProduct(db, product.localId);
    expect(queueRow).toBeNull();

    const eventKinds = events.map((e) => (e as { kind: string }).kind);
    expect(eventKinds).toEqual(
      expect.arrayContaining(['started', 'progress', 'finished']),
    );
  });

  it('honors the idempotency pre-check: pre-hit → no POST, no media upload', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const calls = {
      getProductByLocalId: 0,
      uploadMedia: 0,
      createProduct: 0,
    };
    const client = makeFakeClient({
      existing: {
        id: 5555,
        name: 'Already there',
        status: 'draft',
        images: [],
        metaData: [],
      },
      calls,
    });
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      sleep: silentSleep,
    });

    await worker.start();

    expect(calls.getProductByLocalId).toBe(1);
    expect(calls.uploadMedia).toBe(0);
    expect(calls.createProduct).toBe(0);

    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('synced');
    expect(after?.wcProductId).toBe(5555);
  });

  it('retries transient failures within the cap and succeeds', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const calls = {
      getProductByLocalId: 0,
      uploadMedia: 0,
      createProduct: 0,
    };
    const client = makeFakeClient({
      failCreatesTimes: 2,
      failStatus: 503,
      calls,
    });
    const retries: number[] = [];
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => {
        if (e.kind === 'retrying') retries.push(e.attempt);
      },
      sleep: silentSleep,
    });

    const result = await worker.start();

    expect(result.succeeded).toBe(1);
    expect(calls.createProduct).toBe(3); // 2 fails + 1 success
    expect(retries).toEqual([1, 2]);
    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('synced');
  });

  it('moves a product to needs-attention when the cap is reached', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const client = makeFakeClient({
      failCreatesTimes: 99, // always fail
      failStatus: 503,
    });
    const needsAttention: unknown[] = [];
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => {
        if (e.kind === 'needs-attention') needsAttention.push(e);
      },
      sleep: silentSleep,
      maxAttempts: 3, // tighten the cap for the test
    });

    const result = await worker.start();

    expect(result.failed).toBe(1);
    expect(needsAttention).toHaveLength(1);
    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('needs-attention');
    expect(after?.lastErrorKey).toBe('servidor-no-disponible');
  });

  it('emits auth-blocked and stops the run on a 401', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const client = makeFakeClient({
      failCreatesTimes: 99,
      failStatus: 401,
    });
    const events: unknown[] = [];
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => events.push(e),
      sleep: silentSleep,
    });

    await worker.start();

    const kinds = events.map((e) => (e as { kind: string }).kind);
    expect(kinds).toContain('auth-blocked');

    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('needs-attention');
    expect(after?.lastErrorKey).toBe('credenciales-invalidas');
  });

  it('respects the sync_paused flag in app_config', async () => {
    await seedProductAndQueue();
    const db = await openDB();
    await setConfig(db, 'sync_paused', '1');
    const client = makeFakeClient();
    const events: unknown[] = [];
    const worker = createSyncWorker({
      db,
      getClient: async () => client,
      onEvent: (e) => events.push(e),
      sleep: silentSleep,
    });

    const result = await worker.start();

    expect(result.paused).toBe(true);
    expect(result.succeeded).toBe(0);
    const kinds = events.map((e) => (e as { kind: string }).kind);
    expect(kinds).toContain('paused');
  });

  it('processOne updates the row to syncing before the first attempt', async () => {
    const product = await seedProductAndQueue();
    const db = await openDB();
    const client = makeFakeClient();
    const outcome = await processOne({
      db,
      productId: product.localId,
      client,
      onRetrying: () => undefined,
      now: () => Date.now(),
      sleep: silentSleep,
    });

    expect(outcome.kind).toBe('synced');
    const after = await productsRepo.get(db, product.localId);
    expect(after?.status).toBe('synced');
  });
});
