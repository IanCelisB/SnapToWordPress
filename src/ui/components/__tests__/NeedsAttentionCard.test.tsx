// src/ui/components/__tests__/NeedsAttentionCard.test.tsx

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { NeedsAttentionCard } from '../NeedsAttentionCard';

describe('NeedsAttentionCard', () => {
  it('exports a presentational component', () => {
    expect(typeof NeedsAttentionCard).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = NeedsAttentionCard.toString();
    expect(source).not.toMatch(/productos no se pudieron/);
    expect(source).not.toMatch(/Tocá para ver/);
  });
});
