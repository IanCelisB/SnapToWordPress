// src/sync/__tests__/network-observer.test.ts — the typed wrapper
// over `expo-network`.

import {
  createNetworkObserver,
  type NetworkObserver,
  type NetworkEvent,
} from '../network-observer';
import type { NetworkSnapshot } from '../../infra/network';

function snap(overrides: Partial<NetworkSnapshot> = {}): NetworkSnapshot {
  return {
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
    ...overrides,
  };
}

function driveObserver(
  snapshots: ReadonlyArray<NetworkSnapshot>,
  options: { pollMs?: number } = {},
): {
  observer: NetworkObserver;
  events: NetworkEvent[];
  setSnapshot: (next: NetworkSnapshot) => void;
} {
  const events: NetworkEvent[] = [];
  let i = 0;
  const observer = createNetworkObserver(async () => {
    const s = snapshots[i] ?? snapshots[snapshots.length - 1];
    if (i < snapshots.length - 1) i += 1;
    return s ?? snap();
  });
  // Override the poll interval to make the test deterministic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__NETWORK_POLL_MS__ = options.pollMs ?? 10;
  observer.subscribe((e) => events.push(e));
  return {
    observer,
    events,
    setSnapshot: (next) => {
      i = snapshots.length;
      snapshots = [next];
    },
  };
}

describe('createNetworkObserver', () => {
  it('emits wifi-connected when the network transitions to Wi-Fi', async () => {
    const first = snap({ type: 'cellular' });
    const second = snap({ type: 'wifi' });
    const { events } = driveObserver([first, second]);
    // Wait for at least one poll cycle.
    await new Promise((r) => setTimeout(r, 50));
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('wifi-connected');
  });

  it('emits disconnected when the network drops', async () => {
    const first = snap({ isConnected: true });
    const second = snap({ isConnected: false });
    const { events } = driveObserver([first, second]);
    await new Promise((r) => setTimeout(r, 50));
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('disconnected');
  });

  it('emits wifi-disconnected when Wi-Fi is lost', async () => {
    const first = snap({ type: 'wifi' });
    const second = snap({ type: 'cellular' });
    const { events } = driveObserver([first, second]);
    await new Promise((r) => setTimeout(r, 50));
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('wifi-disconnected');
  });

  it('getCurrentSnapshot returns the underlying provider snapshot', async () => {
    const observer = createNetworkObserver(async () => snap({ type: 'ethernet' }));
    const out = await observer.getCurrentSnapshot();
    expect(out.type).toBe('ethernet');
    expect(out.isConnected).toBe(true);
  });

  it('multiple subscribers all receive the event', async () => {
    const first = snap({ type: 'cellular' });
    const second = snap({ type: 'wifi' });
    const observer = createNetworkObserver(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__hits = ((globalThis as any).__hits ?? 0) + 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hits = (globalThis as any).__hits as number;
      return hits === 1 ? first : second;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__NETWORK_POLL_MS__ = 10;
    const a: NetworkEvent[] = [];
    const b: NetworkEvent[] = [];
    observer.subscribe((e) => a.push(e));
    observer.subscribe((e) => b.push(e));
    await new Promise((r) => setTimeout(r, 50));
    expect(a.some((e) => e.kind === 'wifi-connected')).toBe(true);
    expect(b.some((e) => e.kind === 'wifi-connected')).toBe(true);
  });

  it('unsubscribe stops the handler from receiving events', async () => {
    const observer = createNetworkObserver(async () => snap({ type: 'wifi' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__NETWORK_POLL_MS__ = 10;
    const received: NetworkEvent[] = [];
    const sub = observer.subscribe((e) => received.push(e));
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 50));
    // No events should arrive for the unsubscribed handler.
    expect(received).toHaveLength(0);
  });
});
