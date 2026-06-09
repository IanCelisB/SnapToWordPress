// src/domain/__tests__/domain.test.ts — pure domain helpers.

import { backoff, schedule, hasExceededCap, MAX_ATTEMPTS_PER_RUN } from '../backoff';
import {
  canTransition,
  isFinal,
  isInFlight,
  isRecoverable,
  nextStates,
} from '../status';

describe('backoff', () => {
  it('exports the exact Design §9 schedule', () => {
    expect(schedule()).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000]);
  });

  it('backoff(0) = 1000, backoff(1) = 2000, ... backoff(4) = 16000', () => {
    expect(backoff(0)).toBe(1000);
    expect(backoff(1)).toBe(2000);
    expect(backoff(2)).toBe(4000);
    expect(backoff(3)).toBe(8000);
    expect(backoff(4)).toBe(16000);
  });

  it('caps at 60s from index 6 onwards', () => {
    expect(backoff(6)).toBe(60_000);
    expect(backoff(9)).toBe(60_000);
    expect(backoff(50)).toBe(60_000);
  });

  it('returns the first-step value for non-finite or negative attempts', () => {
    expect(backoff(-1)).toBe(1000);
    expect(backoff(NaN)).toBe(1000);
    expect(backoff(Number.POSITIVE_INFINITY)).toBe(60_000);
  });

  it('caps per-run attempts at 5', () => {
    expect(MAX_ATTEMPTS_PER_RUN).toBe(5);
    expect(hasExceededCap(0)).toBe(false);
    expect(hasExceededCap(4)).toBe(false);
    expect(hasExceededCap(5)).toBe(true);
    expect(hasExceededCap(6)).toBe(true);
  });
});

describe('status state machine', () => {
  it('pending → ready is allowed', () => {
    expect(canTransition('pending', 'ready')).toBe(true);
  });

  it('pending → synced is NOT allowed', () => {
    expect(canTransition('pending', 'synced')).toBe(false);
  });

  it('synced is terminal in MVP', () => {
    expect(nextStates('synced')).toEqual(new Set());
    expect(isFinal('synced')).toBe(true);
  });

  it('syncing is in-flight', () => {
    expect(isInFlight('syncing')).toBe(true);
    expect(isInFlight('pending')).toBe(false);
  });

  it('needs-attention is recoverable', () => {
    expect(isRecoverable('needs-attention')).toBe(true);
    expect(isRecoverable('failed')).toBe(true);
    expect(isRecoverable('synced')).toBe(false);
  });

  it('needs-attention can re-queue to pending or ready', () => {
    expect(canTransition('needs-attention', 'pending')).toBe(true);
    expect(canTransition('needs-attention', 'ready')).toBe(true);
    expect(canTransition('needs-attention', 'synced')).toBe(false);
  });
});
