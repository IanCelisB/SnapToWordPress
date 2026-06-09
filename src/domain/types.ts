// src/domain/types.ts — pure type definitions shared across the app.
//
// These types are imported by:
//   - src/db/* (CRUD module signatures)
//   - src/services/* (worker, client)
//   - src/stores/* (Zustand stores)
//
// They MUST NOT import from `src/db`, `src/services`, `src/infra`, or
// `src/error-presentation` (any direction that would couple the type
// surface to a runtime module). This keeps the type module cheap to
// import and side-effect free.

import type { ErrorKey } from '../error-presentation/types';

export type ProductStatus =
  | 'pending'
  | 'ready'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'needs-attention';

export type ProductImageSyncState = 'pending' | 'excluded' | 'missing';

export type MediaUploadStatus = 'uploaded' | 'attached' | 'orphan';

export type SyncAttemptClass = 'transient' | 'auth' | 'validation' | 'unexpected';

/** A row in the `products` table (Design §6). */
export type Product = {
  localId: string;
  name: string;
  price: number;
  categoryId: number | null;
  categoryName: string | null;
  description: string | null;
  status: ProductStatus;
  publishOnSync: boolean;
  priceConfirmed: boolean;
  wcProductId: number | null;
  lastErrorKey: ErrorKey | null;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
};

/** The shape the capture form passes into `productsRepo.insertProduct`. */
export type NewProduct = Omit<
  Product,
  'status' | 'publishOnSync' | 'priceConfirmed' | 'wcProductId' | 'lastErrorKey' | 'lastAttemptAt' | 'nextAttemptAt' | 'createdAt' | 'updatedAt'
> & {
  status?: ProductStatus;
  publishOnSync?: boolean;
  priceConfirmed?: boolean;
};

/** A row in the `product_images` table (Design §6). */
export type ProductImage = {
  id: number;
  productLocalId: string;
  filePath: string;
  position: number;
  syncState: ProductImageSyncState;
  createdAt: number;
};

export type NewProductImage = Omit<ProductImage, 'id' | 'syncState' | 'createdAt'> & {
  syncState?: ProductImageSyncState;
};

/** A row in the `media_uploads` table (Design §6). */
export type MediaUpload = {
  id: number;
  wcMediaId: number;
  productLocalId: string | null;
  status: MediaUploadStatus;
  orphanSince: number | null;
  uploadedAt: number;
  attachedAt: number | null;
};

/** A row in the `sync_attempts` table (Design §6). */
export type SyncAttempt = {
  id: number;
  productLocalId: string;
  attemptedAt: number;
  errorClass: SyncAttemptClass;
  errorKey: ErrorKey;
  httpStatus: number | null;
  attemptInRun: number;
};

export type NewSyncAttempt = Omit<SyncAttempt, 'id'>;

/** A row in the `store_categories` table (Design §6). */
export type StoreCategory = {
  wcCategoryId: number;
  name: string;
  parentId: number | null;
  cachedAt: number;
};

/** A row in the `app_config` table (Design §6). */
export type AppConfigRow = {
  key: string;
  value: string;
};

/** A row in the `sync_queue` table (WU-2 design — the worker's serial queue). */
export type QueueItem = {
  id: number;
  productLocalId: string;
  enqueuedAt: number;
  status: 'queued' | 'in-flight' | 'failed';
  attemptCount: number;
  nextAttemptAt: number;
  lastErrorKey: ErrorKey | null;
  claimedAt: number | null;
};

/** WooCommerce store credentials. */
export type WCCredentials = {
  baseUrl: string;
  key: string;
  secret: string;
};

/** WooCommerce product (subset of fields we touch). */
export type WCProduct = {
  id: number;
  name: string;
  status: 'publish' | 'draft' | 'pending' | 'private';
  images: ReadonlyArray<{ id: number; name?: string; src?: string }>;
  metaData: ReadonlyArray<{ key: string; value: unknown }>;
};

export type WCCategory = {
  id: number;
  name: string;
  parent: number;
};

export type NewWCProductBody = {
  name: string;
  status: 'publish' | 'draft';
  regularPrice: string;
  description: string;
  categories: ReadonlyArray<{ id: number }>;
  images: ReadonlyArray<{ id: number }>;
  metaData: ReadonlyArray<{ key: string; value: string }>;
};

export type ValidationErrorReason =
  | 'required'
  | 'not-integer'
  | 'must-be-positive'
  | 'too-long'
  | 'invalid-format';
