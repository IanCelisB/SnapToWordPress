// src/ui/components/__tests__/SyncBanner.test.tsx

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SyncBanner } from '../SyncBanner';
import { useSyncStore } from '../../../stores/syncStore';
import { __resetSyncStoreForTest } from '../../../stores/syncStore';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function freshStore() {
  __resetSyncStoreForTest();
  return useSyncStore();
}

describe('SyncBanner', () => {
  afterEach(() => {
    __resetSyncStoreForTest();
  });

  it('exports a presentational component', () => {
    expect(typeof SyncBanner).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = SyncBanner.toString();
    expect(source).not.toMatch(/Sincronizando \d/);
    expect(source).not.toMatch(/necesitan atención/);
  });
});
