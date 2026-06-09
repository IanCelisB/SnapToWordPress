// src/domain/status.ts — the product-status state machine.
//
// The state machine is documented in Design §6. The transitions live in
// a single `canTransition` function so the worker (WU-4), the review
// queue (WU-3), and the tests can all share one source of truth.

import type { ProductStatus } from './types';

/**
 * Allowed transitions. Keys = FROM state; values = set of allowed TO states.
 *
 * `synced` is terminal in MVP. The only way back from `synced` is the
 * user explicitly tapping "delete" in the review queue, which removes
 * the row entirely (not a status transition).
 */
const TRANSITIONS: Readonly<Record<ProductStatus, ReadonlySet<ProductStatus>>> = {
  pending: new Set<ProductStatus>(['ready', 'syncing', 'failed', 'needs-attention']),
  ready: new Set<ProductStatus>(['syncing', 'pending', 'failed', 'needs-attention']),
  syncing: new Set<ProductStatus>(['synced', 'pending', 'ready', 'failed', 'needs-attention']),
  synced: new Set<ProductStatus>(),
  failed: new Set<ProductStatus>(['pending', 'ready', 'needs-attention']),
  'needs-attention': new Set<ProductStatus>(['pending', 'ready', 'syncing']),
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/** Returns the set of legal next states. Useful for UI tests. */
export function nextStates(from: ProductStatus): ReadonlySet<ProductStatus> {
  return TRANSITIONS[from];
}

/** A row is "in flight" while the worker owns it. */
export function isInFlight(status: ProductStatus): boolean {
  return status === 'syncing';
}

/** A row is "final" — the worker should not auto-retry it. */
export function isFinal(status: ProductStatus): boolean {
  return status === 'synced';
}

/** A row is "recoverable" — the user can re-queue it. */
export function isRecoverable(status: ProductStatus): boolean {
  return status === 'needs-attention' || status === 'failed';
}
