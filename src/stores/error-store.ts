// src/stores/error-store.ts — Zustand store for error browsing/history
// (WU-4 task 4.4 companion).
//
// Holds a list of recent errors surfaced by the sync worker. Each
// entry carries the ErrorKey, a timestamp, and optional context
// (product id, classification). The store subscribes to WorkerEvents
// for `auth-blocked` and `needs-attention` and appends entries.
//
// Max 50 errors — oldest trimmed on append.

import { create } from 'zustand';
import type { ErrorKey } from '../error-presentation';
import type { WorkerEvent } from '../sync/queue-worker';

export type ErrorEntry = {
  id: string;
  key: ErrorKey;
  timestamp: number;
  productId?: string;
};

export type ErrorState = {
  errors: ReadonlyArray<ErrorEntry>;
};

export type ErrorActions = {
  addEvent: (event: WorkerEvent) => void;
  clear: () => void;
  __resetForTest: () => void;
};

export type ErrorStore = ErrorState & ErrorActions;

const MAX_ERRORS = 50;

let nextId = 0;

const initialState: ErrorState = {
  errors: [],
};

export const createErrorStore = () =>
  create<ErrorStore>((set) => ({
    ...initialState,

    addEvent: (event) => {
      if (
        event.kind !== 'auth-blocked' &&
        event.kind !== 'needs-attention'
      ) {
        return;
      }

      const entry: ErrorEntry = {
        id: `err-${++nextId}`,
        key:
          event.kind === 'auth-blocked'
            ? 'credenciales-invalidas'
            : event.classification,
        timestamp: Date.now(),
        productId:
          event.kind === 'needs-attention' ? event.productId : undefined,
      };

      set((prev) => {
        const next = [entry, ...prev.errors];
        if (next.length > MAX_ERRORS) {
          next.length = MAX_ERRORS;
        }
        return { errors: next };
      });
    },

    clear: () => {
      set({ errors: [] });
    },

    __resetForTest: () => {
      nextId = 0;
      set({ ...initialState });
    },
  }));

// ---------------------------------------------------------------------------
// Module-level singleton — the banner and any error-history screen
// share the same instance.
// ---------------------------------------------------------------------------

let cachedStore: ReturnType<typeof createErrorStore> | null = null;

export function useErrorStore(): ReturnType<typeof createErrorStore> {
  if (cachedStore === null) {
    cachedStore = createErrorStore();
  }
  return cachedStore;
}

export function __resetErrorStoreForTest(): void {
  cachedStore = null;
}
