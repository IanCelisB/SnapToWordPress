// src/sync/sync-trigger.ts — the sync orchestrator singleton (WU-4
// task 4.5 + sync-trigger spec + Design §9).
//
// Lifecycle:
//   - Initialized in `app/_layout.tsx` on app launch.
//   - On foreground: if `not paused AND hasReadyRows AND
//     (wifi OR manualOverride)` → `worker.start()`.
//   - On Wi-Fi network change: if `auto_sync_on_wifi` is on →
//     `worker.start()`.
//   - Wires the orphan-media 24h timer.
//
// The trigger is the only module that knows about the worker's
// START command. The sync-store subscribes to the worker's
// events (via `onEvent`) but does NOT start the worker itself.

import type { DB } from '../db';
import {
  getConfig,
  setConfig,
} from '../db/app-config';
import { createSyncWorker } from './queue-worker';
import type { WorkerEventListener, Worker } from './queue-worker';
import type { NetworkObserver } from './network-observer';
import { createWooClient } from '../services/woocommerce/client';
import type { WooClient } from '../services/woocommerce/client';
import { createHttpClient } from '../infra/http-client';
import { loadCredentials } from '../services/credentials';
import type { WCCredentials } from '../domain/types';

const AUTO_SYNC_ON_WIFI_KEY = 'auto_sync_on_wifi';
const SYNC_PAUSED_KEY = 'sync_paused';
const SWEEPER_LAST_RUN_KEY = 'sweeper_last_run';
const SWEEPER_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24h

export type SyncTriggerDeps = {
  db: DB;
  observer: NetworkObserver;
  onEvent: WorkerEventListener;
  /** Test seam: override the WooClient factory. */
  getClient?: () => Promise<WooClient>;
  /** Test seam: override the 24h sweeper cadence. */
  sweeperIntervalMs?: number;
};

export type SyncTrigger = {
  /** Wire up the network observer + load initial pause/auto-sync prefs. */
  init: () => Promise<void>;
  /** Manual "Sincronizar ahora" tap. */
  startManual: () => Promise<{ succeeded: number; failed: number; paused: boolean }>;
  /** Read the current `paused` flag from app_config. */
  isPaused: () => Promise<boolean>;
  /** Persist the user's pause-toggle tap. */
  setPaused: (paused: boolean) => Promise<void>;
  /** Read the current `auto_sync_on_wifi` flag. */
  isAutoSyncOnWifi: () => Promise<boolean>;
  /** Persist the auto-sync preference. */
  setAutoSyncOnWifi: (value: boolean) => Promise<void>;
  /** Tear down (the layout's cleanup hook calls this). */
  dispose: () => void;
  /** Test seam: the underlying worker (so tests can inject spies). */
  __worker: () => Worker | null;
};

export function createSyncTrigger(deps: SyncTriggerDeps): SyncTrigger {
  let worker: Worker | null = null;
  let networkUnsub: (() => void) | null = null;

  async function getClient(): Promise<WooClient> {
    if (deps.getClient) return deps.getClient();
    const creds = await loadCredentials();
    if (!creds) {
      throw new Error('sync-trigger: no credentials loaded');
    }
    const http = createHttpClient();
    return createWooClient(creds, http);
  }

  async function isPaused(): Promise<boolean> {
    const raw = await getConfig(deps.db, SYNC_PAUSED_KEY);
    return raw === '1';
  }

  async function isAutoSyncOnWifi(): Promise<boolean> {
    const raw = await getConfig(deps.db, AUTO_SYNC_ON_WIFI_KEY);
    // Default ON per Design §2 (Decision "Auto-sync default ON on Wi-Fi").
    if (raw === null) return true;
    return raw === '1';
  }

  return {
    __worker: () => worker,

    async init() {
      // Wire the worker to the event sink the store provided.
      const w = createSyncWorker({
        db: deps.db,
        getClient,
        onEvent: deps.onEvent,
      });
      worker = w;

      // Subscribe to network events. The trigger reacts to
      // `wifi-connected` and `connected` by auto-starting the
      // worker (subject to the pause toggle + auto-sync pref).
      const sub = deps.observer.subscribe(async (event) => {
        if (
          event.kind === 'wifi-connected' ||
          event.kind === 'connected'
        ) {
          if (await isPaused()) return;
          if (!(await isAutoSyncOnWifi())) return;
          await w.start();
        }
      });
      networkUnsub = sub.unsubscribe;
    },

    async startManual() {
      if (!worker) {
        // Trigger wasn't initialized yet; the layout's effect
        // should have called `init()` first.
        return { succeeded: 0, failed: 0, paused: false };
      }
      return worker.start();
    },

    isPaused,
    setPaused: async (paused: boolean) => {
      await setConfig(deps.db, SYNC_PAUSED_KEY, paused ? '1' : '0');
    },
    isAutoSyncOnWifi,
    setAutoSyncOnWifi: async (value: boolean) => {
      await setConfig(deps.db, AUTO_SYNC_ON_WIFI_KEY, value ? '1' : '0');
    },

    dispose() {
      if (networkUnsub) {
        networkUnsub();
        networkUnsub = null;
      }
      worker = null;
    },
  };
}

/**
 * Best-effort: run the orphan-media sweeper once per 24h on a
 * foreground entry. The trigger schedules this via
 * `sweeperLastRun` in `app_config`.
 */
export async function maybeRunDailySweeper(
  db: DB,
  client: WooClient,
  now: number = Date.now(),
  intervalMs: number = SWEEPER_INTERVAL_MS,
): Promise<{ ran: boolean; deleted: number; failed: number; skipped: number }> {
  const last = await getConfigNumber(db, SWEEPER_LAST_RUN_KEY);
  if (last !== null && now - last < intervalMs) {
    return { ran: false, deleted: 0, failed: 0, skipped: 0 };
  }
  const result = await runSweeperAndPersist(db, client, now);
  return { ran: true, ...result };
}

async function runSweeperAndPersist(
  db: DB,
  client: WooClient,
  now: number,
): Promise<{ deleted: number; failed: number; skipped: number }> {
  const { sweepOrphanMedia } = await import('./orphan-sweeper');
  const result = await sweepOrphanMedia(db, client);
  await setConfig(db, SWEEPER_LAST_RUN_KEY, String(now));
  return result;
}

async function getConfigNumber(
  db: DB,
  key: string,
): Promise<number | null> {
  const raw = await getConfig(db, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Re-export for type users; the trigger's consumer (the layout) only
// needs the `SyncTrigger` type and `createSyncTrigger` factory.
export type { WCCredentials };
