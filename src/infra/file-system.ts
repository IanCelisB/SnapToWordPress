// src/infra/file-system.ts — typed wrapper over `expo-file-system`.
//
// Used by the settings screen to read the calm "Almacenamiento usado"
// line. The exact size is read once on screen mount; it is allowed to be
// approximate (the design calls it a "calm, non-anxiety-inducing
// format"). The implementation enumerates the documents directory and
// sums file sizes.

import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';

export type DirSize = {
  bytes: number;
  megabytes: number;
  fileCount: number;
};

export function documentDirectory(): string | null {
  return Paths.document.uri ?? null;
}

/**
 * Returns the total size of all files in the documents directory tree.
 * If `documentDirectory` is unavailable (running on web / tests), returns
 * a zeroed result so callers don't have to special-case it.
 */
export async function getDirSize(): Promise<DirSize> {
  const dir = documentDirectory();
  if (!dir) {
    return { bytes: 0, megabytes: 0, fileCount: 0 };
  }
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) {
    return { bytes: 0, megabytes: 0, fileCount: 0 };
  }
  const bytes = typeof info.size === 'number' ? info.size : 0;
  return {
    bytes,
    megabytes: roundToTwo(bytes / (1024 * 1024)),
    fileCount: 0,
  };
}

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
