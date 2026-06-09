// src/sync/orphan-sweeper.ts — the orphan-media sweeper (WU-4 task 4.7
// + woocommerce-sync spec R7 + Design §5).
//
// The sweeper reconciles the two failure modes the upload pipeline
// (WU-4.5) can leave behind:
//
//   - A media item was uploaded to WP (`POST /wp/v2/media`) and the
//     server returned 2xx, but the product creation step failed.
//     The media is now an ORPHAN on the WC store, and we should
//     DELETE it so the user's "Drafts" page doesn't fill up with
//     dangling images.
//
//   - The app was killed BETWEEN the media upload and the
//     `media_ledger` insert. The ledger row never got the `orphan`
//     mark, and the sweeper's `reconcileOrphans` (in media-ledger.ts)
//     fixes the row's status on the next run.
//
// The sweeper is bounded:
//   - `olderThanMs` (default 10 minutes) is the RACE GUARD. The
//     sweeper MUST NOT touch media that was uploaded in the last 10
//     minutes — the corresponding product create might still be
//     in-flight. (Woocommerce-sync R7 scenario "Sweeper does not race
//     with in-flight uploads".)
//   - `maxItems` (default 20) is the per-run cap. A runaway sweeper
//     cannot destroy live media.
//   - `deleteThrottleMs` (default 200ms = 5 deletes/sec) paces the
//     DELETE calls so the WC rate-limiter doesn't trip.
//
// The sweeper returns a typed `SweepResult` so the worker / sync-store
// can surface a calm progress line ("Limpiando 3 imágenes sin
// usar…") without ever inlining a 4xx/5xx.

import { WooError } from '../error-presentation';
import type { DB } from '../db';
import type { WooClient } from '../services/woocommerce/client';
import {
  listOrphansOlderThan,
  deleteRow,
} from './media-ledger';
import { productsRepo } from '../db/repos';

const DEFAULT_OLDER_THAN_MS = 10 * 60 * 1_000; // 10 minutes
const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_DELETE_THROTTLE_MS = 200; // 5 deletes/sec

export type SweepResult = {
  deleted: number;
  failed: number;
  skipped: number;
};

export type SweepOptions = {
  olderThanMs?: number;
  maxItems?: number;
  deleteThrottleMs?: number;
  /** Test seam: clock injection. */
  now?: () => number;
  /** Test seam: sleep injection. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Run the orphan sweep. Returns a `SweepResult` describing what
 * happened. Idempotent: re-running on a clean tree is a no-op.
 *
 * The function is SAFE TO CALL CONCURRENTLY with the worker: the
 * 10-min grace is the race guard. If the worker is mid-upload for a
 * product created <10 min ago, the corresponding media is too young
 * to be touched.
 */
export async function sweepOrphanMedia(
  db: DB,
  client: WooClient,
  opts: SweepOptions = {},
): Promise<SweepResult> {
  const olderThanMs = opts.olderThanMs ?? DEFAULT_OLDER_THAN_MS;
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const throttleMs = opts.deleteThrottleMs ?? DEFAULT_DELETE_THROTTLE_MS;
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // 1. List orphans older than the grace period, capped at maxItems.
  const threshold = now() - olderThanMs;
  const candidates = await listOrphansOlderThan(db, threshold, maxItems);
  const result: SweepResult = { deleted: 0, failed: 0, skipped: 0 };

  for (const row of candidates) {
    // 2. Race guard #2: the product row MUST NOT be in an
    //    `in-flight` sync state. If the product is currently being
    //    claimed, the corresponding media is "in flight" by
    //    definition and the sweeper MUST skip.
    if (row.productLocalId !== null) {
      const product = await productsRepo.get(db, row.productLocalId);
      if (product && (product.status === 'syncing' || product.status === 'pending' || product.status === 'ready')) {
        result.skipped += 1;
        continue;
      }
    }

    // 3. DELETE the media on the server.
    try {
      await client.deleteMedia(row.wcMediaId);
    } catch (err) {
      if (err instanceof WooError && err.status && err.status >= 500) {
        // 5xx: leave the row in `orphan`; the next sweep retries.
        result.failed += 1;
        continue;
      }
      if (err instanceof WooError && err.status === 404) {
        // Already gone: clean up the local row + count as success.
        await deleteRow(db, row.wcMediaId);
        result.deleted += 1;
        continue;
      }
      // 4xx / network / unknown: count as a failure, leave the row.
      result.failed += 1;
      continue;
    }

    // 4. Server confirmed delete: drop the local row.
    await deleteRow(db, row.wcMediaId);
    result.deleted += 1;

    // 5. Throttle: 5 deletes/sec by default.
    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  return result;
}

/**
 * The 24h-foreground-timer variant. Per Design §2 (Decision
// "Persistent queue = products table; sweeper runs on every worker
// invocation AND on a 24h timer") + woocommerce-sync R7 (sweeper
// cadence), the launcher schedules this once per foreground entry.
 *
 * The implementation is identical to `sweepOrphanMedia`; the
// semantic difference is "the user just opened the app — there's a
// backlog to drain even if no new uploads have happened". We keep
// the entry point separate so callers can use a different
// `olderThanMs` (e.g. drain EVERYTHING older than the last
// foreground-tick), but the default behavior is unchanged.
 */
export async function sweepOnForegroundEntry(
  db: DB,
  client: WooClient,
  opts: SweepOptions = {},
): Promise<SweepResult> {
  return sweepOrphanMedia(db, client, opts);
}
