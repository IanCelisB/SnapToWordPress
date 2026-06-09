// src/infra/__tests__/logger.test.ts — the credential-redaction filter
// catches `ck_*` / `cs_*` / Basic-Auth base64 blobs.

import { logger } from '../logger';

describe('logger credential redaction', () => {
  it('redacts ck_<hex> in a string', () => {
    const out = logger.__redactCredentialLike(
      'auth header ck_abcdef1234567890abcdef sent',
    );
    expect(out).toBe('auth header [REDACTED-CREDENTIAL] sent');
  });

  it('redacts cs_<hex> in a string', () => {
    const out = logger.__redactCredentialLike('secret cs_0123456789abcdef0123!');
    expect(out).toBe('secret [REDACTED-CREDENTIAL]!');
  });

  it('redacts Basic base64 of a key:secret', () => {
    const token =
      typeof btoa === 'function'
        ? btoa('ck_abc:cs_def')
        : Buffer.from('ck_abc:cs_def').toString('base64');
    const out = logger.__redactCredentialLike(`Authorization: Basic ${token}`);
    expect(out).toBe('Authorization: Basic [REDACTED-CREDENTIAL]');
  });

  it('leaves non-credential strings alone', () => {
    const out = logger.__redactCredentialLike('user tapped the save button');
    expect(out).toBe('user tapped the save button');
  });

  it('passes through non-strings unchanged', () => {
    const obj = { a: 1 };
    expect(logger.__redactCredentialLike(obj)).toBe(obj);
  });
});
