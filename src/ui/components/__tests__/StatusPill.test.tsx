// src/ui/components/__tests__/StatusPill.test.tsx

import { StatusPill } from '../StatusPill';
import type { ProductStatus } from '../../../domain/types';

describe('StatusPill', () => {
  it('exports a presentational component', () => {
    expect(typeof StatusPill).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = StatusPill.toString();
    expect(source).not.toMatch(/Pendiente/);
    expect(source).not.toMatch(/Listo/);
    expect(source).not.toMatch(/Sincronizando/);
    expect(source).not.toMatch(/Sincronizado/);
    expect(source).not.toMatch(/Error/);
    expect(source).not.toMatch(/Necesita atención/);
  });

  const statuses: ProductStatus[] = [
    'pending',
    'ready',
    'syncing',
    'synced',
    'failed',
    'needs-attention',
  ];

  statuses.forEach((status) => {
    it(`renders for status "${status}"`, () => {
      const result = StatusPill({ status });
      expect(result).toBeTruthy();
    });
  });
});
