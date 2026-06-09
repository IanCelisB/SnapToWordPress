// Error catalog — the single source of truth for Spanish user-facing strings.
//
// Rule (Design §10 + error-presentation spec R5):
//   - voseo (verificá, tocá, revisá)
//   - no "!"  (calm tone)
//   - no jargon (no digits, no "HTTP", "JSON", "API", "token", "sync",
//     "WooCommerce", "optifull.cl")
//   - sentences under 12 words when possible
//
// The no-jargon lint in `__tests__/catalog.test.ts` enforces this at build
// time. Adding a new key requires updating:
//   1. the `ErrorKey` union in ./types.ts
//   2. an entry here
//   3. a classifier branch in ./classifier.ts (if it is reached via raw
//      errors; some keys are only surfaced by `presentError(<key>)` calls)

import type { CatalogEntry, ErrorKey } from './types';

export const ERROR_CATALOG: Record<ErrorKey, CatalogEntry> = {
  'credenciales-invalidas': {
    title: 'No pudimos conectar con la tienda',
    message: 'Verificá las credenciales en Ajustes.',
    severity: 'blocking',
    action: { kind: 'open-settings' },
  },
  'sin-conexion': {
    title: 'Sin conexión',
    message: 'Vamos a reintentar automáticamente cuando vuelvas a tener señal.',
    severity: 'warning',
    action: { kind: 'retry' },
  },
  'servidor-no-disponible': {
    title: 'La tienda no responde',
    message: 'Vamos a reintentar en unos segundos.',
    severity: 'warning',
  },
  'limite-de-tasa': {
    title: 'La tienda nos pidió una pausa',
    message: 'Reanudamos en un momento.',
    severity: 'info',
  },
  'datos-invalidos': {
    title: 'Revisá este campo',
    message: 'Revisá el valor que ingresaste.',
    severity: 'warning',
  },
  'camara-permiso-denegado': {
    title: 'Necesitamos la cámara',
    message: 'Activala desde Ajustes para sacar fotos.',
    severity: 'blocking',
    action: { kind: 'open-settings' },
  },
  'almacenamiento-error': {
    title: 'No pudimos abrir la base local',
    message: 'Reintentá al abrir la app, o contactanos.',
    severity: 'blocking',
    action: { kind: 'contact-support' },
  },
  'imagen-faltante': {
    title: 'Falta una imagen',
    message: 'Sacá la foto de nuevo o quitá esta imagen.',
    severity: 'error',
    action: { kind: 'edit-product', productId: '' },
  },
  'precio-no-confirmado': {
    title: 'Precio sin confirmar',
    message: 'Tocá "Confirmar precio" para poder subirlo.',
    severity: 'info',
    action: { kind: 'edit-product', productId: '' },
  },
  'tienda-no-accesible': {
    title: 'Esta URL no es una tienda',
    message: 'Verificá la URL y volvé a intentar.',
    severity: 'blocking',
    action: { kind: 'retry' },
  },
  'error-inesperado': {
    title: 'Algo salió mal',
    message: 'El producto quedó guardado en el teléfono, lo vamos a intentar subir de nuevo.',
    severity: 'error',
    action: { kind: 'retry' },
  },
};

export const ALL_ERROR_KEYS: readonly ErrorKey[] = Object.keys(
  ERROR_CATALOG,
) as ErrorKey[];
