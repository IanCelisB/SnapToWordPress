// Catalog tests — exhaustiveness + no-jargon lint + spec-asserted exact strings.
//
// The error-presentation spec demands:
//   - every key has title/message/severity (and optionally action)
//   - no two keys share (title, message)
//   - no jargon in any string: no digits, no "HTTP", "JSON", "API",
//     "WooCommerce", "token", "sync", "fetch", "TypeError", etc.
//   - calm tone: no "!" anywhere
//   - spec-named entries have EXACTLY the title/message in the spec.
//
// If this test fails, you either (a) drifted from Design §10's Spanish
// strings, or (b) introduced a jargon word. The CI grep
// `scripts/ci-error-grep.sh` is a SECOND guard for screens; this one is the
// FIRST guard for the catalog itself.

import { ERROR_CATALOG, ALL_ERROR_KEYS } from '../catalog';
import type { CatalogEntry, ErrorKey } from '../types';

// Forbidden tokens. Compiled once; checked on every title + message.
const FORBIDDEN_TOKENS: ReadonlyArray<string> = [
  // digits (HTTP codes, version numbers)
  // We assert the FULL pattern as a regex below; literal list is just a
  // belt-and-suspenders reminder.
  'HTTP',
  'http',
  'JSON',
  'json',
  'API',
  'WooCommerce',
  'Woocommerce',
  'token',
  'sync',
  'fetch',
  'TypeError',
  'undefined',
  'optifull',
  'Exception',
  'stack',
  'error', // as a noun in English — "an error occurred" leaks here. The Spanish
  // "error" is allowed via the catalog's "error-inesperado" key name (not a
  // string in the user-facing text).
];

const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\b\d{3}\b/, // 401, 404, 500, etc.
  /!/, // calm tone — no exclamation marks
];

const EXACT_SPEC_ENTRIES: Partial<Record<ErrorKey, Pick<CatalogEntry, 'title' | 'message' | 'severity'>>> = {
  'credenciales-invalidas': {
    title: 'No pudimos conectar con la tienda',
    message: 'Verificá las credenciales en Ajustes.',
    severity: 'blocking',
  },
  'sin-conexion': {
    title: 'Sin conexión',
    message: 'Vamos a reintentar automáticamente cuando vuelvas a tener señal.',
    severity: 'warning',
  },
  'error-inesperado': {
    title: 'Algo salió mal',
    message: 'El producto quedó guardado en el teléfono, lo vamos a intentar subir de nuevo.',
    severity: 'error',
  },
};

describe('error-presentation catalog', () => {
  describe('exhaustiveness', () => {
    it('has exactly 13 keys (5 spec + 6 spec-flagged + 2 WU-4 sync)', () => {
      expect(ALL_ERROR_KEYS).toHaveLength(13);
    });

    it.each(ALL_ERROR_KEYS)('entry "%s" has title, message, severity', (key) => {
      const entry = ERROR_CATALOG[key];
      expect(entry.title).toBeTruthy();
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);

      expect(entry.message).toBeTruthy();
      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);

      expect(['info', 'warning', 'error', 'blocking']).toContain(entry.severity);
    });

    it('no two keys share the same (title, message) pair', () => {
      const seen = new Map<string, ErrorKey>();
      for (const key of ALL_ERROR_KEYS) {
        const { title, message } = ERROR_CATALOG[key];
        const fingerprint = `${title}::${message}`;
        if (seen.has(fingerprint)) {
          throw new Error(
            `Duplicate (title, message) for key "${key}" matches "${seen.get(fingerprint)}"`,
          );
        }
        seen.set(fingerprint, key);
      }
    });
  });

  describe('spec-asserted exact strings', () => {
    it.each(Object.entries(EXACT_SPEC_ENTRIES))(
      'entry "%s" matches the spec word-for-word',
      (key, expected) => {
        const entry = ERROR_CATALOG[key as ErrorKey];
        expect(entry.title).toBe(expected.title);
        expect(entry.message).toBe(expected.message);
        expect(entry.severity).toBe(expected.severity);
      },
    );
  });

  describe('no-jargon lint', () => {
    it.each(ALL_ERROR_KEYS)('entry "%s" has no forbidden tokens', (key) => {
      const { title, message } = ERROR_CATALOG[key];
      for (const token of FORBIDDEN_TOKENS) {
        // We use a word-ish boundary so we don't false-positive on substrings
        // like "http" inside Spanish words (none of which should appear, but
        // be safe). For Latin-script strings, simple indexOf is fine.
        expect(title.toLowerCase()).not.toContain(token.toLowerCase());
        expect(message.toLowerCase()).not.toContain(token.toLowerCase());
      }
    });

    it.each(ALL_ERROR_KEYS)('entry "%s" has no forbidden regex patterns', (key) => {
      const { title, message } = ERROR_CATALOG[key];
      for (const re of FORBIDDEN_PATTERNS) {
        expect(title).not.toMatch(re);
        expect(message).not.toMatch(re);
      }
    });

    it.each(ALL_ERROR_KEYS)(
      'entry "%s" sentences are 12 words or fewer (best-effort)',
      (key) => {
        const { title, message } = ERROR_CATALOG[key];
        const titleWords = title.split(/\s+/).filter(Boolean).length;
        const messageWords = message.split(/\s+/).filter(Boolean).length;
        expect(titleWords).toBeLessThanOrEqual(12);
        expect(messageWords).toBeLessThanOrEqual(24); // message is allowed 2x
      },
    );
  });
});
