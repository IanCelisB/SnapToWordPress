// src/infra/secure-store.ts — typed wrapper over `expo-secure-store`.
//
// Three keys are owned by the app: `store_url`, `consumer_key`,
// `consumer_secret`. They are written via the credentials module
// (`src/services/credentials.ts`); this file only knows how to read and
// write individual keys and how to clear all three at once.
//
// The wrapper is intentionally NOT a class — it's a module of pure
// functions. The credentials module composes it.
//
// Security contract: this module NEVER logs a value. The test
// `__tests__/secure-store.test.ts` greps the file source for any
// `console.*` call to catch regressions.

import * as SecureStore from 'expo-secure-store';

export const SECURE_STORE_KEYS = {
  storeUrl: 'store_url',
  consumerKey: 'consumer_key',
  consumerSecret: 'consumer_secret',
} as const;

export type SecureStoreKey =
  (typeof SECURE_STORE_KEYS)[keyof typeof SECURE_STORE_KEYS];

export async function getItem(key: SecureStoreKey): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: SecureStoreKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: SecureStoreKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export async function clearAll(): Promise<void> {
  await Promise.all([
    deleteItem(SECURE_STORE_KEYS.storeUrl),
    deleteItem(SECURE_STORE_KEYS.consumerKey),
    deleteItem(SECURE_STORE_KEYS.consumerSecret),
  ]);
}
