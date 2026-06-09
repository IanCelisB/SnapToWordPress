// src/infra/uuid.ts — UUIDv4 generator.
//
// In production, this delegates to `expo-crypto`'s `randomUUID`. In
// tests (and in environments where `expo-crypto` is mocked to a noop),
// it falls back to `globalThis.crypto.randomUUID`, which the
// `jest.setup.ts` polyfills from Node's `node:crypto`.
//
// Centralizing the generator keeps one place to swap implementations
// and one place to inject deterministic UUIDs in tests via
// `__setUuidForTest`.

import { randomUUID as expoRandomUUID } from 'expo-crypto';

let currentGenerator: () => string = () => {
  if (typeof expoRandomUUID === 'function') {
    return expoRandomUUID();
  }
  return globalThis.crypto.randomUUID();
};

export function uuid(): string {
  return currentGenerator();
}

export function setUuidForTest(fn: () => string): void {
  currentGenerator = fn;
}

export function resetUuid(): void {
  currentGenerator = () => {
    if (typeof expoRandomUUID === 'function') {
      return expoRandomUUID();
    }
    return globalThis.crypto.randomUUID();
  };
}
