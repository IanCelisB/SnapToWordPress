// src/services/woocommerce/client.ts — WooCommerce REST client (skeleton).
//
// Implements the `WooClient` contract from Design §5. WU-2 lands the
// auth, base-URL canonicalization, timeout, and `validate()` path. WU-4
// (tasks 4.1–4.2) wires the full upload pipeline (idempotency pre-check,
// media upload, product create) on top of this skeleton.
//
// The skeleton deliberately exposes ONLY:
//   - `validate()` for the credentials flow
//   - `getProductByLocalId()` for the idempotency pre-check
//   - `listCategories()` for the capture screen's category picker
//   - `createProduct()`, `uploadMedia()`, `deleteMedia()` for the
//     worker (W-4 will exercise them; WU-2 only DEFINES the methods).
//
// All request methods throw `WooError` with `.status` and `.body`. The
// classifier in `error-presentation` is the only consumer of those
// fields.

import { WooError } from '../../error-presentation';
import type { HttpClient, HttpRequestInit } from '../../infra/http-client';
import type {
  NewWCProductBody,
  WCCategory,
  WCCredentials,
  WCProduct,
} from '../../domain/types';

const DEFAULT_TIMEOUT_MS = 30_000;

export type ValidationResult =
  | { ok: true }
  | { ok: false; status?: number; reason: 'invalid' | 'unreachable' | 'not-a-store' };

export type WooClient = {
  validate(): Promise<ValidationResult>;
  getProductByLocalId(localId: string): Promise<WCProduct | null>;
  uploadMedia(fileUri: string, filename: string): Promise<{ id: number }>;
  deleteMedia(mediaId: number): Promise<void>;
  createProduct(body: NewWCProductBody): Promise<WCProduct>;
  listCategories(): Promise<ReadonlyArray<WCCategory>>;
  /** Internal: the base URL we built from the credentials (canonical). */
  readonly baseUrl: string;
};

