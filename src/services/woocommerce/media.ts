// src/services/woocommerce/media.ts — thin wrapper over the client's
// `uploadMedia` / `deleteMedia`. The worker (WU-4) is the only caller.

import type { WooClient } from './client';

export async function uploadImage(
  client: WooClient,
  fileUri: string,
  filename: string,
): Promise<{ id: number }> {
  return client.uploadMedia(fileUri, filename);
}

export async function deleteImage(
  client: WooClient,
  mediaId: number,
): Promise<void> {
  return client.deleteMedia(mediaId);
}
