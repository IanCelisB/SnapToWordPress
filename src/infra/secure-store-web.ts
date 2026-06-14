// src/infra/secure-store-web.ts — web polyfill for expo-secure-store.
//
// The expo-secure-store package ships an empty `ExpoSecureStore.web.js`
// stub (`export default {}`) — any call to getItemAsync / setItemAsync
// / deleteItemAsync throws at runtime on web. This file replaces it
// with a localStorage-backed implementation that exposes the same
// three async methods the credentials module actually uses.
//
// SECURITY: on web, localStorage is NOT encrypted — this is fine for
// dev/test (the intended use-case for the web target). Production
// deployments should use native builds with the real SecureStore.

const PREFIX = '__etiquetador__';

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`${PREFIX}${key}`);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${PREFIX}${key}`, value);
  } catch {
    // localStorage full or unavailable — no-op on web
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // no-op
  }
}
