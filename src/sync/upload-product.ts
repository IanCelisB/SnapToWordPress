// src/sync/upload-product.ts — two-step WooCommerce upload pipeline
// (WU-4 task 4.5 + Design §5 + woocommerce-sync spec R1, R2).
//
// The pipeline:
//   1. IDEMPOTENCY PRE-CHECK: `GET /wc/v3/products?per_page=1&meta_key=local_id&meta_value=<uuid>`.
//      If a match comes back, store the `wc_product_id` and short-circuit to
//      `synced` (the server already has this product — we are recovering from
//      a network blip or a previous run that lost its response).
//   2. MEDIA × N: `POST /wp/v2/media` for each image in the product. Each
//      successful upload is recorded in `media_ledger` (WU-4.6) AND
//      `media_uploads` so the orphan sweeper (WU-4.7) can find it later.
//   3. PRODUCT CREATE: `POST /wc/v3/products` with `images: [{id, ...}]`
//      and `meta_data: [{key: "local_id", value: <uuid>}]`. On 2xx, the
//      media items are marked `attached`; on 5xx, they are marked `orphan`
//      so the sweeper deletes them later.
//
// The pipeline is FAIL-FAST on the first error. Any thrown `WooError`
// bubbles to the worker (queue-worker.ts), which classifies it and
// decides whether to retry.
//
// Why this lives in its own module: the worker test focuses on the
// queue + backoff + cap; the upload-pipeline test focuses on the
// pre-check + two-step flow + orphan-marking on partial failure. Two
// scopes, two files, two test suites.

import { WooError } from '../error-presentation';
import type { DB } from '../db';
import { productsRepo } from '../db/repos';
import {
  listImagesForProduct,
} from '../db/product-images';
import { recordUpload, attachToProduct, markOrphan } from '../db/media-ledger';
import type { WooClient } from '../services/woocommerce/client';
import type { Product, NewWCProductBody } from '../domain/types';

export type UploadProductDeps = {
  db: DB;
  client: WooClient;
  product: Product;
  /** The current time, for `media_uploads.uploaded_at` etc. */
  now: number;
};

export type UploadProductResult = {
  wcProductId: number;
  /** Set when the result came from the idempotency pre-check, not a fresh POST. */
  recoveredFromIdempotency: boolean;
};

export async function uploadProductForWorker(
  deps: UploadProductDeps,
): Promise<UploadProductResult> {
  const { db, client, product, now } = deps;

  // 1. Idempotency pre-check.
  const existing = await client.getProductByLocalId(product.localId);
  if (existing && typeof existing.id === 'number') {
    return {
      wcProductId: existing.id,
      recoveredFromIdempotency: true,
    };
  }

  // 2. Media × N. Any failure here marks all already-uploaded media
  // as orphan and re-throws so the worker can decide on retry vs.
  // cap.
  const images = await listImagesForProduct(db, product.localId);
  const mediaIds: number[] = [];
  const uploadedAt: number[] = [];
  try {
    for (const image of images) {
      if (image.syncState === 'excluded') continue;
      const result = await client.uploadMedia(
        image.filePath,
        filenameForImage(image.filePath),
      );
      mediaIds.push(result.id);
      uploadedAt.push(now);
      // Record in the ledger (WU-4.6) — survives app restart.
      await recordUpload(db, result.id, now);
    }
  } catch (err) {
    // Partial-success: every media we DID upload becomes an orphan
    // so the sweeper (WU-4.7) cleans it up.
    for (let i = 0; i < mediaIds.length; i += 1) {
      const id = mediaIds[i];
      const ts = uploadedAt[i];
      if (id !== undefined && ts !== undefined) {
        await markOrphan(db, id, ts).catch(() => undefined);
      }
    }
    throw err;
  }

  // 3. Product create. The body is built by the products service
  // (which also owns the `local_id` meta convention).
  const body = buildProductBody(product, mediaIds);
  let created;
  try {
    created = await client.createProduct(body);
  } catch (err) {
    // All media is now orphan.
    for (let i = 0; i < mediaIds.length; i += 1) {
      const id = mediaIds[i];
      const ts = uploadedAt[i];
      if (id !== undefined && ts !== undefined) {
        await markOrphan(db, id, ts).catch(() => undefined);
      }
    }
    throw err;
  }

  if (typeof created.id !== 'number') {
    // The server replied 2xx without a numeric id. That should not
    // happen, but if it does we treat the whole batch as orphan and
    // surface a typed error so the worker can decide.
    for (let i = 0; i < mediaIds.length; i += 1) {
      const id = mediaIds[i];
      const ts = uploadedAt[i];
      if (id !== undefined && ts !== undefined) {
        await markOrphan(db, id, ts).catch(() => undefined);
      }
    }
    throw new WooError({
      message: 'POST /products returned 2xx without a numeric id',
      body: created,
    });
  }

  // 4. Mark every uploaded media as attached. The ledger knows the
  // product now.
  for (const id of mediaIds) {
    await attachToProduct(db, id, product.localId, now).catch(
      () => undefined,
    );
  }

  return { wcProductId: created.id, recoveredFromIdempotency: false };
}

/**
 * Build the POST /wc/v3/products body. Returns the typed
 * `NewWCProductBody` (camelCase) — the client's `createProduct`
 * converts it to the wire format (`regular_price`, `meta_data`).
 */
export function buildProductBody(
  product: Product,
  mediaIds: ReadonlyArray<number>,
): NewWCProductBody {
  return {
    name: product.name,
    status: product.publishOnSync ? 'publish' : 'draft',
    regularPrice: String(product.price),
    description: product.description ?? '',
    categories:
      product.categoryId !== null ? [{ id: product.categoryId }] : [],
    images: mediaIds.map((id) => ({ id })),
    metaData: [{ key: 'local_id', value: product.localId }],
  };
}

function filenameForImage(filePath: string): string {
  // `/.../products/<localId>/0.jpg` → `0.jpg`
  const segments = filePath.split('/');
  return segments[segments.length - 1] ?? 'image.jpg';
}

// Re-export of the media-ledger CRUD so callers (the orphan sweeper,
// the worker tests) can reach it without a separate import.
export { recordUpload, attachToProduct, markOrphan } from '../db/media-ledger';
export {
  listOrphansOlderThan,
  deleteRow as deleteLedgerRow,
} from '../db/media-ledger';
export type { MediaLedgerRow, MediaLedgerStatus } from '../db/media-ledger';

// `productsRepo` is referenced for the post-create status update by
// the worker; we re-export it so the upload module's surface stays
// self-contained.
export { productsRepo };
