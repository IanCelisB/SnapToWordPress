// src/ui/components/__tests__/ProgressLine.test.tsx

import { ProgressLine } from '../ProgressLine';

describe('ProgressLine', () => {
  it('exports a presentational component', () => {
    expect(typeof ProgressLine).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = ProgressLine.toString();
    expect(source).not.toMatch(/Subiendo producto/);
  });
});
