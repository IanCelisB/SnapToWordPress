// src/sync/__tests__/backoff.test.ts — the jitter + 429 adapter.

import {
  nextBackoffMs,
  nextBackoffMsWithRetryAfter,
  parseRetryAfter,
  DEFAULT_JITTER,
} from '../backoff';

describe('sync/backoff', () => {
  it('honors the domain curve at attempt 0..5 with deterministic random', () => {
    // 0.5 keeps the jitter factor at exactly 1.0 → no jitter applied.
    expect(nextBackoffMs(0, { random: () => 0.5 })).toBe(1_000);
    expect(nextBackoffMs(1, { random: () => 0.5 })).toBe(2_000);
    expect(nextBackoffMs(2, { random: () => 0.5 })).toBe(4_000);
    expect(nextBackoffMs(3, { random: () => 0.5 })).toBe(8_000);
    expect(nextBackoffMs(4, { random: () => 0.5 })).toBe(16_000);
    expect(nextBackoffMs(5, { random: () => 0.5 })).toBe(32_000);
  });

  it('caps the curve at 60s for attempt ≥ 6', () => {
    expect(nextBackoffMs(6, { random: () => 0.5 })).toBe(60_000);
    expect(nextBackoffMs(9, { random: () => 0.5 })).toBe(60_000);
  });

  it('applies ±20% jitter at the extremes (deterministic)', () => {
    // 0.0 → factor = 1 - 0.2 = 0.8 → 1_000 * 0.8 = 800
    expect(nextBackoffMs(0, { random: () => 0 })).toBe(800);
    // 1.0 → factor = 1 + 0.2 = 1.2 → 1_000 * 1.2 = 1_200
    expect(nextBackoffMs(0, { random: () => 1 })).toBe(1_200);
  });

  it('disables jitter when jitter=0', () => {
    expect(nextBackoffMs(0, { random: () => 0, jitter: 0 })).toBe(1_000);
    expect(nextBackoffMs(0, { random: () => 1, jitter: 0 })).toBe(1_000);
  });

  it('clamps jitter to [0, 1]', () => {
    // NaN → min → 0
    expect(nextBackoffMs(0, { random: () => 0.5, jitter: Number.NaN })).toBe(
      1_000,
    );
    // > 1 → 1 → factor at random=1 → 2 → 2_000
    expect(nextBackoffMs(0, { random: () => 1, jitter: 5 })).toBe(2_000);
  });

  it('default jitter is 0.2 (matches Design §9 / task 4.3)', () => {
    expect(DEFAULT_JITTER).toBe(0.2);
  });

  it('honors Retry-After when it is longer than the curve', () => {
    // Curve at attempt 0 = 1_000ms; Retry-After = 5_000ms → 5_000 wins.
    expect(nextBackoffMsWithRetryAfter(0, 5_000, { random: () => 0.5 })).toBe(
      5_000,
    );
  });

  it('uses the curve when the curve is longer than Retry-After', () => {
    // Curve at attempt 5 = 32_000ms; Retry-After = 1_000ms → 32_000 wins.
    expect(nextBackoffMsWithRetryAfter(5, 1_000, { random: () => 0.5 })).toBe(
      32_000,
    );
  });

  it('falls back to the curve when Retry-After is null', () => {
    expect(nextBackoffMsWithRetryAfter(0, null, { random: () => 0.5 })).toBe(
      1_000,
    );
  });
});

describe('parseRetryAfter', () => {
  it('parses a positive seconds value', () => {
    expect(parseRetryAfter('5')).toBe(5_000);
    expect(parseRetryAfter('120')).toBe(120_000);
  });

  it('parses a "0" value to 0ms (no wait)', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('returns null for empty / non-numeric values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('abc')).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(parseRetryAfter('-1')).toBeNull();
  });
});
