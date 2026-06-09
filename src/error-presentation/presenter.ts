// Presenter — the ONLY entry point a screen / banner / dialog / toast uses.
//
// `presentError` accepts either:
//   - a raw `unknown` (an Error, a WooError, a string, anything) → classified
//     first via `classifyError`, then looked up in the catalog.
//   - a catalog `ErrorKey` directly.
//
// `params` carries per-key context (e.g. `field`/`reason` for
// `datos-invalidos`, `productId` for `imagen-faltante` / `precio-no-confirmado`).
//
// In `__DEV__` the raw error + correlationId is sent to the developer
// console for field debugging. NEVER interpolated into a user string.

import { ERROR_CATALOG } from './catalog';
import { classifyError } from './classifier';
import type { CatalogEntry, ErrorKey, PresentParams } from './types';

export function presentError(
  errOrKey: unknown,
  params?: PresentParams,
): CatalogEntry {
  const isKey =
    typeof errOrKey === 'string' && isCatalogKey(errOrKey);

  const { key, cause, correlationId } = isKey
    ? { key: errOrKey as ErrorKey, cause: undefined, correlationId: generateCorrelationId() }
    : classifyError(errOrKey);

  if (isDev()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[error-presentation] key=${key} cid=${correlationId}` +
        (cause instanceof Error ? ` cause=${cause.name}:${cause.message}` : ''),
    );
  }

  const base = ERROR_CATALOG[key];

  // Build a fresh entry so callers can't mutate the catalog.
  const entry: CatalogEntry = {
    title: base.title,
    message: base.message,
    severity: base.severity,
  };

  if (key === 'datos-invalidos' && params?.field) {
    entry.title = 'Revisá este campo';
    entry.message = describeValidation(params.field, params.reason);
  }

  if (
    (key === 'imagen-faltante' || key === 'precio-no-confirmado') &&
    base.action &&
    base.action.kind === 'edit-product' &&
    params?.productId
  ) {
    entry.action = { kind: 'edit-product', productId: params.productId };
  } else if (base.action) {
    entry.action = base.action;
  }

  return entry;
}

function isCatalogKey(value: string): value is ErrorKey {
  return value in ERROR_CATALOG;
}

function describeValidation(field: string, reason?: string): string {
  switch (reason) {
    case 'required':
      return `El campo ${field} es obligatorio.`;
    case 'not-integer':
      return `El campo ${field} tiene que ser un número entero.`;
    case 'must-be-positive':
      return `El campo ${field} tiene que ser mayor a cero.`;
    default:
      return `Revisá el campo ${field}.`;
  }
}

function generateCorrelationId(): string {
  const n = Math.floor(Math.random() * 36 ** 6);
  return n.toString(36).padStart(6, '0');
}

// `__DEV__` is a Metro/Expo build-time global. We guard access with a
// defensive check so the module is also testable under bare Node/Jest
// where the global is not injected.
function isDev(): boolean {
  // `globalThis as { __DEV__?: boolean }` is the safe way to read it
  // under `noImplicitAny` / `strict` without polluting the global scope.
  const g = globalThis as { __DEV__?: boolean };
  return g.__DEV__ === true;
}
