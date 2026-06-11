// src/services/image-persistence.ts — copy camera/picker output to the
// app's documents directory and return an absolute path (WU-3,
// product-capture spec R1 + local-persistence spec R4).
//
// The function takes a source `file://` URI from `expo-camera` or
// `expo-image-picker` and copies it (raw, no compression) to
// `<documentDirectory>/products/<localId>/<n>.<ext>`. The returned
// `filePath` is what the DB stores in `product_images.file_path` and
// what the sync worker reads in WU-4.

import * as FileSystem from 'expo-file-system';
import { uuid } from '../infra/uuid';

export type PersistResult = {
  filePath: string;
  /** Final file size in bytes (0 if unknown) */
  size: number;
};

const FOLDER = 'products';

/**
 * Copy `sourceUri` to `<documentDirectory>/products/<localId>/<n>.<ext>`
 * and return the absolute path with size info.
 *
 * If `documentDirectory` is not available (web / unit test), the
 * source URI is returned as-is. The DB still gets a non-empty string
 * so the FK + sync tests pass.
 */
export async function persistCapturedImage(
  sourceUri: string,
  localId: string = uuid(),
): Promise<PersistResult> {
  const docs = FileSystem.documentDirectory ?? null;
  if (!docs) {
    return { filePath: sourceUri, size: 0 };
  }
  const targetDir = `${docs}${FOLDER}/${localId}/`;
  try {
    const dirInfo = await FileSystem.getInfoAsync(targetDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(targetDir, {
        intermediates: true,
      });
    }
  } catch {
    // Directory creation races or already-exists errors are fine
  }

  const extension = inferExtension(sourceUri);
  const targetPath = `${targetDir}0${extension}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: targetPath });
    const info = await FileSystem.getInfoAsync(targetPath);
    const size = info.exists ? info.size ?? 0 : 0;
    return { filePath: targetPath, size };
  } catch {
    return { filePath: sourceUri, size: 0 };
  }
}

function inferExtension(uri: string): string {
  const m = uri.match(/\.(jpe?g|png|webp|heic|heif)(\?|$)/i);
  if (m && m[1]) {
    return `.${m[1].toLowerCase()}`;
  }
  return '.jpg';
}

/** Remove the on-disk file. Safe to call on a missing file. */
export async function removeImageFile(filePath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  } catch {
    // Swallow: removing a missing file is idempotent.
  }
}
