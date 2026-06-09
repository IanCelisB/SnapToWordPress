// src/sync/backoff.ts — wire `src/domain/backoff.ts` into the worker
// (WU-4 task 4.3 + Design §9).
//
// The domain backoff is a pure `attempt → ms` curve. The worker adds:
//   - jitter (±20%) so a fleet of devices that hit the same 5xx at
//     the same instant does NOT retry in lockstep (per
//     woocommerce-sync spec R4 — "exponential backoff" + "respect
//     the store's rate limits"),
//   - a `429`-aware override: the server's `Retry-After` (seconds) is
//     always honored first if it is longer than the curve value.
//
// The curve itself (`1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s`,
// capped at 60s) lives in `src/domain/backoff.ts`; this module is the
// jitter + 429 adapter the worker calls.

import { backoff as domainBackoff } from '../domain/backoff';

/** Default jitter factor (±20%). */
export const DEFAULT_JITTER = 0.2;

export type BackoffOptions = {
  /** Random source for the jitter; defaults to `Math.random`. */
  random?: () => number;
  /** Override the jitter envelope (0..1). 0 disables jitter. */
  jitter?: number;
};

/**
 * Returns the next backoff delay in milliseconds for the given
 * attempt index, with the configured jitter applied.
 *
 * `attempt` 0 → ~1s, 1 → ~2s, … 5 → ~32s, 6+ → ~60s. Jitter widens
 * each value by up to ±`jitter` (default 20%).
 */
export function nextBackoffMs(
  attempt: number,
  opts: BackoffOptions = {},
): number {
  const base = domainBackoff(attempt);
  const jitter = clamp(opts.jitter ?? DEFAULT_JITTER, 0, 1);
  if (jitter === 0) return base;
  const rand = opts.random ?? Math.random;
  // Symmetric: pick a multiplier in [1-jitter, 1+jitter].
  const factor = 1 - jitter + 2 * jitter * rand();
  return Math.max(0, Math.round(base * factor));
}

/**
 * On a 429, the server's `Retry-After` header is the SOURCE OF TRUTH.
 * The exponential curve is a FALLBACK. We honor the longer of the two
 * so a tight cluster of `429`s never causes the worker to retry
 * earlier than the store requested.
 *
 * `retryAfterMs` may be `null` if the server did not send the header
 * — in that case the curve wins.
 */
export function nextBackoffMsWithRetryAfter(
  attempt: number,
  retryAfterMs: number | null,
  opts: BackoffOptions = {},
): number {
  const curve = nextBackoffMs(attempt, opts);
  if (retryAfterMs === null) return curve;
  return Math.max(curve, retryAfterMs);
}

/**
 * Parse a `Retry-After` header value (in seconds, per the HTTP spec)
 * to milliseconds. Returns `null` if the value is missing or
 * unparseable. The WP REST API emits this header in seconds.
 */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1_000);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
