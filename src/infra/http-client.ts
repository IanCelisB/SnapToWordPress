// src/infra/http-client.ts — fetch wrapper with timeout and one retry
// on connection-reset (Design §8).
//
// Behavior:
//   - Default 30s timeout via AbortController.
//   - 1 automatic retry on `TypeError: Network request failed` only
//     (handled at the transport layer — distinct from the worker's
//     5x per-product retry).
//   - Does NOT retry on HTTP errors. Those bubble to the caller (the
//     worker / the credentials validator), which decides whether to
//     retry based on the response status.
//   - All callers receive `WooError` with `{ status, body, cause }`.
//     Plain `TypeError` only ever leaks if the caller doesn't wrap the
//     call site in a try/catch (the credentials validator does, the
//     worker does).

import { WooError } from '../error-presentation';

export type HttpRequestInit = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Readonly<Record<string, string>>;
  body?: BodyInit | null;
  timeoutMs?: number;
  /** Set to false to disable the single retry on network-reset. */
  retryOnNetworkReset?: boolean;
  signal?: AbortSignal;
};

export type HttpResponse<T> = {
  status: number;
  ok: boolean;
  body: T;
  headers: Headers;
};

export type HttpFetcher = (
  input: string,
  init: RequestInit,
) => Promise<globalThis.Response>;

const DEFAULT_TIMEOUT_MS = 30_000;

export type HttpClient = {
  request: <T = unknown>(url: string, init: HttpRequestInit) => Promise<HttpResponse<T>>;
  /** Test seam: replace the underlying fetch. */
  __setFetcher: (fetcher: HttpFetcher) => void;
};

export function createHttpClient(): HttpClient {
  let fetcher: HttpFetcher = (input, init) => fetch(input, init);

  async function request<T>(
    url: string,
    init: HttpRequestInit,
  ): Promise<HttpResponse<T>> {
    const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryOnNetworkReset = init.retryOnNetworkReset ?? true;

    const attempt = async (): Promise<HttpResponse<T>> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Chain the caller's signal so a parent cancel also aborts.
      const onParentAbort = (): void => controller.abort();
      if (init.signal) {
        if (init.signal.aborted) {
          controller.abort();
        } else {
          init.signal.addEventListener('abort', onParentAbort, { once: true });
        }
      }
      try {
        const response = await fetcher(url, {
          method: init.method ?? 'GET',
          headers: init.headers,
          body: init.body ?? null,
          signal: controller.signal,
        });
        return await parseResponse<T>(response);
      } catch (err) {
        // Surface as WooError so the classifier can route it.
        throw wrapAsWooError(err);
      } finally {
        clearTimeout(timer);
        if (init.signal) {
          init.signal.removeEventListener('abort', onParentAbort);
        }
      }
    };

    try {
      return await attempt();
    } catch (err) {
      if (retryOnNetworkReset && isNetworkReset(err) ) {
        return await attempt();
      }
      throw err;
    }
  }

  return {
    request,
    __setFetcher: (next: HttpFetcher) => {
      fetcher = next;
    },
  };
}

async function parseResponse<T>(response: globalThis.Response): Promise<HttpResponse<T>> {
  const text = await response.text();
  let parsed: T;
  if (text.length === 0) {
    parsed = null as unknown as T;
  } else {
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = text as unknown as T;
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    body: parsed,
    headers: response.headers,
  };
}

function isNetworkReset(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (err.name === 'AbortError') {
    return false; // timeout abort — not a network reset
  }
  return /network request failed|failed to fetch|networkerror/i.test(err.message);
}

function wrapAsWooError(err: unknown): WooError {
  if (err instanceof WooError) {
    return err;
  }
  if (err instanceof Error) {
    return new WooError({ message: err.message, cause: err });
  }
  return new WooError({ message: String(err), cause: err });
}
