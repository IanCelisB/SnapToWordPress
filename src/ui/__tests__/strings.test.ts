// src/ui/__tests__/strings.test.ts — no-jargon lint on the UI strings
// catalog (WU-3).
//
// The error-presentation catalog has its own lint; the UI strings
// catalog is the SECOND place we keep user-facing Spanish, and the
// same calm-tone / no-jargon rules apply. If this test fails, you
// either (a) introduced jargon in a button label / hint / title, or
// (b) used digits in a UI string (which the CI grep would also catch,
// this is a first-line check at unit-test time).

import { Strings } from '../strings';

const FORBIDDEN_TOKENS: ReadonlyArray<string> = [
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
];

const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\b\d{3}\b/, // 401, 404, 500 — and also any 3+ digit run we want to avoid in UI
  /!/, // calm tone
];

describe('ui strings catalog', () => {
  const keys = Object.keys(Strings) as ReadonlyArray<keyof typeof Strings>;

  it('has at least one string defined', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('entry "%s" is a non-empty string', (key) => {
    const value = Strings[key];
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  it.each(keys)('entry "%s" has no forbidden jargon tokens', (key) => {
    const value = Strings[key];
    for (const token of FORBIDDEN_TOKENS) {
      expect(value.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it.each(keys)('entry "%s" has no forbidden regex patterns', (key) => {
    const value = Strings[key];
    for (const re of FORBIDDEN_PATTERNS) {
      expect(value).not.toMatch(re);
    }
  });

  it.each(keys)('entry "%s" is 12 words or fewer', (key) => {
    const value = Strings[key];
    const words = value.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(12);
  });
});
