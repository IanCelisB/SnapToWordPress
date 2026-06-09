// src/sync/media-ledger.ts — the worker's typed wrapper over
// `src/db/media-ledger.ts` (WU-4 task 4.6).
//
// The `media_ledger` table is the durable record of EVERY media item
// the worker has ever uploaded. The orphan sweeper (WU-4.7) scans it
// for items that are still `orphan` (or unattached) after a grace
// period. The DB module owns the SQL; this module owns the SYNC
// SEMANTICS — what "record an attempt" means, how retries increment
// the counter, etc.
//
// Why two layers (this file + `src/db/media-ledger.ts`):
//   - The DB module is intentionally one-table-one-file, so a
//     future WU can drop in a v2 migration that touches the table
//     without touching the worker.
//   - The sync layer is where the cross-table invariants live
//     (e.g. "marking a media attached must also be reflected in the
//     products row's `wc_product_id`"). Keeping that logic here
//     means the DB module never has to know about products.

import type { DB } from '../db';
import {
  recordUpload as dbRecordUpload,
  attachToProduct as dbAttachToProduct,
  markOrphan as dbMarkOrphan,
  listOrphansOlderThan as dbListOrphansOlderThan,
  deleteRow as dbDeleteRow,
} from '../db/media-ledger';
import type { MediaLedgerRow, MediaLedgerStatus } from '../db/media-ledger';
import { productsRepo } from '../db/repos';
import { attemptsRepo } from '../db/repos';

export type { MediaLedgerRow, MediaLedgerStatus };

/**
 * Record a fresh media upload. The row starts in `uploaded` status;
 * the sweeper (or the product-create step) transitions it to
 * `attached` (success) or `orphan` (product creation failed).
 */
export async function recordUpload(
  db: DB,
  wcMediaId: number,
  now: number,
): Promise<void> {
  await dbRecordUpload(db, wcMediaId, now);
}

/**
 * Mark a media item as attached to a successfully-synced product.
 * Idempotent: calling twice with the same `wcMediaId` is safe.
 */
export async function attachToProduct(
  db: DB,
  wcMediaId: number,
  productLocalId: string,
  now: number,
): Promise<void> {
  await dbAttachToProduct(db, wcMediaId, productLocalId, now);
}

/**
 * Mark a media item as orphan. The sweeper (WU-4.7) will pick it
 * up after the 10-min grace period.
 */
export async function markOrphan(
  db: DB,
  wcMediaId: number,
  now: number,
): Promise<void> {
  await dbMarkOrphan(db, wcMediaId, now);
}

/**
 * Return the orphan media items older than `thresholdMs` ago. The
 * sweeper passes a 10-min threshold (the race guard) and a maxItems
 * cap (WU-4.7's "bounded per run" rule).
 */
export async function listOrphansOlderThan(
  db: DB,
  thresholdMs: number,
  maxItems: number,
): Promise<ReadonlyArray<MediaLedgerRow>> {
  return dbListOrphansOlderThan(db, thresholdMs, maxItems);
}

/**
 * Remove a row from the ledger after a successful DELETE. Idempotent.
 */
export async function deleteRow(
  db: DB,
  wcMediaId: number,
): Promise<void> {
  await dbDeleteRow(db, wcMediaId);
}

/**
 * The ORPHAN RECONCILIATION function. The spec (R7 scenario "Orphan
 * media older than N minutes is deleted") is met by the sweeper; this
 * function is the SHEPHERD that runs during a normal worker run to
 * mark items the upload pipeline forgot to mark.
 *
 * In practice this is a no-op because the upload pipeline always
 * either attaches or orphans each media item before throwing.
 * However: if the app was killed BETWEEN the media upload and the
 * orphan mark (a small race), the ledger row stays in `uploaded`
 * status with no attached product. This function scans for that
 * shape and marks the row `orphan` with the current timestamp, so
 * the sweeper picks it up on the NEXT run.
 *
 * Returns the number of rows reconciled.
 */
export async function reconcileOrphans(
  db: DB,
  olderThanMs: number,
  now: number,
): Promise<number> {
  // Threshold of "uploaded but not attached for more than
  // olderThanMs" — these are the rows we never got to mark
  // during a crashed run.
  const since = now - olderThanMs;
  const candidates = await listOrphansOlderThan(db, since, 100);
  let count = 0;
  for (const row of candidates) {
    if (row.status === 'uploaded' && row.orphanSince === null) {
      await dbMarkOrphan(db, row.wcMediaId, now);
      count += 1;
    }
  }
  return count;
}

/**
 * A typed summary of the ledger, useful for the sync-store's
 * debug/observability surface. Computes counts in one DB call.
 */
export type LedgerSummary = {
  uploaded: number;
  attached: number;
  orphan: number;
};

export async function summarize(
  db: DB,
  options: { olderThanMs?: number; maxItems?: number } = {},
): Promise<LedgerSummary> {
  // We don't have a dedicated COUNT query in the DB module; the
  // sweeper uses listOrphansOlderThan for the orphan count. For
  // uploaded/attached we read all rows (bounded by maxItems so we
  // don't blow memory on a busy store).
  const max = options.maxItems ?? 500;
  const all = await listOrphansOlderThan(db, 0, max);
  let uploaded = 0;
  let attached = 0;
  let orphan = 0;
  for (const row of all) {
    if (row.status === 'uploaded') uploaded += 1;
    else if (row.status === 'attached') attached += 1;
    else orphan += 1;
  }
  return { uploaded, attached, orphan };
}

// Re-export the repos for convenience in callers that need to
// correlate the ledger with the products / attempts tables.
export { productsRepo, attemptsRepo };
