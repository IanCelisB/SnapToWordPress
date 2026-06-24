// src/ui/components/__tests__/SyncBanner.test.tsx

import { SyncBanner } from '../SyncBanner';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('SyncBanner', () => {
  it('exports a presentational component', () => {
    expect(typeof SyncBanner).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = SyncBanner.toString();
    expect(source).not.toMatch(/Sincronizando \d/);
    expect(source).not.toMatch(/necesitan atención/);
  });
});
