// src/sync/queue-worker.ts — the serial sync worker (WU-4 task 4.1 +
// task 4.2 + Design §5 + Design §9).
//
// Lifecycle:
//   - `createSyncWorker({ db, deps })` returns a `Worker` with
//     `start()` and `stop()`.
//   - The worker is SINGLE-IN-FLIGHT: at most one product is being
//     processed at any time.
//   - The worker respects the `sync_paused` flag in `app_config`. If
//     set, `start()` no-ops and emits `finished(0,0)` immediately.
//   - The worker is RESUMABLE. Killing the app mid-batch leaves the
//     currently-claimed row marked `in-flight`; the next launch's
//     `claimNext()` skips it (the WHERE clause filters by
//     `status = 'queued'`) and the orphan-media sweeper (WU-4.7) +
//     the idempotency pre-check (WU-4.5) handle the recovery
//     (the server-side product is found via the `local_id` meta, so
//     the next worker run marks the row `synced`).
//
// The actual upload pipeline (idempotency pre-check, media upload,
// product create) is in `src/sync/upload-product.ts`. The worker
// here ONLY owns:
//   - the run loop (start/stop, pacing, iteration),
//   - the queue (claim, complete, fail, markFailed),
//   - backoff (per attempt, jittered, 429-aware),
//   - event emission (for the Zustand `sync-store` to subscribe).
//
// Sync errors: the worker THROWS raw `WooError` / `ValidationError`.
// The classifier in `error-presentation` is the SOLE owner of
// classification per Design §2 Decision §1. The worker translates
// the classified key into the appropriate `WorkerEvent` and stores
// it on the product row (only the `lastErrorKey` field — the user
// never sees raw text in any persisted state).

import { classifyError, presentError } from '../error-presentation';
import type { CatalogEntry, ErrorKey } from '../error-presentation';
import type { DB } from '../db';
import { queueRepo, productsRepo } from '../db/repos';
import { getConfig, setConfig } from '../db/app-config';
import { now as defaultNow } from '../infra/clock';
import { nextBackoffMsWithRetryAfter, parseRetryAfter } from './backoff';
import { uploadProductForWorker } from './upload-product';
import { sweepOrphanMedia } from './orphan-sweeper';
import type { WooClient } from '../services/woocommerce/client';
import type { Product, ProductStatus } from '../domain/types';

const SYNC_PAUSED_KEY = 'sync_paused';

export type WorkerEvent =
  | { kind: 'started'; total: number }
  | { kind: 'progress'; current: number; total: number; productId: string }
  | {
      kind: 'retrying';
      productId: string;
      attempt: number;
      delayMs: number;
    }
  | {
      kind: 'needs-attention';
      productId: string;
      classification: ErrorKey;
    }
  | { kind: 'auth-blocked' }
  | { kind: 'finished'; succeeded: number; failed: number }
  | { kind: 'paused' };

export type WorkerEventListener = (event: WorkerEvent) => void;

export type SyncDeps = {
  /** The DB handle the worker reads/writes. */
  db: DB;
  /** A factory for the WooClient (so tests can inject a fake). */
  getClient: () => Promise<WooClient>;
  /** Optional event sink (the sync-store subscribes). */
  onEvent?: WorkerEventListener;
  /** Optional clock injection (defaults to `infra/clock`). */
  now?: () => number;
  /** Optional sleep injection (defaults to `setTimeout`). */
  sleep?: (ms: number) => Promise<void>;
  /** Default inter-product delay (ms). 1000 by Design §8. */
  paceMs?: number;
  /** Orphan-sweeper options (override for tests). */
  orphanSweeperOptions?: {
    olderThanMs?: number;
    maxItems?: number;
    deleteThrottleMs?: number;
  };
  /** Test seam: override the per-product attempt cap (default 8). */
  maxAttempts?: number;
};

export type Worker = {
  start: () => Promise<{
    succeeded: number;
    failed: number;
    paused: boolean;
  }>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

export type ProcessOneOutcome =
  | { kind: 'synced' }
  | { kind: 'needs-attention'; classification: ErrorKey }
  | { kind: 'auth-blocked' };

export type ProcessOneArgs = {
  db: DB;
  productId: string;
  client: WooClient;
  onRetrying: (attempt: number, delayMs: number) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Test seam: override the cap. Defaults to 8 per WU-4 task 4.4. */
  maxAttempts?: number;
};

export async function processOne(
  args: ProcessOneArgs,
): Promise<ProcessOneOutcome> {
  const { db, productId, client, onRetrying, now, sleep } = args;
  const maxAttempts = args.maxAttempts ?? 8;
  const ts = now();

  const product = await productsRepo.get(db, productId);
  if (!product) {
    // Row was deleted between claim and process. Treat as
    // needs-attention with a generic key; the user re-queues if
    // they care.
    return { kind: 'needs-attention', classification: 'error-inesperado' };
  }

  // Drive the row into `syncing` so the UI shows progress and a
  // concurrent worker run skips it.
  await transitionTo(db, product, 'syncing', ts);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await uploadProductForWorker({
        db,
        client,
        product,
        now: ts + attempt, // each attempt is a distinct attempt_ts
      });
      // 2xx → record success + done.
      await productsRepo.update(db, productId, {
        status: 'synced',
        wcProductId: result.wcProductId,
        lastErrorKey: null,
        lastAttemptAt: now(),
        nextAttemptAt: null,
      });
      await queueRepo.complete(db, productId);
      return { kind: 'synced' };
    } catch (err) {
      const classified = classifyError(err);
      // Auth block: pause the entire queue + surface a card.
      if (classified.key === 'credenciales-invalidas') {
        await productsRepo.update(db, productId, {
          status: 'needs-attention',
          lastErrorKey: classified.key,
          lastAttemptAt: now(),
        });
        await queueRepo.markFailed(db, productId, classified.key);
        return { kind: 'auth-blocked' };
      }

      // 429 / 5xx / network — transient within the per-run cap.
      const retryAfterMs = parseRetryAfterFromError(err);
      const isCap = attempt + 1 >= maxAttempts;

      if (!isCap) {
        // Schedule the next attempt. Increment the queue row's
        // attempt_count so the claim query's ORDER BY puts the
        // soonest-retry first.
        const delayMs = nextBackoffMsWithRetryAfter(attempt, retryAfterMs);
        const nextAt = now() + delayMs;
        await productsRepo.update(db, productId, {
          status: product.priceConfirmed ? 'ready' : 'pending',
          lastErrorKey: classified.key,
          lastAttemptAt: now(),
          nextAttemptAt: nextAt,
        });
        await queueRepo.fail(db, productId, nextAt, classified.key);
        onRetrying(attempt + 1, delayMs);
        await sleep(delayMs);
        continue;
      }

      // Cap reached: needs-attention, advance to next product.
      await productsRepo.update(db, productId, {
        status: 'needs-attention',
        lastErrorKey: classified.key,
        lastAttemptAt: now(),
      });
      await queueRepo.markFailed(db, productId, classified.key);
      return {
        kind: 'needs-attention',
        classification:
          classified.key === 'error-inesperado'
            ? 'sincronizacion-fallida'
            : 'sincronizacion-reintentable',
      };
    }
  }

  // Defensive: should be unreachable because the loop returns
  // on the last attempt. Surface as needs-attention anyway.
  return {
    kind: 'needs-attention',
    classification: 'sincronizacion-fallida',
  };
}

