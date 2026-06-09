// src/services/credentials/credentials.ts — credential validation,
// persistence, and the "no logs of secrets" guard.
//
// Implements the credentials flow from Design §5: validate against
// the live store, then persist on success.

import {
  SECURE_STORE_KEYS,
  getItem,
  setItem,
  deleteItem,
} from '../../infra/secure-store';
import { canonicalizeBaseUrl, createWooClient } from '../woocommerce/client';
import { createHttpClient } from '../../infra/http-client';

export type WCCredentials = {
  baseUrl: string;
  key: string;
  secret: string;
};

export type ValidationResult = {
  ok: boolean;
  normalizedUrl?: string;
  classification?: string;
};

export async function saveCredentials(creds: WCCredentials): Promise<void> {
  await Promise.all([
    setItem(SECURE_STORE_KEYS.storeUrl, creds.baseUrl),
    setItem(SECURE_STORE_KEYS.consumerKey, creds.key),
    setItem(SECURE_STORE_KEYS.consumerSecret, creds.secret),
  ]);
}

export async function loadCredentials(): Promise<WCCredentials | null> {
  const [url, key, secret] = await Promise.all([
    getItem(SECURE_STORE_KEYS.storeUrl),
    getItem(SECURE_STORE_KEYS.consumerKey),
    getItem(SECURE_STORE_KEYS.consumerSecret),
  ]);
  if (!url || !key || !secret) return null;
  return { baseUrl: url, key, secret };
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    deleteItem(SECURE_STORE_KEYS.storeUrl),
    deleteItem(SECURE_STORE_KEYS.consumerKey),
    deleteItem(SECURE_STORE_KEYS.consumerSecret),
  ]);
}

export async function validateAndSave(
  creds: WCCredentials,
): Promise<ValidationResult> {
  const normalizedUrl = canonicalizeBaseUrl(creds.baseUrl);
  const http = createHttpClient();
  const client = createWooClient(
    { ...creds, baseUrl: normalizedUrl },
    http,
  );
  const result = await client.validate();
  if (result.ok) {
    await saveCredentials({ ...creds, baseUrl: normalizedUrl });
    return { ok: true, normalizedUrl };
  }
  // Map the WC validation reason to a classification key.
  let classification: string;
  switch (result.reason) {
    case 'invalid':
      classification = 'credenciales-invalidas';
      break;
    case 'not-a-store':
      classification = 'tienda-no-accesible';
      break;
    case 'unreachable':
    default:
      classification = 'sin-conexion';
      break;
  }
  return { ok: false, normalizedUrl, classification };
}
