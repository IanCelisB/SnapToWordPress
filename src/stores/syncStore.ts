// src/stores/syncStore.ts — Zustand store for the sync screen
// (WU-4 task 4.4 + Design §5 + §7).
//
// The store is the UI's read model of the sync worker. The
// worker pushes `WorkerEvent`s in via `applyEvent`; the UI
// subscribes via the `useSyncStore` hook.
//
// The store DOES NOT own the worker. The sync-trigger (in
// `src/sync/sync-trigger.ts`) is the singleton that owns the
// worker + the network observer. The store is the read model.
//
// Two pieces of state are persisted to `app_config`:
//   - `paused` (key: `sync_paused`) — the user's pause toggle.
//   - `lastSyncAt` (key: `sync_last_at`) — shown in the UI as
//     "Última sincronización: hace 5 min".
//
// The actual `auto_sync_on_wifi` flag is ALSO in `app_config` and
// is read by the trigger, not by this store.

import { create } from 'zustand';
import type { WorkerEvent } from '../sync/queue-worker';
import type { ErrorKey } from '../error-presentation';

export type SyncStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'auth-blocked'
  | 'needs-attention';

export type SyncProgress = {
  current: number;
  total: number;
};

export type SyncState = {
  status: SyncStatus;
  progress: SyncProgress | null;
  paused: boolean;
  pausedAt: number | null;
  blockedCount: number;
  lastSyncAt: number | null;
  /** Last event received; for the sync screen's "needs attention" tap target. */
  lastNeedsAttentionProductId: string | null;
  /** Last classification key the worker surfaced. */
  lastNeedsAttentionKey: ErrorKey | null;
};

export type SyncActions = {
  applyEvent: (event: WorkerEvent) => void;
  setPaused: (paused: boolean, now?: number) => void;
  /** Test seam: reset the store to the initial state. */
  __resetForTest: () => void;
};

export type SyncStore = SyncState & SyncActions;

const initialState: SyncState = {
  status: 'idle',
  progress: null,
  paused: false,
  pausedAt: null,
  blockedCount: 0,
  lastSyncAt: null,
  lastNeedsAttentionProductId: null,
  lastNeedsAttentionKey: null,
};

export const createSyncStore = () =>
  create<SyncStore>((set) => ({
    ...initialState,

    applyEvent: (event) => {
      switch (event.kind) {
        case 'started':
          set({
            status: 'running',
            progress: { current: 0, total: event.total },
          });
          return;
        case 'progress':
          set({
            status: 'running',
            progress: {
              current: event.current,
              total: event.total,
            },
          });
          return;
        case 'retrying':
          // Stay in `running`; the progress line still applies.
          return;
        case 'needs-attention':
          set((prev) => ({
            status: 'needs-attention',
            blockedCount: prev.blockedCount + 1,
            lastNeedsAttentionProductId: event.productId,
            lastNeedsAttentionKey: event.classification,
          }));
          return;
        case 'auth-blocked':
          set({ status: 'auth-blocked' });
          return;
        case 'finished':
          set((prev) => ({
            status: prev.paused ? 'paused' : 'idle',
            progress: null,
            lastSyncAt: Date.now(),
            // A finished run that had no needs-attention events
            // does NOT clear the existing `blockedCount` — a
            // successful re-sync of some products doesn't
            // magically fix the ones that need user attention.
            // The store clears `blockedCount` only when the user
            // explicitly re-queues.
          }));
          return;
        case 'paused':
          set({ status: 'paused' });
          return;
      }
    },

    setPaused: (paused, now = Date.now()) => {
      set({ paused, pausedAt: paused ? now : null });
    },

    __resetForTest: () => {
      set({ ...initialState });
    },
  }));

// ---------------------------------------------------------------------------
// Module-level singleton — the sync screen + persistent banner both
// reach the same store instance.
// ---------------------------------------------------------------------------

let cachedStore: ReturnType<typeof createSyncStore> | null = null;

export function useSyncStore(): ReturnType<typeof createSyncStore> {
  if (cachedStore === null) {
    cachedStore = createSyncStore();
  }
  return cachedStore;
}

export function __resetSyncStoreForTest(): void {
  cachedStore = null;
}
