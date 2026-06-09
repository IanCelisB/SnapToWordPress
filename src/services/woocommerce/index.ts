// src/services/woocommerce/index.ts — public barrel for the WC client
// surface (WU-4 task 4.5 + Design §5).
//
// External callers (the sync worker, the credentials service) reach
// the WC client through this barrel. The internal files
// (`client.ts`, `media.ts`, `products.ts`, `categories.ts`) stay
// one-endpoint-per-file for testability; this module is the only
// "shape" the rest of the app sees.
//
// `uploadProduct` is the orchestrator that:
//   1. runs the idempotency pre-check (so retries never duplicate),
//   2. uploads the product's media items,
//   3. creates the product.
//
// The barrel re-exports it from the worker's upload-pipeline module
// (which is where the per-step "on partial failure, mark media
// orphan" logic lives — that logic is part of the SYNC contract, not
// the WC client contract).

export { createWooClient, canonicalizeBaseUrl, buildAuthHeader } from './client';
export type { WooClient, ValidationResult } from './client';
export { uploadImage, deleteImage } from './media';
export { buildCreateBody, findExistingByLocalId, createProduct } from './products';
export { fetchCategories } from './categories';
export { uploadProductForWorker, buildProductBody } from '../../sync/upload-product';
export type { UploadProductDeps, UploadProductResult } from '../../sync/upload-product';
