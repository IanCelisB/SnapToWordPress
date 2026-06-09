// src/sync/state-machine.ts — the sync worker's view of the product
// state transitions (Design §6 + WU-4 task 4.1).
//
// The product status state machine in `src/domain/status.ts` is the
// AUTHORITATIVE list of allowed transitions. This module wraps it with
// a SYNC-FOCUSED API: instead of asking "can I go from `pending` to
// `needs-attention`?" we ask "what is the next legal status for this
// product right now, given a sync outcome?".
//
// The worker is a consumer, not a writer, of these transitions: the
// review queue and the orphan sweeper also depend on `canTransition`
// behaving the same way. Keeping this thin layer in `src/sync/` makes
// the worker's intent (move a product to its NEXT legal state) obvious
// at the call site without forcing every reader to also import the
// domain helper.

import { canTransition } from '../domain/status';
import type { ProductStatus } from '../domain/types';

/**
 * The four outcomes the worker can drive a product to, after one or
 * more attempts on the current claim.
 */
export type SyncOutcome =
  | 'uploading-media'   // claimed, about to POST media
  | 'creating-product'  // all media uploaded, POST /products in flight
  | 'synced'            // 2xx on POST /products → store wc_product_id
  | 'pending-retry'     // transient failure within the per-run cap
  | 'needs-attention'   // transient failure AT or beyond the cap
  | 'auth-blocked';     // 401/403 — pause the queue

/**
 * Map a `SyncOutcome` to the next legal `ProductStatus`. Returns
 * `null` if the transition is not legal from the current state (in
 * which case the worker logs and aborts — a programmer error, never
 * a user-facing one). Returns the SAME status when no transition
 * is required (e.g. the row is already in `syncing` and the
 * `uploading-media` outcome is reported again).
 */
export function nextStatusFor(
  current: ProductStatus,
  outcome: SyncOutcome,
): ProductStatus | null {
  switch (outcome) {
    case 'uploading-media':
    case 'creating-product':
      if (current === 'syncing') return current; // already there
      return transitionIfAllowed(current, 'syncing');
    case 'synced':
      return transitionIfAllowed(current, 'synced');
    case 'pending-retry':
      // The worker re-queues a transient failure back to its origin
      // state. A `syncing` row goes back to `pending`; a `ready` row
      // (the user has confirmed the price) stays `ready`.
      if (current === 'syncing') return transitionIfAllowed(current, 'pending');
      if (current === 'ready') return current;
      return transitionIfAllowed(current, 'pending');
    case 'needs-attention':
      return transitionIfAllowed(current, 'needs-attention');
    case 'auth-blocked':
      // Auth block: we don't change the product's status (the worker
      // pauses the queue and surfaces a card). But the engine still
      // wants a deterministic answer.
      return current;
  }
}

/**
 * Convenience: assert a transition is legal. Throws a typed error
 * (not a `WooError` — this is a programmer error, not a remote one)
 * if the move is not allowed. The worker uses this in tests; in
 * production it relies on `nextStatusFor` returning `null`.
 */
export function assertTransition(
  from: ProductStatus,
  to: ProductStatus,
): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export class IllegalTransitionError extends Error {
  readonly from: ProductStatus;
  readonly to: ProductStatus;
  constructor(from: ProductStatus, to: ProductStatus) {
    super(`Illegal product-status transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
    this.from = from;
    this.to = to;
  }
}

function transitionIfAllowed(
  from: ProductStatus,
  to: ProductStatus,
): ProductStatus | null {
  return canTransition(from, to) ? to : null;
}
