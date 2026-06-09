// src/infra/logger.ts — calm, dev/prod-aware logger.
//
// Rules (Design §10, error-presentation spec):
//   - NEVER log credentials (URL is allowed, key/secret MUST NOT appear
//     in any log line).
//   - In dev, logs go to `console.warn` / `console.error` (allowed by the
//     ESLint config's `no-console: warn` allowlist).
//   - In prod, logs are silenced by default. The single production sink
//     is the `correlationId` from the presenter, which the UI surfaces
//     in dev builds only.
//
// The credential-redaction filter is the load-bearing safety net: any
// call to `info` / `warn` / `error` runs the input through
// `redactCredentialLike` first. If the line contains a string that
// matches the `ck_<hex>` / `cs_<hex>` / Basic-Auth base64 pattern, the
// line is replaced with `[REDACTED-CREDENTIAL]`.

export type LogLevel = 'info' | 'warn' | 'error';

const PROD = isProduction();

function isProduction(): boolean {
  // `__DEV__` is a Metro/Expo build-time global. Guard the read so the
  // module is import-safe under bare Node/Jest.
  const g = globalThis as { __DEV__?: boolean };
  return g.__DEV__ !== true;
}

const CREDENTIAL_PATTERNS: ReadonlyArray<RegExp> = [
  /\bck_[a-f0-9]{16,}\b/gi,
  /\bcs_[a-f0-9]{16,}\b/gi,
  /(?<=\bBasic\s)[A-Za-z0-9+/=]{20,}(?=\s|$)/gi,
];

function redactCredentialLike(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }
  let redacted = input;
  for (const re of CREDENTIAL_PATTERNS) {
    redacted = redacted.replace(re, '[REDACTED-CREDENTIAL]');
  }
  return redacted;
}

function emit(level: LogLevel, args: ReadonlyArray<unknown>): void {
  if (PROD && level === 'info') {
    return;
  }
  const safe = args.map(redactCredentialLike);
  if (level === 'info') {
    // eslint-disable-next-line no-console
    console.info(...safe);
    return;
  }
  if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(...safe);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(...safe);
}

export const logger = {
  info: (...args: ReadonlyArray<unknown>): void => emit('info', args),
  warn: (...args: ReadonlyArray<unknown>): void => emit('warn', args),
  error: (...args: ReadonlyArray<unknown>): void => emit('error', args),
  /** Re-exported for tests. */
  __redactCredentialLike: redactCredentialLike,
} as const;
