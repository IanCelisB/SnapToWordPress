// src/services/camera-permission.ts — thin wrapper around the
// `expo-image-picker` permission flow.
//
// Why image-picker and not expo-camera:
//   - The capture screen uses `expo-image-picker`'s `launchCameraAsync`
//     to open the native camera, NOT `expo-camera`'s `CameraView`.
//   - `launchCameraAsync` triggers the system permission prompt
//     automatically when needed.
//   - Using image-picker's permission API keeps the runtime surface
//     to ONE native module (image-picker) instead of two, which is
//     what was causing the silent no-op on Android before.
//   - The capture screen consumes `useCameraPermissionState()` (a
//     hook that mirrors `getCameraPermissionsAsync` /
//     `requestCameraPermissionsAsync`) and `requestCameraPermission`.
//   - All Spanish strings live in `src/ui/strings.ts`. The catalog key
//     returned is `camara-permiso-denegado`.

import { useCallback, useState } from 'react';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
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
  status?: 'granted' | 'denied' | 'undetermined' | 'never_ask_again';
  granted?: boolean;
  canAskAgain?: boolean;
} | null): CameraPermissionState {
  if (!p) {
    return { status: 'undetermined', canAskAgain: true };
  }
  // image-picker returns `granted` boolean; older versions return
  // `status` string. Normalize both.
  const isGranted = p.granted === true || p.status === 'granted';
  const isDenied = p.status === 'denied' || p.status === 'never_ask_again';
  if (isGranted) {
    return { status: 'granted', canAskAgain: p.canAskAgain ?? true };
  }
  if (isDenied) {
    return { status: 'denied', canAskAgain: p.canAskAgain ?? false };
  }
  return { status: 'undetermined', canAskAgain: p.canAskAgain ?? true };
}

export function useCameraPermissionState(): CameraPermissionHook {
  const [state, setState] = useState<CameraPermissionState>({
    status: 'undetermined',
    canAskAgain: true,
  });

  const refresh = useCallback(async () => {
    try {
      const current = await getCameraPermissionsAsync();
      setState(toState(current));
    } catch {
      // Silent — keep undetermined; UI will request on first tap.
    }
  }, []);

  const request = useCallback(async (): Promise<CameraPermissionOutcome> => {
    try {
      const result = await requestCameraPermissionsAsync();
      setState(toState(result));
      if (result.granted) {
        return { granted: true };
      }
      return { granted: false, classification: 'camara-permiso-denegado' };
    } catch {
      return { granted: false, classification: 'camara-permiso-denegado' };
    }
  }, []);

  return { permission: state, request, refresh } as CameraPermissionHook & {
    refresh: () => Promise<void>;
  };
}
