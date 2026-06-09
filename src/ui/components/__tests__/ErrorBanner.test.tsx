// src/ui/components/__tests__/ErrorBanner.test.tsx

import { ErrorBanner } from '../ErrorBanner';

describe('ErrorBanner', () => {
  it('exports a presentational component', () => {
    expect(typeof ErrorBanner).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = ErrorBanner.toString();
    expect(source).not.toMatch(/No pudimos conectar/);
    expect(source).not.toMatch(/Sin conexión/);
  });
});
