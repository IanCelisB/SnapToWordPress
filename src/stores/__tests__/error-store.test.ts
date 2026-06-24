// src/stores/__tests__/error-store.test.ts

import { createErrorStore, __resetErrorStoreForTest } from '../error-store';

function freshStore() {
  __resetErrorStoreForTest();
  return createErrorStore();
}

describe('errorStore', () => {
  afterEach(() => {
    __resetErrorStoreForTest();
  });

  it('starts empty', () => {
    const store = freshStore();
    expect(store.getState().errors).toEqual([]);
  });

  it('appends auth-blocked event', () => {
    const store = freshStore();
    store.getState().addEvent({ kind: 'auth-blocked' });
    const errors = store.getState().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.key).toBe('credenciales-invalidas');
  });

  it('appends needs-attention event', () => {
    const store = freshStore();
    store.getState().addEvent({
      kind: 'needs-attention',
      productId: 'p1',
      classification: 'sincronizacion-reintentable',
    });
    const errors = store.getState().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.key).toBe('sincronizacion-reintentable');
    expect(errors[0]?.productId).toBe('p1');
  });

  it('ignores non-error events', () => {
    const store = freshStore();
    store.getState().addEvent({ kind: 'started', total: 5 });
    store.getState().addEvent({ kind: 'finished', succeeded: 5, failed: 0 });
    expect(store.getState().errors).toHaveLength(0);
  });

  it('trims to 50 entries', () => {
    const store = freshStore();
    for (let i = 0; i < 55; i++) {
      store.getState().addEvent({ kind: 'auth-blocked' });
    }
    expect(store.getState().errors).toHaveLength(50);
  });

  it('clear removes all errors', () => {
    const store = freshStore();
    store.getState().addEvent({ kind: 'auth-blocked' });
    store.getState().clear();
    expect(store.getState().errors).toHaveLength(0);
  });

  it('__resetForTest returns to initial state', () => {
    const store = freshStore();
    store.getState().addEvent({ kind: 'auth-blocked' });
    store.getState().__resetForTest();
    expect(store.getState().errors).toHaveLength(0);
  });
});
