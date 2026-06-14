// src/infra/secure-store-web-bridge.ts — drop-in replacement for
// expo-secure-store's internal native bridge on web.
//
// The expo-secure-store package has two layers:
//   1. ExpoSecureStore (native bridge) — calls getValueWithKeyAsync etc.
//   2. SecureStore (JS API) — wraps the bridge with getItemAsync etc.
//
// On web, layer 1 exports `{}` (empty stub), so layer 2 crashes.
// This file provides a localStorage-backed implementation of layer 1
// so the full expo-secure-store module works on web without changes.

const PREFIX = '__etiquetador__';

const bridge = {
  async getValueWithKeyAsync(key: string): Promise<string | null> {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(`${PREFIX}${key}`);
    } catch {
      return null;
    }
  },

  async setValueWithKeyAsync(key: string, value: string): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(`${PREFIX}${key}`, value);
    } catch {
      // localStorage full or unavailable — no-op on web
    }
  },

  async deleteValueWithKeyAsync(key: string): Promise<void> {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(`${PREFIX}${key}`);
    } catch {
      // no-op
    }
  },

  async getAllKeysAsync(): Promise<string[]> {
    try {
      if (typeof localStorage === 'undefined') return [];
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          keys.push(k.slice(PREFIX.length));
        }
      }
      return keys;
    } catch {
      return [];
    }
  },
};

export default bridge;
