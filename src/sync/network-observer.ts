// src/sync/network-observer.ts — typed wrapper over `expo-network`
// (WU-4 task 4.3 + sync-trigger spec R1 + Design §15).
//
// The observer emits a small set of typed events. The sync-trigger
// (also in this folder) subscribes and decides whether to start the
// worker. The observer DOES NOT start the worker on its own — that
// decision lives in the trigger (the trigger knows about the
// `sync_paused` flag and `auto_sync_on_wifi` preference).
//
// Two surfaces:
//   - `subscribeNetworkEvents(handler)`: long-lived subscription
//     that emits every state change. Returns an `unsubscribe` fn.
//   - `getCurrentNetworkSnapshot()`: one-shot read; useful on
//     app foreground (the trigger fires `start()` only if the
//     current snapshot is `wifi` AND `auto_sync_on_wifi` is set).
//
// We intentionally do NOT depend on any RN-specific event-bus
// library; the observer is a thin promise-returning wrapper so
// the unit tests can drive it deterministically.

import type { NetworkSnapshot } from '../infra/network';

export type NetworkEvent =
  | { kind: 'connected'; snapshot: NetworkSnapshot }
  | { kind: 'disconnected'; snapshot: NetworkSnapshot }
  | { kind: 'wifi-connected'; snapshot: NetworkSnapshot }
  | { kind: 'wifi-disconnected'; snapshot: NetworkSnapshot };

export type NetworkEventHandler = (event: NetworkEvent) => void;

export type NetworkSubscription = {
  unsubscribe: () => void;
};

export type NetworkObserver = {
  subscribe: (handler: NetworkEventHandler) => NetworkSubscription;
  getCurrentSnapshot: () => Promise<NetworkSnapshot>;
};

const isWifi = (snap: NetworkSnapshot): boolean =>
  snap.isConnected === true && snap.type === 'wifi';

/**
 * Build a `NetworkObserver` from a snapshot provider (so the tests
 * can drive the observer with a stub). The production observer
 * wraps `expo-network`; the test observer wraps a controllable
 * promise-returning function.
 */
export function createNetworkObserver(
  getSnapshot: () => Promise<NetworkSnapshot>,
): NetworkObserver {
  const handlers = new Set<NetworkEventHandler>();
  let lastSnapshot: NetworkSnapshot | null = null;
  let started = false;

  const broadcast = (event: NetworkEvent): void => {
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // A misbehaving handler MUST NOT take down the observer
        // for the other subscribers. Swallow.
      }
    }
  };

  return {
    async getCurrentSnapshot() {
      const snap = await getSnapshot();
      lastSnapshot = snap;
      return snap;
    },

    subscribe(handler) {
      handlers.add(handler);
      // Kick off the polling loop on the first subscription.
      if (!started) {
        started = true;
        void (async () => {
          // First read.
          try {
            const snap = await getSnapshot();
            lastSnapshot = snap;
          } catch {
            // Initial read failure: do not crash; subscribers will
            // see the next successful read.
          }
          // Poll loop. The cadence is a trade-off: 1s is fine for
          // a foreground app; we don't need sub-second updates.
          // (expo-network doesn't expose a true event API in v56,
          // so polling is the documented path.)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const intervalMs = (globalThis as { __NETWORK_POLL_MS__?: number })
            .__NETWORK_POLL_MS__ ?? 1_000;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            await new Promise<void>((r) => {
              const t = setTimeout(r, intervalMs);
              // Allow tests to short-circuit the loop on
              // `unsubscribe()`.
              t.unref?.();
            });
            if (handlers.size === 0) {
              started = false;
              return;
            }
            let snap: NetworkSnapshot;
            try {
              snap = await getSnapshot();
            } catch {
              continue;
            }
            const previous = lastSnapshot;
            lastSnapshot = snap;
            if (!previous) continue;

            if (!previous.isConnected && snap.isConnected) {
              broadcast({ kind: 'connected', snapshot: snap });
            } else if (previous.isConnected && !snap.isConnected) {
              broadcast({ kind: 'disconnected', snapshot: snap });
            }
            if (!isWifi(previous) && isWifi(snap)) {
              broadcast({ kind: 'wifi-connected', snapshot: snap });
            } else if (isWifi(previous) && !isWifi(snap)) {
              broadcast({ kind: 'wifi-disconnected', snapshot: snap });
            }
          }
        })();
      }
      return {
        unsubscribe: () => {
          handlers.delete(handler);
        },
      };
    },
  };
}

/**
 * The default production observer — wraps `expo-network`. The
 * test for this module uses `createNetworkObserver` directly with
 * a stub; the production wiring is a one-liner.
 */
export function createDefaultNetworkObserver(): NetworkObserver {
  // Lazy import so the test path doesn't have to load the module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getNetworkSnapshot } = require('../infra/network') as {
    getNetworkSnapshot: () => Promise<NetworkSnapshot>;
  };
  return createNetworkObserver(getNetworkSnapshot);
}
