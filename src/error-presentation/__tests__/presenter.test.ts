// Presenter tests — the public surface that screens consume.

import { presentError } from '../presenter';
import { ERROR_CATALOG } from '../catalog';
import { ValidationError, WooError } from '../types';

describe('error-presentation presenter', () => {
  describe('valid key (string lookup)', () => {
    it('returns the catalog entry for "credenciales-invalidas"', () => {
      const entry = presentError('credenciales-invalidas');
      expect(entry).toEqual(ERROR_CATALOG['credenciales-invalidas']);
    });

    it('returns the catalog entry for "sin-conexion"', () => {
      const entry = presentError('sin-conexion');
      expect(entry).toEqual(ERROR_CATALOG['sin-conexion']);
    });

    it('returns a fresh object (not the catalog reference)', () => {
      const entry = presentError('error-inesperado');
      expect(entry).not.toBe(ERROR_CATALOG['error-inesperado']);
      expect(entry.title).toBe(ERROR_CATALOG['error-inesperado'].title);
    });
  });

  describe('unknown key falls back to error-inesperado', () => {
    it('a string that is not a key → error-inesperado', () => {
      // The classifier will receive a string and fall through to the
      // fallback key. This is the spec rule: "MUST NEVER return the raw
      // error text as a key — unknown failures always fall through to
      // error-inesperado."
      const entry = presentError('not-a-real-key');
      expect(entry).toEqual(ERROR_CATALOG['error-inesperado']);
    });
  });

  describe('raw error input', () => {
    it('WooError(401) → credenciales-invalidas', () => {
      const entry = presentError(new WooError({ message: 'unauth', status: 401 }));
      expect(entry.severity).toBe('blocking');
      expect(entry.action).toEqual({ kind: 'open-settings' });
    });

    it('TypeError network → sin-conexion', () => {
      const entry = presentError(new TypeError('Network request failed'));
      expect(entry.severity).toBe('warning');
      expect(entry.action).toEqual({ kind: 'retry' });
    });

    it('unknown error → error-inesperado', () => {
      const entry = presentError(new Error('weird internal thing'));
      expect(entry).toEqual(ERROR_CATALOG['error-inesperado']);
    });
  });

  describe('param-aware entries', () => {
    it('datos-invalidos + field=precio + reason=required → custom message', () => {
      const entry = presentError(
        new ValidationError('precio', 'required'),
        { field: 'precio', reason: 'required' },
      );
      expect(entry.title).toBe('Revisá este campo');
      expect(entry.message).toContain('precio');
    });

    it('datos-invalidos + field=precio + reason=not-integer', () => {
      const entry = presentError(
        new ValidationError('precio', 'not-integer'),
        { field: 'precio', reason: 'not-integer' },
      );
      expect(entry.message).toContain('entero');
    });

    it('datos-invalidos + field=precio + reason=must-be-positive', () => {
      const entry = presentError(
        new ValidationError('precio', 'must-be-positive'),
        { field: 'precio', reason: 'must-be-positive' },
      );
      expect(entry.message).toContain('mayor a cero');
    });

    it('imagen-faltante + productId → action.productId is set', () => {
      const entry = presentError(
        new Error('file does not exist'),
        { productId: 'abc-123' },
      );
      expect(entry.action).toEqual({ kind: 'edit-product', productId: 'abc-123' });
    });

    it('precio-no-confirmado + productId → action.productId is set', () => {
      const entry = presentError('precio-no-confirmado', { productId: 'p-9' });
      expect(entry.action).toEqual({ kind: 'edit-product', productId: 'p-9' });
    });

    it('imagen-faltante WITHOUT productId → action.productId stays empty', () => {
      const entry = presentError('imagen-faltante');
      if (entry.action?.kind === 'edit-product') {
        expect(entry.action.productId).toBe('');
      }
    });
  });

  describe('strict isolation', () => {
    it('returned entry does NOT include the raw error message', () => {
      const err = new Error('this string must never reach the user');
      const entry = presentError(err);
      expect(entry.title).not.toContain('this string');
      expect(entry.message).not.toContain('this string');
    });
  });
});