export function createWooClient(
  creds: WCCredentials,
  http: HttpClient,
): WooClient {
  const baseUrl = canonicalizeBaseUrl(creds.baseUrl);
  const authHeader = buildAuthHeader(creds.key, creds.secret);

  return {
    baseUrl,

    async validate() {
      try {
        const res = await http.request<unknown>(`${baseUrl}/wp-json/wc/v3/system_status`, {
          method: 'GET',
          headers: authHeader,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        if (res.status === 200) {
          return { ok: true };
        }
        if (res.status === 401 || res.status === 403) {
          return { ok: false, status: res.status, reason: 'invalid' };
        }
        if (res.status === 404) {
          return { ok: false, status: res.status, reason: 'not-a-store' };
        }
        // 5xx + 4xx-other → treat as "store is broken but reachable".
        return { ok: false, status: res.status, reason: 'unreachable' };
      } catch (err) {
        if (err instanceof WooError) {
          return { ok: false, reason: 'unreachable' };
        }
        return { ok: false, reason: 'unreachable' };
      }
    },

    async getProductByLocalId(localId: string) {
      const url = `${baseUrl}/wp-json/wc/v3/products?per_page=1&meta_key=local_id&meta_value=${encodeURIComponent(localId)}`;
      try {
        const res = await http.request<ReadonlyArray<WCProduct>>(url, {
          method: 'GET',
          headers: authHeader,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        if (res.status === 200) {
          const [first] = res.body;
          return first ?? null;
        }
        if (res.status === 401 || res.status === 403) {
          throw new WooError({ message: 'unauth', status: res.status });
        }
        if (res.status === 404) {
          return null;
        }
        throw new WooError({
          message: `GET product by local_id failed: ${res.status}`,
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        if (err instanceof WooError) throw err;
        throw new WooError({ message: 'network failure', cause: err });
      }
    },

    async uploadMedia(fileUri: string, filename: string) {
      // The real multipart body is constructed in `media.ts` (WU-2.6).
      // WU-2 ships the SHAPE so the rest of the worker can be written
      // against a stable contract; WU-4 wires `FormData` and the file
      // stream.
      const body = new FormData();
      // RN's FormData accepts a `{ uri, name, type }` shape.
      body.append('file', {
        uri: fileUri,
        name: filename,
        type: 'image/jpeg',
      } as unknown as Blob);
      try {
        const res = await http.request<{ id: number }>(
          `${baseUrl}/wp-json/wp/v2/media`,
          {
            method: 'POST',
            headers: { ...authHeader },
            body,
            timeoutMs: DEFAULT_TIMEOUT_MS,
          },
        );
        if (res.status >= 200 && res.status < 300 && res.body && typeof res.body.id === 'number') {
          return { id: res.body.id };
        }
        throw new WooError({
          message: `POST /wp/v2/media failed: ${res.status}`,
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        if (err instanceof WooError) throw err;
        throw new WooError({ message: 'network failure', cause: err });
      }
    },

    async deleteMedia(mediaId: number) {
      try {
        const res = await http.request<unknown>(
          `${baseUrl}/wp-json/wp/v2/media/${mediaId}?force=true`,
          {
            method: 'DELETE',
            headers: authHeader,
            timeoutMs: DEFAULT_TIMEOUT_MS,
          },
        );
        if (res.status >= 200 && res.status < 300) {
          return;
        }
        throw new WooError({
          message: `DELETE media failed: ${res.status}`,
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        if (err instanceof WooError) throw err;
        throw new WooError({ message: 'network failure', cause: err });
      }
    },

    async createProduct(body: NewWCProductBody) {
      const payload = {
        name: body.name,
        status: body.status,
        regular_price: body.regularPrice,
        description: body.description,
        categories: body.categories.map((c) => ({ id: c.id })),
        images: body.images.map((i) => ({ id: i.id })),
        meta_data: body.metaData.map((m) => ({ key: m.key, value: m.value })),
      };
      try {
        const res = await http.request<WCProduct>(`${baseUrl}/wp-json/wc/v3/products`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
        if (res.status >= 200 && res.status < 300) {
          return res.body;
        }
        throw new WooError({
          message: `POST /wp-json/wc/v3/products failed: ${res.status}`,
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        if (err instanceof WooError) throw err;
        throw new WooError({ message: 'network failure', cause: err });
      }
    },

    async listCategories() {
      try {
        const res = await http.request<ReadonlyArray<WCCategory>>(
          `${baseUrl}/wp-json/wc/v3/products/categories?per_page=100`,
          {
            method: 'GET',
            headers: authHeader,
            timeoutMs: DEFAULT_TIMEOUT_MS,
          },
        );
        if (res.status >= 200 && res.status < 300) {
          return res.body;
        }
        throw new WooError({
          message: `GET /wp-json/wc/v3/products/categories failed: ${res.status}`,
          status: res.status,
          body: res.body,
        });
      } catch (err) {
        if (err instanceof WooError) throw err;
        throw new WooError({ message: 'network failure', cause: err });
      }
    },
  };
}

/**
 * Canonical base URL: forces `https://`, strips trailing slash, strips
 * any path. The user-facing prompt that says "Quitamos la ruta" lives
 * in the onboarding screen, not here; this function is the silent
 * normalizer that runs BEFORE the prompt.
 */
export function canonicalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    // No scheme → assume https. Spec scenario: the user typed
    // `mitienda.com` instead of `https://mitienda.com`.
    url = `https://${url}`;
  }
  if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  // Parse to drop the path. We keep the host + port.
  const parsed = new URL(url);
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  let out = parsed.toString();
  if (out.endsWith('/')) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Build the `Authorization: Basic <base64(key:secret)>` header. Uses
 * btoa (available in RN's Hermes runtime + Node 18+).
 */
export function buildAuthHeader(key: string, secret: string): Record<string, string> {
  const token =
    typeof btoa === 'function'
      ? btoa(`${key}:${secret}`)
      : Buffer.from(`${key}:${secret}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/** Re-export so WU-4 can construct the client without reaching into internals. */
export type { HttpClient, HttpRequestInit };
