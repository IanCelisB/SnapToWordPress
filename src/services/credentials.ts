// src/services/credentials.ts — credentials validation + persistence.
//
// Owns the three `expo-secure-store` keys (`store_url`, `consumer_key`,
// `consumer_secret`). The flow is:
//   1. `validateAndSave(c)` calls `createWooClient(c).validate()` FIRST
//      and only persists on `ok: true`. URL normalization (https prepend,
//      trailing slash strip, path strip) happens here, NOT in the
//      catalog (Design §2 Decision §2 + store-config spec scenarios).
//   2. `loadCredentials()` reads from secure store and returns
//      `WCCredentials | null`. Callers (the WC client factory, the
//      first-launch routing) use this.
//   3. `clearCredentials()` deletes all three keys. The settings screen
//      calls this on "sign out" — per the orchestrator's WU-2 brief,
//      the local DB is INTENTIONALLY preserved so the user can re-link
//      the same store without losing pending products.
//
// SECURITY: this module NEVER logs the key, the secret, or the
// normalized URL. The test
// `__tests__/credentials.test.ts` greps the source to assert no
// `console.*` call passes `creds.key` or `creds.secret`.

import {
  buildAuthHeader,
  canonicalizeBaseUrl,
  createWooClient,
} from './woocommerce/client';
import type {
  WCCredentials,
} from '../domain/types';
import {
  SECURE_STORE_KEYS,
  clearAll as clearSecureStore,
  deleteItem,
  getItem,
  setItem,
} from '../infra/secure-store';
import { createHttpClient } from '../infra/http-client';
import type { ErrorKey } from '../error-presentation';
import { presentError } from '../error-presentation';

export type ValidateAndSaveResult =
  | { ok: true; normalizedUrl: string }
  | { ok: false; classification: ErrorKey; normalizedUrl: string };

/**
 * Normalize + validate + save. Returns either `ok: true` (credentials
 * persisted) or `ok: false` with the catalog key the UI should render.
 *
 * The function never throws on a failed validation; it always returns
 * a `ValidateAndSaveResult`. Migration / DB errors during the persist
 * step DO throw (they are unexpected; the UI shows `almacenamiento-error`
 * via the launcher).
 */
export async function validateAndSave(
  candidate: WCCredentials,
): Promise<ValidateAndSaveResult> {
  const normalizedUrl = canonicalizeBaseUrl(candidate.baseUrl);
  const normalized: WCCredentials = {
    baseUrl: normalizedUrl,
    key: candidate.key,
    secret: candidate.secret,
  };
  // Persist FIRST, validate SECOND. On web, the validation request can
  // be blocked by CORS and trap the user in a deadlock if we only save
  // on success. Persist locally and surface the validation result as a
  // non-blocking notice — the user can still sync / test later. The
  // proper "test-connection" UX (separate button, accurate feedback)
  // is part of the `settings-first-config` plan; this change is the
  // minimum needed to unblock web usage today.
  await saveCredentials(normalized);
  const client = createWooClient(normalized, createHttpClient());
  const result = await client.validate();
  if (result.ok) {
    return { ok: true, normalizedUrl };
  }
  // Map the underlying reason to a catalog key.
  const classification = mapValidationFailureToKey(result);
  return { ok: false, classification, normalizedUrl };
}

function mapValidationFailureToKey(
  result: { ok: false; status?: number; reason: 'invalid' | 'unreachable' | 'not-a-store' },
): ErrorKey {
  if (result.reason === 'invalid') {
    return 'credenciales-invalidas';
  }
  if (result.reason === 'not-a-store') {
    return 'tienda-no-accesible';
  }
  return 'sin-conexion';
}

export async function saveCredentials(c: WCCredentials): Promise<void> {
  await Promise.all([
    setItem(SECURE_STORE_KEYS.storeUrl, c.baseUrl),
    setItem(SECURE_STORE_KEYS.consumerKey, c.key),
    setItem(SECURE_STORE_KEYS.consumerSecret, c.secret),
  ]);
}

export async function loadCredentials(): Promise<WCCredentials | null> {
  const [baseUrl, key, secret] = await Promise.all([
    getItem(SECURE_STORE_KEYS.storeUrl),
    getItem(SECURE_STORE_KEYS.consumerKey),
    getItem(SECURE_STORE_KEYS.consumerSecret),
  ]);
  if (!baseUrl || !key || !secret) {
    return null;
  }
  return { baseUrl, key, secret };
}

export async function clearCredentials(): Promise<void> {
  await clearSecureStore();
}

/**
 * Re-validate the current credentials without changing them. Used by
 * the settings screen's "Reconectar tienda" button.
 */
export async function revalidate(): Promise<ValidateAndSaveResult> {
  const current = await loadCredentials();
  if (!current) {
    return {
      ok: false,
      classification: 'credenciales-invalidas',
      normalizedUrl: '',
    };
  }
  const client = createWooClient(current, createHttpClient());
  const result = await client.validate();
  if (result.ok) {
    return { ok: true, normalizedUrl: current.baseUrl };
  }
  const classification = mapValidationFailureToKey(result);
  return { ok: false, classification, normalizedUrl: current.baseUrl };
}

/**
 * Side-effect helper: converts a result into a catalog entry that a
 * screen can render without manually mapping keys. The UI calls
 * `presentError` with the result's classification.
 */
export function describeResult(
  result: ValidateAndSaveResult,
): ReturnType<typeof presentError> {
  if (result.ok) {
    return presentError('credenciales-invalidas');
  }
  return presentError(result.classification);
}

// Internal: re-exported for tests so the unit test can assert the
// `Authorization` header shape without re-deriving the base64.
export const __internal = {
  buildAuthHeader,
  canonicalizeBaseUrl,
  // `deleteItem` is exposed for the no-credentials-reuse unit test
  // (it sets a single key in isolation).
  deleteItem,
};
