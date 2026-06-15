// src/ui/screens/__tests__/sync.test.tsx
//
// We don't import `../sync` here — pulling it in drags the whole
// `expo-router` stack (and `react-native-screens/experimental`,
// which isn't installed in this Jest setup). Instead we read the
// source file as text and assert the contract is wired up.
//
// The runtime contract (defensive credentials check) is also
// covered by `src/sync/__tests__/queue-worker.test.ts` and the
// `sync-trigger.ts` test surface.

import * as fs from 'fs';
import * as path from 'path';
import { __resetSyncStoreForTest } from '../../../stores/syncStore';

const screenSource = fs.readFileSync(
  path.join(__dirname, '..', 'sync.tsx'),
  'utf-8',
);

// The global trigger is consulted by the screen at render time
// (via `globalThis.__etiquetadorSyncTrigger`). Set up a stub so
// the module side-effects of `__resetSyncStoreForTest` are safe.
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

describe('SyncScreen (source-level contract)', () => {
  it('does not embed raw Spanish strings in the JSX', () => {
    // Titles and labels must come from `Strings.*`, never inline.
    expect(screenSource).not.toMatch(/['"]Sincronización['"]/);
    expect(screenSource).not.toMatch(/['"]Pausar['"]/);
    expect(screenSource).not.toMatch(/['"]Falta vincular tu tienda['"]/);
  });

  it('reads hasCredentials on mount and exposes a disabled flag', () => {
    // The screen mounts and reads `hasCredentials()` once to drive
    // the calm notice + the primary-action disabled state.
    expect(screenSource).toMatch(/hasCredentials\(\)/);
    expect(screenSource).toMatch(/setCredentialsOk/);
    expect(screenSource).toMatch(/showNeedsCredentials/);
  });

  it('re-checks credentials at tap time (defense in depth)', () => {
    // Even if the user clears credentials between mount and tap,
    // we should not call `startManual`. The screen re-reads the
    // secure store on tap.
    expect(screenSource).toMatch(/await hasCredentials\(\)/);
  });

  it('renders the needs-credentials notice + CTA to settings', () => {
    expect(screenSource).toMatch(/sync\.needsCredentials/);
    expect(screenSource).toMatch(/sync\.needsCredentials\.action/);
    expect(screenSource).toMatch(/syncNeedsCredentialsTitle/);
    expect(screenSource).toMatch(/syncNeedsCredentialsHint/);
    expect(screenSource).toMatch(/syncNeedsCredentialsAction/);
    expect(screenSource).toMatch(/useRouter/);
    expect(screenSource).toMatch(/\/settings/);
  });
});
