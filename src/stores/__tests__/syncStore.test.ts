// src/stores/__tests__/syncStore.test.ts — the sync-store event
// reducer.

import { createSyncStore, __resetSyncStoreForTest } from '../syncStore';
import type { WorkerEvent } from '../../sync/queue-worker';

function freshStore() {
  // The store factory is stateful (caches the singleton). For
  // unit tests, build a fresh store each time.
  __resetSyncStoreForTest();
  return createSyncStore();
}

describe('syncStore.applyEvent', () => {
  it('started: sets status=running and a fresh progress', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 5 });
    const s = store.getState();
    expect(s.status).toBe('running');
    expect(s.progress).toEqual({ current: 0, total: 5 });
  });

  it('progress: updates current + total', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 5 });
    store.getState().applyEvent({
      kind: 'progress',
      current: 2,
      total: 5,
      productId: 'p1',
    });
    const s = store.getState();
    expect(s.progress).toEqual({ current: 2, total: 5 });
    expect(s.status).toBe('running');
  });

  it('needs-attention: increments blockedCount + records the key', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 3 });
    store.getState().applyEvent({
      kind: 'needs-attention',
      productId: 'p1',
      classification: 'sincronizacion-reintentable',
    });
    const s = store.getState();
    expect(s.status).toBe('needs-attention');
    expect(s.blockedCount).toBe(1);
    expect(s.lastNeedsAttentionProductId).toBe('p1');
    expect(s.lastNeedsAttentionKey).toBe('sincronizacion-reintentable');

    store.getState().applyEvent({
      kind: 'needs-attention',
      productId: 'p2',
      classification: 'sincronizacion-fallida',
    });
    expect(store.getState().blockedCount).toBe(2);
  });

  it('auth-blocked: flips status without touching progress', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 5 });
    store.getState().applyEvent({
      kind: 'progress',
      current: 1,
      total: 5,
      productId: 'p1',
    });
    store.getState().applyEvent({ kind: 'auth-blocked' });
    const s = store.getState();
    expect(s.status).toBe('auth-blocked');
    expect(s.progress).toEqual({ current: 1, total: 5 });
  });

  it('finished: clears progress, sets lastSyncAt, returns to idle (or paused)', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 3 });
    store.getState().applyEvent({ kind: 'finished', succeeded: 2, failed: 1 });
    const s = store.getState();
    expect(s.status).toBe('idle');
    expect(s.progress).toBeNull();
    expect(s.lastSyncAt).not.toBeNull();
  });

  it('finished while paused: status=paused, not idle', () => {
    const store = freshStore();
    store.getState().setPaused(true, 1_000_000);
    store.getState().applyEvent({ kind: 'started', total: 3 });
    store.getState().applyEvent({ kind: 'finished', succeeded: 3, failed: 0 });
    expect(store.getState().status).toBe('paused');
  });

  it('paused event: status=paused', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 3 });
    store.getState().applyEvent({ kind: 'paused' });
    expect(store.getState().status).toBe('paused');
  });

  it('retrying: does not change status or progress', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 3 });
    const before = store.getState();
    store.getState().applyEvent({
      kind: 'retrying',
      productId: 'p1',
      attempt: 1,
      delayMs: 1_000,
    });
    const after = store.getState();
    expect(after.status).toBe(before.status);
    expect(after.progress).toEqual(before.progress);
  });

  it('setPaused toggles the flag and the timestamp', () => {
    const store = freshStore();
    store.getState().setPaused(true, 1_000);
    expect(store.getState().paused).toBe(true);
    expect(store.getState().pausedAt).toBe(1_000);
    store.getState().setPaused(false);
    expect(store.getState().paused).toBe(false);
    expect(store.getState().pausedAt).toBeNull();
  });

  it('__resetForTest returns the store to the initial state', () => {
    const store = freshStore();
    store.getState().applyEvent({ kind: 'started', total: 5 });
    store.getState().__resetForTest();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().blockedCount).toBe(0);
    expect(store.getState().lastSyncAt).toBeNull();
  });

  it('handles a full worker run (started → progress → finished)', () => {
    const store = freshStore();
    const events: WorkerEvent[] = [
      { kind: 'started', total: 2 },
      {
        kind: 'progress',
        current: 1,
        total: 2,
        productId: 'p1',
      },
      {
        kind: 'progress',
        current: 2,
        total: 2,
        productId: 'p2',
      },
      { kind: 'finished', succeeded: 2, failed: 0 },
    ];
    for (const e of events) store.getState().applyEvent(e);
    const s = store.getState();
    expect(s.status).toBe('idle');
    expect(s.progress).toBeNull();
    expect(s.blockedCount).toBe(0);
  });
});
