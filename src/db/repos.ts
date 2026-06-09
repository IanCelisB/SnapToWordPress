// src/db/repos.ts — domain-facing repository facades over the raw
// `src/db/*` table modules.
//
// The db/* files are the lowest-level SQL. The repos in this file add:
//   - default values for `created_at` / `updated_at` (the `now` clock
//     is sourced from `src/infra/clock`),
//   - default values for `status` and `publish_on_sync` for new rows,
//   - the row → domain-type mapping,
//   - the "domain" queries the worker / review queue / settings actually
//     call (e.g. `productsRepo.listByStatus` returns `Product[]`).
//
// Repos do NOT throw their own errors. They bubble raw SQL errors; the
// `error-presentation` classifier decides what the user sees.

import { now as defaultNow } from '../infra/clock';
import type {
  MediaUpload,
  NewProduct,
  NewProductImage,
  Product,
  ProductStatus,
  QueueItem,
  StoreCategory,
  SyncAttempt,
} from '../domain/types';
import * as ProductsTable from './products';
import * as ImagesTable from './product-images';
import * as MediaUploadsTable from './media-uploads';
import * as CategoriesTable from './store-categories';
import * as AttemptsTable from './sync-attempts';
import * as QueueTable from './queue';
import type { DB } from './index';
import type { ProductImage, ProductImageSyncState } from '../domain/types';

export const productsRepo = {
  insert: (db: DB, product: NewProduct): Promise<void> =>
    ProductsTable.insertProduct(db, product, defaultNow()),

  update: (
    db: DB,
    id: string,
    patch: Partial<Omit<Product, 'localId' | 'createdAt'>>,
  ): Promise<void> => ProductsTable.updateProduct(db, id, patch, defaultNow()),

  get: (db: DB, id: string): Promise<Product | null> =>
    ProductsTable.getProduct(db, id),

  listAll: (db: DB): Promise<Product[]> => ProductsTable.listAllProducts(db),

  listByStatus: (db: DB, status: ProductStatus): Promise<Product[]> =>
    ProductsTable.listProductsByStatus(db, status),

  listForSync: (db: DB): Promise<Product[]> =>
    ProductsTable.listProductsForSync(db),

  delete: (db: DB, id: string): Promise<void> =>
    ProductsTable.deleteProduct(db, id),
};

export const imagesRepo = {
  insert: (db: DB, image: NewProductImage): Promise<number> =>
    ImagesTable.insertImage(db, image, defaultNow()),
  listForProduct: (db: DB, productLocalId: string): Promise<ReadonlyArray<ProductImage>> =>
    ImagesTable.listImagesForProduct(db, productLocalId),
  setSyncState: (
    db: DB,
    id: number,
    syncState: ProductImageSyncState,
  ): Promise<void> => ImagesTable.setImageSyncState(db, id, syncState),
  delete: (db: DB, id: number): Promise<void> =>
    ImagesTable.deleteImage(db, id),
};

export const mediaRepo = {
  recordUpload: (db: DB, wcMediaId: number): Promise<void> =>
    MediaUploadsTable.recordUpload(db, wcMediaId, defaultNow()),
  markAttached: (
    db: DB,
    wcMediaId: number,
    productLocalId: string,
  ): Promise<void> =>
    MediaUploadsTable.markAttached(
      db,
      wcMediaId,
      productLocalId,
      defaultNow(),
    ),
  markOrphan: (db: DB, wcMediaId: number): Promise<void> =>
    MediaUploadsTable.markOrphan(db, wcMediaId, defaultNow()),
  delete: (db: DB, wcMediaId: number): Promise<void> =>
    MediaUploadsTable.deleteUpload(db, wcMediaId),
  listOrphansOlderThan: (
    db: DB,
    thresholdMs: number,
    limit: number,
  ): Promise<MediaUpload[]> =>
    MediaUploadsTable.listOrphansOlderThan(db, thresholdMs, limit),
};

export const categoriesRepo = {
  upsert: (db: DB, category: StoreCategory): Promise<void> =>
    CategoriesTable.upsertCategory(db, category),
  list: (db: DB): Promise<StoreCategory[]> =>
    CategoriesTable.listCategories(db),
  get: (db: DB, id: number): Promise<StoreCategory | null> =>
    CategoriesTable.getCategory(db, id),
  delete: (db: DB, id: number): Promise<void> =>
    CategoriesTable.deleteCategory(db, id),
  mostRecentCachedAt: (db: DB): Promise<number | null> =>
    CategoriesTable.mostRecentCachedAt(db),
};

export const attemptsRepo = {
  record: (db: DB, attempt: Omit<SyncAttempt, 'id'>): Promise<void> =>
    AttemptsTable.recordAttempt(db, attempt),
  listForProduct: (db: DB, productLocalId: string): Promise<SyncAttempt[]> =>
    AttemptsTable.listAttemptsForProduct(db, productLocalId),
};

export const queueRepo = {
  enqueue: (db: DB, productLocalId: string): Promise<QueueItem> =>
    QueueTable.enqueue(db, productLocalId, defaultNow()),
  claimNext: (db: DB): Promise<QueueItem | null> =>
    QueueTable.claimNext(db, defaultNow()),
  complete: (db: DB, productLocalId: string): Promise<void> =>
    QueueTable.completeItem(db, productLocalId),
  fail: (
    db: DB,
    productLocalId: string,
    nextAttemptAt: number,
    errorKey: string,
  ): Promise<void> =>
    QueueTable.failItem(db, productLocalId, nextAttemptAt, errorKey as QueueItem['lastErrorKey']),
  markFailed: (
    db: DB,
    productLocalId: string,
    errorKey: string,
  ): Promise<void> =>
    QueueTable.markFailed(db, productLocalId, errorKey as QueueItem['lastErrorKey']),
  list: (db: DB): Promise<ReadonlyArray<QueueItem>> =>
    QueueTable.listQueued(db),
  getForProduct: (db: DB, productLocalId: string): Promise<QueueItem | null> =>
    QueueTable.getByProduct(db, productLocalId),
};
