// src/sync/attempt-cap.ts — enforce the per-product attempt cap
// (WU-4 task 4.4 + Design §9).
//
// The orchestrator's spec for WU-4 pins the cap at 8 attempts per
// product per worker run. After the 8th transient failure, the
// worker moves the product to `needs-attention` and advances; the
// user must tap "Reintentar" to re-queue.
//
// Why 8 (not 5, not 10):
//   - The domain backoff schedule has 10 steps; using 8 keeps the
//     worst-case in-worker time for one product around 2–3 minutes
//     (sum of 1+2+4+8+16+32+60+60 ≈ 183s), which fits inside a
//     realistic foreground session.
//   - The cap is PER RUN, not per lifetime. A product that hits the
//     cap during one sync run is still re-queueable on the next
//     launch; the user's "Reintentar" clears the counter.
//
// The actual cap value lives in `MAX_ATTEMPTS_PER_PRODUCT`; tests can
// import the constant and assert on it.

/** Per-run attempt cap for a single product. */
export const MAX_ATTEMPTS_PER_PRODUCT = 8;

/**
 * Returns true when the worker has already attempted the product
 * `MAX_ATTEMPTS_PER_PRODUCT` times in the current run and should
 * give up on this run. `attemptInRun` is the count BEFORE the next
 * attempt; the FIRST attempt passes 0, the 8th passes 7, and the
 * 9th would pass 8 (which means "we have already failed 8 times,
 * stop now").
 */
export function hasExceededAttemptCap(attemptInRun: number): boolean {
  return attemptInRun >= MAX_ATTEMPTS_PER_PRODUCT;
}

/**
 * Returns true when the worker is about to start the FINAL allowed
 * attempt (i.e. the next failure will exceed the cap). Useful for
 * logging / progress UI.
 */
export function isFinalAttempt(attemptInRun: number): boolean {
  return attemptInRun === MAX_ATTEMPTS_PER_PRODUCT - 1;
}

/**
 * The classification key the worker surfaces when a product's run
 * has hit the cap. The presenter renders it as the
 * "N productos no se pudieron subir — tocá para ver" card; the
 * worker itself only needs to know which catalog key to emit.
 *
 * `needs-attention` is the row state in the products table; the
 * user-facing card uses the catalog key `sincronizacion-reintentable`
 * (or `sincronizacion-fallida` for terminal cases). Both are
 * defined in `src/error-presentation/catalog.ts` and surfaced via
 * `presentError(<key>)`.
 */
export const NEEDS_ATTENTION_CARD_KEY = 'sincronizacion-reintentable' as const;
export const FAILED_DEAD_CARD_KEY = 'sincronizacion-fallida' as const;
