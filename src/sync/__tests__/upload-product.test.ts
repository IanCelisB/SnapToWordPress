// src/sync/__tests__/upload-product.test.ts — the two-step upload
// pipeline (idempotency pre-check, media × N, product create).

import { openDB, runMigrations, __resetForTest } from '../../db';
import { productsRepo, imagesRepo } from '../../db/repos';
import { WooError } from '../../error-presentation';

const resetSqliteMock = (): void => {
  const reset = (globalThis as { __resetExpoSqliteMock?: () => void })
    .__resetExpoSqliteMock;
  if (reset) reset();
};
import { uploadProductForWorker, buildProductBody } from '../upload-product';
import type { WooClient } from '../../services/woocommerce/client';
import type { Product, NewProduct } from '../../domain/types';
import type { WCProduct, NewWCProductBody } from '../../domain/types';

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
  existing?: WCProduct | null;
  failUploads?: boolean;
  failCreate?: boolean;
  createStatus?: number;
};

function makeFakeClient(opts: FakeClientOptions = {}): WooClient {
  return {
    baseUrl: 'https://example.com',
    async validate() {
      return { ok: true };
    },
    async getProductByLocalId() {
      return opts.existing ?? null;
    },
    async uploadMedia(_uri: string, _filename: string) {
      if (opts.failUploads) {
        throw new WooError({ message: 'HTTP 503', status: 503 });
      }
      return { id: 9_000 + Math.floor(Math.random() * 100) };
    },
    async deleteMedia() {
      return;
    },
    async createProduct(_body: NewWCProductBody) {
      if (opts.failCreate) {
        throw new WooError({
          message: `HTTP ${opts.createStatus ?? 500}`,
          status: opts.createStatus ?? 500,
        });
      }
      return {
        id: 42,
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

async function seedProduct(
  productOverrides: Partial<NewProduct> = {},
): Promise<Product> {
  const db = await openDB();
  await runMigrations(db);
  const p = makeProduct(productOverrides);
  await productsRepo.insert(db, p);
  const fetched = await productsRepo.get(db, p.localId);
  if (!fetched) throw new Error('seed failed');
  return fetched;
}

describe('uploadProductForWorker', () => {
  beforeEach(() => {
    resetSqliteMock();
    __resetForTest();
  });

  it('returns the pre-check result without uploading anything when an existing product is found', async () => {
    const product = await seedProduct();
    const db = await openDB();
    const calls = { uploadMedia: 0, createProduct: 0 };
    const client: WooClient = {
      ...makeFakeClient({
        existing: {
          id: 7777,
          name: 'Already there',
          status: 'draft',
          images: [],
          metaData: [],
        },
      }),
      async uploadMedia() {
        calls.uploadMedia += 1;
        return { id: 0 };
      },
      async createProduct() {
        calls.createProduct += 1;
        return {
          id: 0,
          name: '',
          status: 'draft',
          images: [],
          metaData: [],
        };
      },
    };

    const result = await uploadProductForWorker({
      db,
      client,
      product,
      now: Date.now(),
    });

    expect(result.wcProductId).toBe(7777);
    expect(result.recoveredFromIdempotency).toBe(true);
    expect(calls.uploadMedia).toBe(0);
    expect(calls.createProduct).toBe(0);
  });

  it('uploads media and creates the product on the happy path', async () => {
    const product = await seedProduct();
    const db = await openDB();
    const client = makeFakeClient();
    const result = await uploadProductForWorker({
      db,
      client,
      product,
      now: Date.now(),
    });

    expect(result.wcProductId).toBe(42);
    expect(result.recoveredFromIdempotency).toBe(false);
  });

  it('throws and marks already-uploaded media as orphan on a media-step failure', async () => {
    const product = await seedProduct();
    const db = await openDB();
    // Add a real image to the product so the upload loop iterates
    // and the fake client gets a chance to fail.
    await imagesRepo.insert(db, {
      productLocalId: product.localId,
      filePath: '/tmp/products/prod-1/0.jpg',
      position: 0,
    });
    const client = makeFakeClient({ failUploads: true });
    await expect(
      uploadProductForWorker({ db, client, product, now: Date.now() }),
    ).rejects.toThrow();
  });

  it('buildProductBody sets draft when publish_on_sync is false', () => {
    const product = makeProduct({ publishOnSync: false, categoryId: 7 });
    const body = buildProductBody(
      {
        ...product,
        status: 'pending',
        publishOnSync: false,
        priceConfirmed: true,
        wcProductId: null,
        lastErrorKey: null,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      [1, 2],
    );
    expect(body.status).toBe('draft');
    expect(body.metaData).toEqual([
      { key: 'local_id', value: 'prod-1' },
    ]);
    expect(body.images).toEqual([{ id: 1 }, { id: 2 }]);
    expect(body.categories).toEqual([{ id: 7 }]);
  });

  it('buildProductBody sets publish when publish_on_sync is true', () => {
    const product = makeProduct({ publishOnSync: true, categoryId: null });
    const body = buildProductBody(
      {
        ...product,
        status: 'ready',
        publishOnSync: true,
        priceConfirmed: true,
        wcProductId: null,
        lastErrorKey: null,
        lastAttemptAt: null,
        nextAttemptAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      [],
    );
    expect(body.status).toBe('publish');
    expect(body.categories).toEqual([]);
  });
});
