// src/services/credentials/credentials.ts — credential validation,
// persistence, and the "no logs of secrets" guard.
//
// Implements the credentials flow from Design §5: validate against
// the live store, then persist on success.
//
// Persistence strategy: dual-write to expo-secure-store (primary) and
// AsyncStorage (fallback). This ensures credentials survive in environments
// where secure-store doesn't persist (Expo Go, dev mode) while keeping
// the encrypted storage as the primary source.

import AsyncStorage from '@react-native-async-storage/async-storage';
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

const ASYNC_STORAGE_KEYS = {
  storeUrl: '@wc/store_url',
  consumerKey: '@wc/consumer_key',
  consumerSecret: '@wc/consumer_secret',
} as const;

export async function saveCredentials(creds: WCCredentials): Promise<void> {
  // Primary: secure store (encrypted, persists on real devices)
  await Promise.all([
    setItem(SECURE_STORE_KEYS.storeUrl, creds.baseUrl),
    setItem(SECURE_STORE_KEYS.consumerKey, creds.key),
    setItem(SECURE_STORE_KEYS.consumerSecret, creds.secret),
  ]);

  // Fallback: AsyncStorage (for Expo Go / dev environments)
  // Non-blocking — if AsyncStorage fails, secure store is still valid
  try {
    await Promise.all([
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.storeUrl, creds.baseUrl),
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.consumerKey, creds.key),
      AsyncStorage.setItem(ASYNC_STORAGE_KEYS.consumerSecret, creds.secret),
    ]);
  } catch {
    // AsyncStorage unavailable (test env, web, etc.) — secure store is enough
  }
}

export async function loadCredentials(): Promise<WCCredentials | null> {
  // Try secure store first
  const [url, key, secret] = await Promise.all([
    getItem(SECURE_STORE_KEYS.storeUrl),
    getItem(SECURE_STORE_KEYS.consumerKey),
    getItem(SECURE_STORE_KEYS.consumerSecret),
  ]);

  if (url && key && secret) {
    return { baseUrl: url, key, secret };
  }

  // Fallback: AsyncStorage (for Expo Go / dev environments)
  try {
    const [aUrl, aKey, aSecret] = await Promise.all([
      AsyncStorage.getItem(ASYNC_STORAGE_KEYS.storeUrl),
      AsyncStorage.getItem(ASYNC_STORAGE_KEYS.consumerKey),
      AsyncStorage.getItem(ASYNC_STORAGE_KEYS.consumerSecret),
    ]);

    if (aUrl && aKey && aSecret) {
      // Re-populate secure store for next time
      await Promise.all([
        setItem(SECURE_STORE_KEYS.storeUrl, aUrl),
        setItem(SECURE_STORE_KEYS.consumerKey, aKey),
        setItem(SECURE_STORE_KEYS.consumerSecret, aSecret),
      ]);
      return { baseUrl: aUrl, key: aKey, secret: aSecret };
    }
  } catch {
    // AsyncStorage unavailable — rely on secure store only
  }

  return null;
}

export async function clearCredentials(): Promise<void> {
  await Promise.all([
    deleteItem(SECURE_STORE_KEYS.storeUrl),
    deleteItem(SECURE_STORE_KEYS.consumerKey),
    deleteItem(SECURE_STORE_KEYS.consumerSecret),
  ]);
  try {
    await Promise.all([
      AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.storeUrl),
      AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.consumerKey),
      AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.consumerSecret),
    ]);
  } catch {
    // AsyncStorage unavailable — secure store cleared is enough
  }
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
