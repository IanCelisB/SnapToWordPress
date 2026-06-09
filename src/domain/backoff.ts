// src/domain/backoff.ts — pure exponential backoff schedule.
//
// Per Design §9: the schedule is `1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s`.
// The schedule is CAPPED at 60s. The worker applies the cap of 5 transient
// attempts per run, so the schedule indexes 0..4 are the ones actually used.
//
// `backoff(attempt)` is pure: same input → same output. This makes it easy
// to test in isolation and easy to reason about when reading worker code.

const SCHEDULE_MS: ReadonlyArray<number> = [
  1_000,
  2_000,
  4_000,
  8_000,
  16_000,
  32_000,
  60_000,
  60_000,
  60_000,
  60_000,
];

/** Returns the backoff delay (in ms) for the given attempt index. */
export function backoff(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) {
    return SCHEDULE_MS[0] ?? 1_000;
  }
  const index = Math.min(Math.floor(attempt), SCHEDULE_MS.length - 1);
  return SCHEDULE_MS[index] ?? 60_000;
}

/** Returns the full schedule. Useful for snapshot tests. */
export function schedule(): ReadonlyArray<number> {
  return SCHEDULE_MS;
}

/** Returns the per-run attempt cap. */
export const MAX_ATTEMPTS_PER_RUN = 5;

/** Returns true if the attempt has exceeded the per-run cap. */
export function hasExceededCap(attemptInRun: number): boolean {
  return attemptInRun >= MAX_ATTEMPTS_PER_RUN;
}
