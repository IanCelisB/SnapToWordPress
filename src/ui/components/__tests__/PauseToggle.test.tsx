// src/ui/components/__tests__/PauseToggle.test.tsx

import { PauseToggle } from '../PauseToggle';

describe('PauseToggle', () => {
  it('exports a presentational component', () => {
    expect(typeof PauseToggle).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = PauseToggle.toString();
    expect(source).not.toMatch(/Sincronización pausada/);
    expect(source).not.toMatch(/Pausar/);
    expect(source).not.toMatch(/Reanudar/);
  });
});