export function createSyncWorker(deps: SyncDeps): Worker {
  const now = deps.now ?? defaultNow;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const paceMs = deps.paceMs ?? 1_000;

  let running = false;
  let stopRequested = false;

  function emit(event: WorkerEvent): void {
    if (deps.onEvent) deps.onEvent(event);
  }

  async function isPaused(): Promise<boolean> {
    const raw = await getConfig(deps.db, SYNC_PAUSED_KEY);
    return raw === '1';
  }

  async function setPausedFlag(value: boolean): Promise<void> {
    await setConfig(deps.db, SYNC_PAUSED_KEY, value ? '1' : '0');
  }

  return {
    isRunning: () => running,

    async start() {
      if (running) {
        return { succeeded: 0, failed: 0, paused: false };
      }
      running = true;
      stopRequested = false;

      let succeeded = 0;
      let failed = 0;
      let paused = false;

      try {
        // Pause gate: if the user toggled pause, no-op and tell the UI.
        if (await isPaused()) {
          emit({ kind: 'paused' });
          paused = true;
          return { succeeded, failed, paused: true };
        }

        // Count the work upfront so the progress line is honest.
        const queue = await queueRepo.list(deps.db);
        const total = queue.length;
        emit({ kind: 'started', total });

        const client = await deps.getClient();

        for (let i = 0; i < queue.length; i += 1) {
          if (stopRequested) break;
          // Re-check the pause flag on every iteration so a "Pause"
          // tap during a run stops the worker at the next safe
          // checkpoint.
          if (await isPaused()) {
            emit({ kind: 'paused' });
            paused = true;
            break;
          }

          const item = queue[i];
          if (!item) break;
          const productId = item.productLocalId;
          emit({ kind: 'progress', current: i + 1, total, productId });

          const outcome = await processOne({
            db: deps.db,
            productId,
            client,
            onRetrying: (attempt, delayMs) => {
              emit({ kind: 'retrying', productId, attempt, delayMs });
            },
            now,
            sleep,
            maxAttempts: deps.maxAttempts,
          });

          switch (outcome.kind) {
            case 'synced':
              succeeded += 1;
              break;
            case 'needs-attention':
            case 'auth-blocked':
              failed += 1;
              if (outcome.kind === 'needs-attention') {
                emit({
                  kind: 'needs-attention',
                  productId,
                  classification: outcome.classification,
                });
              } else {
                emit({ kind: 'auth-blocked' });
                stopRequested = true;
              }
              break;
          }

          // Pace between products (skip after the last one).
          if (i < queue.length - 1 && !stopRequested) {
            await sleep(paceMs);
          }
        }

        // Best-effort orphan sweep at the END of every run.
        if (!stopRequested) {
          await sweepOrphanMedia(deps.db, client, deps.orphanSweeperOptions);
        }

        emit({ kind: 'finished', succeeded, failed });
        return { succeeded, failed, paused };
      } finally {
        running = false;
      }
    },

    async stop() {
      stopRequested = true;
      // We don't cancel an in-flight HTTP request; the loop checks
      // `stopRequested` between attempts. The user's expectation is
      // "stop at the next safe checkpoint", which is the next
      // product boundary.
    },
  };
}

async function transitionTo(
  db: DB,
  product: Product,
  to: ProductStatus,
  nowTs: number,
): Promise<void> {
  await productsRepo.update(db, product.localId, {
    status: to,
    lastAttemptAt: nowTs,
  });
}

function parseRetryAfterFromError(err: unknown): number | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'headers' in err &&
    err.headers instanceof Headers
  ) {
    return parseRetryAfter(err.headers.get('Retry-After'));
  }
  return null;
}

/**
 * Re-export of the catalog entry builder so the sync-store can call
 * `presentError(<key>)` without reaching into the error-presentation
 * module from a UI file.
 */
export function cardFor(
  key: ErrorKey,
  params?: { productId?: string },
): CatalogEntry {
  return presentError(key, params);
}
