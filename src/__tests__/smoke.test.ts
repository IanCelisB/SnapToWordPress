// Smoke test — proves Jest is wired up correctly with the jest-expo preset.
// If this test runs, the test runner, ts-jest/babel transform, NativeWind
// transformIgnorePatterns, and the module alias (`@/`) are all healthy.

describe('smoke', () => {
  it('arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });

  it('async/await works', async () => {
    const value = await Promise.resolve(42);
    expect(value).toBe(42);
  });

  it('can import the error-presentation module', () => {
    // Use a relative import so this test works under any Jest preset
    // (ts-jest, jest-expo, babel-jest). The `@/` alias itself is exercised
    // by `jest.config.js`'s `moduleNameMapper` — which would break the
    // whole `npm test` run if it were misconfigured.
    const mod = require('../error-presentation');
    expect(typeof mod.presentError).toBe('function');
    expect(typeof mod.classifyError).toBe('function');
    expect(typeof mod.ERROR_CATALOG).toBe('object');
  });
});
