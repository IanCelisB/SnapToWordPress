// Public surface of the error-presentation module.
// Every other module in the app MUST import from here, never from the
// internal files. The catalog is the single source of truth for Spanish
// user-facing strings.

export { ERROR_CATALOG, ALL_ERROR_KEYS } from './catalog';
export { classifyError } from './classifier';
export { presentError } from './presenter';
export {
  WooError,
  ValidationError,
  MigrationError,
} from './types';
export type {
  ErrorKey,
  Severity,
  Action,
  CatalogEntry,
  PresentParams,
  ClassifiedError,
} from './types';
