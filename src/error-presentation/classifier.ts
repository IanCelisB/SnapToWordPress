// Classifier — the SOLE place that turns a raw failure into a catalog key
// (Design §2 Decision + §10 + error-presentation spec R3, R4).
//
// The sync worker throws raw `WooError` / `ValidationError`; this function
// decides which `ErrorKey` they map to. Co-locating the classifier with the
// catalog guarantees the same key for the same raw failure regardless of
// where it surfaced (sync, onboarding, capture).
//
// Order matters — more specific cases first.

import { ValidationError, WooError } from './types';
import type { ClassifiedError, ErrorKey } from './types';

export function classifyError(err: unknown): ClassifiedError {
  const correlationId = generateCorrelationId();

  // 1. Auth failure (401/403).
  if (err instanceof WooError && (err.status === 401 || err.status === 403)) {
    return { key: 'credenciales-invalidas', cause: err, correlationId };
  }

  // 2. Rate limiting (429).
  if (err instanceof WooError && err.status === 429) {
    return { key: 'limite-de-tasa', cause: err, correlationId };
  }

  // 3. Server-side failure (5xx).
  if (
    err instanceof WooError &&
    typeof err.status === 'number' &&
    err.status >= 500
  ) {
    return { key: 'servidor-no-disponible', cause: err, correlationId };
  }

  // 4. 404 — for HTTP-class errors, treat as "URL is not a WC store".
  if (err instanceof WooError && err.status === 404) {
    return { key: 'tienda-no-accesible', cause: err, correlationId };
  }

  // 5. Field-level validation (datos-invalidos carries field/reason params).
  if (err instanceof ValidationError) {
    return { key: 'datos-invalidos', cause: err, correlationId };
  }

  // 6. Network / offline.
  if (err instanceof Error) {
    if (
      err.message.includes('Network request failed') ||
      err.name === 'AbortError' ||
      (err instanceof TypeError && /network|fetch/i.test(err.message))
    ) {
      return { key: 'sin-conexion', cause: err, correlationId };
    }
  }

  // 7. File-system permissions (EACCES / EPERM show up on err.message on
  //    RN's expo-file-system layer).
  if (err instanceof Error && /EACCES|EPERM/.test(err.message)) {
    return { key: 'almacenamiento-error', cause: err, correlationId };
  }

  // 8. Camera permission — raised explicitly with a sentinel message.
  if (
    err instanceof Error &&
    (err.message === 'CAMERA_PERMISSION_DENIED' ||
      /camera.{0,12}permission/i.test(err.message))
  ) {
    return { key: 'camara-permiso-denegado', cause: err, correlationId };
  }

  // 9. Image file missing on disk.
  if (
    err instanceof Error &&
    /file does not exist|image not found|no such file/i.test(err.message)
  ) {
    return { key: 'imagen-faltante', cause: err, correlationId };
  }

  // 10. Fallback.
  return { key: 'error-inesperado' as ErrorKey, cause: err, correlationId };
}

function generateCorrelationId(): string {
  // 6-char base36 — small enough to fit in a console line, unique enough for
  // correlating a user-reported error to a session log.
  const n = Math.floor(Math.random() * 36 ** 6);
  return n.toString(36).padStart(6, '0');
}
