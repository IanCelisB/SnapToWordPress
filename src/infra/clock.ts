// src/infra/clock.ts — injectable clock for tests.
//
// The clock is a single function `now(): number` that returns the current
// epoch in milliseconds. Production callers import `now` directly. Tests
// can swap the implementation via `__setClockForTest` to make timestamps
// deterministic.
//
// Why: the worker, the backoff schedule, and the sync_attempts table all
// depend on the current time. Injecting a clock lets us assert on exact
// timestamps and avoids the brittleness of `jest.useFakeTimers()` race
// conditions.

let currentClock: () => number = () => Date.now();

export function now(): number {
  return currentClock();
}

export function setClock(fn: () => number): void {
  currentClock = fn;
}

export function resetClock(): void {
  currentClock = () => Date.now();
}
