// src/services/woocommerce/__tests__/client.test.ts — WC client error mapping.
//
// What this asserts:
//   - validate() returns {ok:true} on 200.
//   - validate() returns {ok:false, reason:'invalid'} on 401 and 403.
//   - validate() returns {ok:false, reason:'not-a-store'} on 404.
//   - validate() returns {ok:false, reason:'unreachable'} on 5xx.
//   - validate() returns {ok:false, reason:'unreachable'} on a network
//     failure (the mock throws a TypeError).
//   - getProductByLocalId returns null when the server has zero matches.
//   - getProductByLocalId parses the meta_data list correctly.
//   - canonicalizeBaseUrl: http→https, path-strip, trailing-slash-strip.

import {
  buildAuthHeader,
  canonicalizeBaseUrl,
  createWooClient,
} from '../client';
import { createHttpClient } from '../../../infra/http-client';
import type { WCProduct } from '../../../domain/types';
import type { HttpClient } from '../../../infra/http-client';

function fakeHttp(
  responses: ReadonlyArray<{ status: number; body: unknown }>,
): HttpClient {
  let i = 0;
  return {
    request: jest.fn(async () => {
      const r = responses[i] ?? responses[responses.length - 1];
      if (!r) {
        throw new Error('fakeHttp: out of responses');
      }
      i += 1;
      return { status: r.status, ok: r.status >= 200 && r.status < 300, body: r.body, headers: new Headers() };
    }),
    __setFetcher: () => undefined,
  };
}

const creds = {
  baseUrl: 'https://mitienda.com',
  key: 'ck_abc',
  secret: 'cs_def',
};

describe('WooClient.validate()', () => {
  it('returns {ok:true} on 200', async () => {
    const http = fakeHttp([{ status: 200, body: { environment: 'production' } }]);
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(true);
  });

  it('returns {ok:false, reason:"invalid"} on 401', async () => {
    const http = fakeHttp([{ status: 401, body: { message: 'unauth' } }]);
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.status).toBe(401);
    }
  });

  it('returns {ok:false, reason:"invalid"} on 403', async () => {
    const http = fakeHttp([{ status: 403, body: { message: 'forbidden' } }]);
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
  });

  it('returns {ok:false, reason:"not-a-store"} on 404', async () => {
    const http = fakeHttp([{ status: 404, body: { message: 'not found' } }]);
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not-a-store');
    }
  });

  it('returns {ok:false, reason:"unreachable"} on 5xx', async () => {
    const http = fakeHttp([{ status: 503, body: { message: 'down' } }]);
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unreachable');
      expect(result.status).toBe(503);
    }
  });

  it('returns {ok:false, reason:"unreachable"} on a network failure', async () => {
    const http: HttpClient = {
      request: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
      __setFetcher: () => undefined,
    };
    const client = createWooClient(creds, http);
    const result = await client.validate();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unreachable');
    }
  });
});

describe('WooClient.getProductByLocalId', () => {
  it('returns null when the server has no match', async () => {
    const http = fakeHttp([{ status: 200, body: [] }]);
    const client = createWooClient(creds, http);
    const got = await client.getProductByLocalId('uuid-zzz');
    expect(got).toBeNull();
  });

  it('parses a single matching product', async () => {
    const serverProduct: WCProduct = {
      id: 42,
      name: 'Remera',
      status: 'publish',
      images: [],
      metaData: [{ key: 'local_id', value: 'uuid-abc' }],
    };
    const http = fakeHttp([{ status: 200, body: [serverProduct] }]);
    const client = createWooClient(creds, http);
    const got = await client.getProductByLocalId('uuid-abc');
    expect(got).not.toBeNull();
    expect(got?.id).toBe(42);
    expect(got?.metaData[0]?.value).toBe('uuid-abc');
  });
});

describe('canonicalizeBaseUrl', () => {
  it('forces https', () => {
    expect(canonicalizeBaseUrl('http://mitienda.com')).toBe('https://mitienda.com');
  });

  it('strips the trailing slash', () => {
    expect(canonicalizeBaseUrl('https://mitienda.com/')).toBe('https://mitienda.com');
  });

  it('strips the trailing path', () => {
    expect(canonicalizeBaseUrl('https://mitienda.com/shop/')).toBe('https://mitienda.com');
    expect(canonicalizeBaseUrl('https://mitienda.com/wp-admin/')).toBe('https://mitienda.com');
  });

  it('adds https when no scheme is given', () => {
    expect(canonicalizeBaseUrl('mitienda.com')).toBe('https://mitienda.com');
  });

  it('preserves the port', () => {
    expect(canonicalizeBaseUrl('https://mitienda.com:8443/')).toBe(
      'https://mitienda.com:8443',
    );
  });
});

describe('buildAuthHeader', () => {
  it('produces an Authorization: Basic <base64> header', () => {
    const h = buildAuthHeader('ck_abc', 'cs_def');
    expect(h.Authorization).toMatch(/^Basic /);
    const token = h.Authorization.split(' ')[1] ?? '';
    // base64 of 'ck_abc:cs_def'
    const decoded =
      typeof atob === 'function'
        ? atob(token)
        : Buffer.from(token, 'base64').toString('utf-8');
    expect(decoded).toBe('ck_abc:cs_def');
  });
});

// `createHttpClient` integration smoke: the real client uses global fetch.
// In a Jest env under `testEnvironment: 'node'`, fetch is not always
// present, so we just assert the factory returns an object with the
// expected shape.
describe('createHttpClient (shape)', () => {
  it('returns an object with request + __setFetcher', () => {
    const c = createHttpClient();
    expect(typeof c.request).toBe('function');
    expect(typeof c.__setFetcher).toBe('function');
  });
});
