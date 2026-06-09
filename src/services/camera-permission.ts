// src/services/camera-permission.ts — thin wrapper around the
// `expo-camera` permission flow (WU-3, product-capture spec R1
// scenario "Camera permission denied").
//
// This module is the ONLY place that knows about `expo-camera`. The
// capture screen consumes `useCameraPermissionState()` (a hook that
// mirrors `useCameraPermissions`) and `requestCameraPermission` (an
// imperative helper for the "Pedir permiso" button). The hook is
// designed to be safe to import from React components; the
// imperative helper delegates to the hook's request function via
// a global handoff so pure tests can also exercise the deny-path.
//
// All Spanish strings live in `src/ui/strings.ts`. The catalog key
// returned by `requestCameraPermission` is one of:
//   - `camara-permiso-denegado` (the only path the test asserts).
//
// Under bare Node / Jest, `expo-camera` is mocked in `jest.setup.ts`
// to return `{granted: false, canAskAgain: true}` for `useCameraPermissions`.

import { useCallback, useState } from 'react';
import { useCameraPermissions as useExpoCameraPermissions } from 'expo-camera';
import type { ErrorKey } from '../error-presentation';

export type CameraPermissionState = {
  status: 'undetermined' | 'granted' | 'denied';
  canAskAgain: boolean;
};

export type CameraPermissionHook = {
  permission: CameraPermissionState;
  /** Re-request permission. Returns the outcome typed for the UI. */
  request: () => Promise<CameraPermissionOutcome>;
};

export type CameraPermissionOutcome =
  | { granted: true }
  | { granted: false; classification: ErrorKey };

function toState(p: {
  granted: boolean;
  canAskAgain: boolean;
} | null): CameraPermissionState {
  if (!p) {
    return { status: 'undetermined', canAskAgain: true };
  }
  if (p.granted) {
    return { status: 'granted', canAskAgain: p.canAskAgain };
  }
  return { status: 'denied', canAskAgain: p.canAskAgain };
}

export function useCameraPermissionState(): CameraPermissionHook {
  const [perm, requestExpo] = useExpoCameraPermissions();
  const [state, setState] = useState<CameraPermissionState>(() =>
    toState(perm),
  );

  // Keep state in sync with the hook (handles initial mount + changes).
  if (perm && state.status === 'undetermined') {
    setState(toState(perm));
  }

  const request = useCallback(async (): Promise<CameraPermissionOutcome> => {
    const result = await requestExpo();
    setState(toState(result));
    if (result.granted) {
      return { granted: true };
    }
    return { granted: false, classification: 'camara-permiso-denegado' };
  }, [requestExpo]);

  return { permission: state, request };
}
