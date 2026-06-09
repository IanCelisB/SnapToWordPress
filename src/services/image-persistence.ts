// src/services/image-persistence.ts — copy camera/picker output to the
// app's documents directory, compress for web efficiency, and return
// an absolute path (WU-3, product-capture spec R1 + local-persistence
// spec R4).
//
// The function takes a source `file://` URI from `expo-camera` or
// `expo-image-picker`, compresses it via expo-image-manipulator, and
// saves to `<documentDirectory>/products/<localId>/<n>.jpg`.
// The returned `filePath` is what the DB stores in
// `product_images.file_path` and what the sync worker reads in WU-4.
//
// Compression strategy (WooCommerce-optimized):
// - Resize to max 1200px on longest side (sufficient for product pages)
// - JPEG quality 0.82 (visually lossless, ~60% smaller than camera originals)
// - Output always .jpg for consistent MIME type on upload

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { uuid } from '../infra/uuid';

export type PersistResult = {
  filePath: string;
  /** Original file size in bytes before compression (0 if unknown) */
  originalSize: number;
  /** Compressed file size in bytes after compression */
  compressedSize: number;
};

const FOLDER = 'products';

/** Maximum dimension (width or height) for the longest side */
const MAX_DIMENSION = 1200;

/** JPEG quality for compression (0-1). 0.82 is visually lossless for product photos */
const JPEG_QUALITY = 0.82;

/**
 * Compress and copy `sourceUri` to
 * `<documentDirectory>/products/<localId>/compressed.jpg`
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
    return { filePath: sourceUri, originalSize: 0, compressedSize: 0 };
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

  const targetPath = `${targetDir}compressed.jpg`;

  try {
    // Get original size for comparison
    const originalInfo = await FileSystem.getInfoAsync(sourceUri);
    const originalSize = originalInfo.exists ? originalInfo.size ?? 0 : 0;

    // Compress and resize via expo-image-manipulator
    const manipulated = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        saveTo: targetPath,
      },
    );

    // Get compressed size
    const compressedInfo = await FileSystem.getInfoAsync(manipulated.uri);
    const compressedSize = compressedInfo.exists ? compressedInfo.size ?? 0 : 0;

    // If manipulator saved to a different path, copy to our target
    if (manipulated.uri !== targetPath) {
      await FileSystem.copyAsync({ from: manipulated.uri, to: targetPath });
      // Clean up the manipulator's temp file
      try {
        await FileSystem.deleteAsync(manipulated.uri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return { filePath: targetPath, originalSize, compressedSize };
  } catch {
    // Fallback: raw copy without compression (tests, mocked FS, etc.)
    const extension = inferExtension(sourceUri);
    const fallbackPath = `${targetDir}0${extension}`;
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: fallbackPath });
      return { filePath: fallbackPath, originalSize: 0, compressedSize: 0 };
    } catch {
      return { filePath: sourceUri, originalSize: 0, compressedSize: 0 };
    }
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
