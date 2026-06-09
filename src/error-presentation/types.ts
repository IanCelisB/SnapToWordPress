// Public types for the error-presentation module.
// Imported via the `index.ts` barrel. Internal files (catalog.ts, classifier.ts,
// presenter.ts) import from here to avoid circular references.

export type ErrorKey =
  | 'credenciales-invalidas'
  | 'sin-conexion'
  | 'servidor-no-disponible'
  | 'limite-de-tasa'
  | 'datos-invalidos'
  | 'camara-permiso-denegado'
  | 'almacenamiento-error'
  | 'imagen-faltante'
  | 'precio-no-confirmado'
  | 'tienda-no-accesible'
  | 'error-inesperado'
  // WU-4 sync-specific keys. Surfaced by the worker when a product
  // exhausts its per-run attempt cap (recoverable) or hits a terminal
  // error (non-recoverable). The presenter renders both as a single
  // "N productos no se pudieron subir — tocá para ver" card.
  | 'sincronizacion-reintentable'
  | 'sincronizacion-fallida';

export type Severity = 'info' | 'warning' | 'error' | 'blocking';

export type Action =
  | { kind: 'retry' }
  | { kind: 'open-settings' }
  | { kind: 'edit-product'; productId: string }
  | { kind: 'contact-support' };

export type CatalogEntry = {
  title: string;
  message: string;
  severity: Severity;
  action?: Action;
};

export type PresentParams = {
  field?: string;
  reason?: string;
  productId?: string;
};

export type ClassifiedError = {
  key: ErrorKey;
  cause?: unknown;
  correlationId: string;
};

// Internal: typed error sentinels raised by infra + service modules.
// Exported so the WU-2/WU-3 infra layer can throw them.
export class WooError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly cause?: unknown;
  constructor(opts: {
    message: string;
    status?: number;
    body?: unknown;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'WooError';
    this.status = opts.status;
    this.body = opts.body;
    this.cause = opts.cause;
  }
}

export class ValidationError extends Error {
  readonly field: string;
  readonly reason: string;
  constructor(field: string, reason: string) {
    super(`Validation failed for ${field}: ${reason}`);
    this.name = 'ValidationError';
    this.field = field;
    this.reason = reason;
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
