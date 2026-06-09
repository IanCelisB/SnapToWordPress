// src/sync/__tests__/state-machine.test.ts — the sync worker's view of
// the product state machine.

import { nextStatusFor, assertTransition, IllegalTransitionError } from '../state-machine';

describe('sync state machine', () => {
  it('uploading-media: pending → syncing', () => {
    expect(nextStatusFor('pending', 'uploading-media')).toBe('syncing');
  });

  it('uploading-media: ready → syncing', () => {
    expect(nextStatusFor('ready', 'uploading-media')).toBe('syncing');
  });

  it('creating-product: syncing → syncing (idempotent — already there)', () => {
    // The upload pipeline may call `creating-product` while the row
    // is already in `syncing`. The function returns the SAME
    // status to signal "no row update required".
    expect(nextStatusFor('syncing', 'creating-product')).toBe('syncing');
  });

  it('synced: syncing → synced', () => {
    expect(nextStatusFor('syncing', 'synced')).toBe('synced');
  });

  it('pending-retry from syncing goes back to pending', () => {
    expect(nextStatusFor('syncing', 'pending-retry')).toBe('pending');
  });

  it('pending-retry from ready stays ready', () => {
    expect(nextStatusFor('ready', 'pending-retry')).toBe('ready');
  });

  it('needs-attention: syncing → needs-attention', () => {
    expect(nextStatusFor('syncing', 'needs-attention')).toBe('needs-attention');
  });

  it('auth-blocked: any state stays put (the queue pauses; the row is left alone)', () => {
    expect(nextStatusFor('syncing', 'auth-blocked')).toBe('syncing');
    expect(nextStatusFor('ready', 'auth-blocked')).toBe('ready');
  });

  it('rejects illegal transitions with a typed error', () => {
    expect(() => assertTransition('synced', 'pending')).toThrow(IllegalTransitionError);
  });
});
