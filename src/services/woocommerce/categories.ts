// src/services/woocommerce/categories.ts — thin wrapper over the client's
// `listCategories`. The capture screen (WU-3) calls this on first mount
// per Design §2 (eager fetch on first mount, stale-while-revalidate
// after).

import type { WCCategory } from '../../domain/types';
import type { WooClient } from './client';

export async function fetchCategories(
  client: WooClient,
): Promise<ReadonlyArray<WCCategory>> {
  return client.listCategories();
}
