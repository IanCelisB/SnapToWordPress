// src/services/woocommerce/products.ts — thin wrapper over the client's
// product endpoints.
//
// The idempotency pre-check is a CLIENT-side concern: before each
// `createProduct` call, we run `getProductByLocalId`; if a match
// already exists on the server, we short-circuit to `synced` and store
// the `wc_product_id`. The body construction adds the stable UUID
// `meta_data` entry so future retries (even on a different device)
// can find the same record.

import type { NewWCProductBody, WCProduct } from '../../domain/types';
import type { WooClient } from './client';

export type ProductUploadDeps = {
  client: WooClient;
  localId: string;
  name: string;
  priceInteger: number;
  description: string;
  categoryId: number | null;
  publish: boolean;
  mediaIds: ReadonlyArray<number>;
};

export async function findExistingByLocalId(
  client: WooClient,
  localId: string,
): Promise<WCProduct | null> {
  return client.getProductByLocalId(localId);
}

export function buildCreateBody(input: {
  name: string;
  priceInteger: number;
  description: string;
  categoryId: number | null;
  publish: boolean;
  mediaIds: ReadonlyArray<number>;
  localId: string;
}): NewWCProductBody {
  return {
    name: input.name,
    status: input.publish ? 'publish' : 'draft',
    regularPrice: String(input.priceInteger),
    description: input.description,
    categories: input.categoryId !== null ? [{ id: input.categoryId }] : [],
    images: input.mediaIds.map((id) => ({ id })),
    metaData: [{ key: 'local_id', value: input.localId }],
  };
}

export async function createProduct(
  client: WooClient,
  body: NewWCProductBody,
): Promise<WCProduct> {
  return client.createProduct(body);
}
