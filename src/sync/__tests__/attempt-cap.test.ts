// src/sync/__tests__/attempt-cap.test.ts — the per-product attempt cap.

import {
  MAX_ATTEMPTS_PER_PRODUCT,
  hasExceededAttemptCap,
  isFinalAttempt,
  NEEDS_ATTENTION_CARD_KEY,
  FAILED_DEAD_CARD_KEY,
} from '../attempt-cap';

describe('sync/attempt-cap', () => {
  it('cap is 8 per WU-4 task 4.4', () => {
    expect(MAX_ATTEMPTS_PER_PRODUCT).toBe(8);
  });

  it('returns false for attempts within the cap (0..7)', () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_PRODUCT; i += 1) {
      expect(hasExceededAttemptCap(i)).toBe(false);
    }
  });

  it('returns true at and beyond the cap (8+)', () => {
    expect(hasExceededAttemptCap(MAX_ATTEMPTS_PER_PRODUCT)).toBe(true);
    expect(hasExceededAttemptCap(MAX_ATTEMPTS_PER_PRODUCT + 5)).toBe(true);
  });

  it('flags the final allowed attempt correctly', () => {
    expect(isFinalAttempt(0)).toBe(false);
    expect(isFinalAttempt(MAX_ATTEMPTS_PER_PRODUCT - 2)).toBe(false);
    expect(isFinalAttempt(MAX_ATTEMPTS_PER_PRODUCT - 1)).toBe(true);
  });

  it('exposes the recoverable and dead catalog keys', () => {
    expect(NEEDS_ATTENTION_CARD_KEY).toBe('sincronizacion-reintentable');
    expect(FAILED_DEAD_CARD_KEY).toBe('sincronizacion-fallida');
  });
});
