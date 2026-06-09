// src/ui/screens/__tests__/sync.test.tsx

import React from 'react';
import SyncScreen from '../sync';
import { useSyncStore } from '../../../stores/syncStore';
import { __resetSyncStoreForTest } from '../../../stores/syncStore';

// Mock the global trigger
const mockStartManual = jest.fn().mockResolvedValue({ succeeded: 2, failed: 0, paused: false });
const mockIsPaused = jest.fn().mockResolvedValue(false);
const mockSetPaused = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  __resetSyncStoreForTest();
  globalThis.__etiquetadorSyncTrigger = {
    startManual: mockStartManual,
    isPaused: mockIsPaused,
    setPaused: mockSetPaused,
  };
});

afterEach(() => {
  globalThis.__etiquetadorSyncTrigger = undefined;
  __resetSyncStoreForTest();
  jest.clearAllMocks();
});

describe('SyncScreen', () => {
  it('exports a presentational component', () => {
    expect(typeof SyncScreen).toBe('function');
  });

  it('does not contain raw Spanish strings in source', () => {
    const source = SyncScreen.toString();
    expect(source).not.toMatch(/['"]Sincronización['"]/);
    expect(source).not.toMatch(/['"]Pausar['"]/);
  });
});
