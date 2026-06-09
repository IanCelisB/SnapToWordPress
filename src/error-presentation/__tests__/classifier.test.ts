// Classifier tests — the SOLE classification table in the app.
//
// Each scenario here is named for the input shape so a failure points
// directly at the regression. New input shapes need a new test, not a
// comment.

import { classifyError } from '../classifier';
import {
  ValidationError,
  WooError,
} from '../types';
import type { ErrorKey } from '../types';

describe('error-presentation classifier', () => {
  describe('HTTP status codes', () => {
    it('401 → credenciales-invalidas', () => {
      const err = new WooError({ message: 'unauthorized', status: 401 });
      expect(classifyError(err).key).toBe<ErrorKey>('credenciales-invalidas');
    });

    it('403 → credenciales-invalidas', () => {
      const err = new WooError({ message: 'forbidden', status: 403 });
      expect(classifyError(err).key).toBe<ErrorKey>('credenciales-invalidas');
    });

    it('404 → tienda-no-accesible (HTTP class)', () => {
      const err = new WooError({ message: 'not found', status: 404 });
      expect(classifyError(err).key).toBe<ErrorKey>('tienda-no-accesible');
    });

    it('429 → limite-de-tasa', () => {
      const err = new WooError({ message: 'rate limited', status: 429 });
      expect(classifyError(err).key).toBe<ErrorKey>('limite-de-tasa');
    });

    it('500 → servidor-no-disponible', () => {
      const err = new WooError({ message: 'internal', status: 500 });
      expect(classifyError(err).key).toBe<ErrorKey>('servidor-no-disponible');
    });

    it('502 → servidor-no-disponible', () => {
      const err = new WooError({ message: 'bad gateway', status: 502 });
      expect(classifyError(err).key).toBe<ErrorKey>('servidor-no-disponible');
    });

    it('503 → servidor-no-disponible', () => {
      const err = new WooError({ message: 'unavailable', status: 503 });
      expect(classifyError(err).key).toBe<ErrorKey>('servidor-no-disponible');
    });
  });

  describe('network / offline', () => {
    it('TypeError: Network request failed → sin-conexion', () => {
      const err = new TypeError('Network request failed');
      expect(classifyError(err).key).toBe<ErrorKey>('sin-conexion');
    });

    it('AbortError (timeout) → sin-conexion', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      expect(classifyError(err).key).toBe<ErrorKey>('sin-conexion');
    });

    it('generic fetch TypeError → sin-conexion', () => {
      const err = new TypeError('fetch failed at https://example.com');
      expect(classifyError(err).key).toBe<ErrorKey>('sin-conexion');
    });
  });

  describe('storage / file system', () => {
    it('EACCES → almacenamiento-error', () => {
      const err = new Error('EACCES: permission denied');
      expect(classifyError(err).key).toBe<ErrorKey>('almacenamiento-error');
    });

    it('EPERM → almacenamiento-error', () => {
      const err = new Error('EPERM: operation not permitted');
      expect(classifyError(err).key).toBe<ErrorKey>('almacenamiento-error');
    });
  });

  describe('camera', () => {
    it('CAMERA_PERMISSION_DENIED → camara-permiso-denegado', () => {
      const err = new Error('CAMERA_PERMISSION_DENIED');
      expect(classifyError(err).key).toBe<ErrorKey>('camara-permiso-denegado');
    });

    it('descriptive camera permission message → camara-permiso-denegado', () => {
      const err = new Error('expo-camera permission was denied by the user');
      expect(classifyError(err).key).toBe<ErrorKey>('camara-permiso-denegado');
    });
  });

  describe('image missing', () => {
    it('"file does not exist" → imagen-faltante', () => {
      const err = new Error('file does not exist at /var/mobile/.../img.jpg');
      expect(classifyError(err).key).toBe<ErrorKey>('imagen-faltante');
    });

    it('"image not found" → imagen-faltante', () => {
      const err = new Error('image not found on disk');
      expect(classifyError(err).key).toBe<ErrorKey>('imagen-faltante');
    });
  });

  describe('validation', () => {
    it('ValidationError → datos-invalidos', () => {
      const err = new ValidationError('price', 'must-be-positive');
      expect(classifyError(err).key).toBe<ErrorKey>('datos-invalidos');
    });
  });

  describe('fallback', () => {
    it('TypeError: undefined is not a function → error-inesperado', () => {
      const err = new TypeError('undefined is not a function');
      expect(classifyError(err).key).toBe<ErrorKey>('error-inesperado');
    });

    it('plain object → error-inesperado', () => {
      expect(classifyError({ random: 'thing' }).key).toBe<ErrorKey>(
        'error-inesperado',
      );
    });

    it('null → error-inesperado', () => {
      expect(classifyError(null).key).toBe<ErrorKey>('error-inesperado');
    });

    it('string → error-inesperado', () => {
      expect(classifyError('something broke').key).toBe<ErrorKey>('error-inesperado');
    });
  });

  describe('metadata', () => {
    it('always returns a 6-char base36 correlationId', () => {
      const out = classifyError(new Error('whatever'));
      expect(out.correlationId).toMatch(/^[0-9a-z]{6}$/);
    });

    it('preserves the cause for the dev console', () => {
      const cause = new Error('boom');
      const out = classifyError(cause);
      expect(out.cause).toBe(cause);
    });
  });
});
