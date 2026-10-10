import type { FetchLike } from '../lcu';

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type HttpFetch = (url: string, init?: RequestInit) => Promise<HttpResponseLike | null | undefined>;

export interface ProxyFetchOptions {
  port?: number;
  token?: string;
  fetchImpl?: FetchLike;
}

interface ProxyPayload {
  status?: number | string;
  text?: string;
}

export function makeProxyFetch({ port, token, fetchImpl = globalThis.fetch }: ProxyFetchOptions = {}): HttpFetch {
  return async function proxyFetch(url: string, options: RequestInit = {}): Promise<HttpResponseLike | null> {
    if (!port || !token || typeof fetchImpl !== 'function') {
      return typeof fetchImpl === 'function' ? fetchImpl(url, options) : null;
    }

    try {
      const method = (options?.method || 'GET').toUpperCase();
      let bodyJson: unknown = null;
      if (options?.body) {
        if (typeof options.body === 'string') {
          try {
            bodyJson = JSON.parse(options.body);
          } catch {
            bodyJson = options.body;
          }
        } else {
          bodyJson = options.body;
        }
      }

      const headersObj: Record<string, string> = {};
      if (options?.headers) {
        const headers = options.headers as Headers | Record<string, string>;
        if (typeof (headers as Headers).forEach === 'function') {
          (headers as Headers).forEach((v, k) => {
            headersObj[k] = v;
          });
        } else if (typeof headers === 'object') {
          Object.assign(headersObj, headers);
        }
      }

      const res = await fetchImpl(`http://127.0.0.1:${port}/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          url: String(url),
          method,
          body: bodyJson,
          headers: headersObj,
        }),
        signal: options?.signal,
      });

      if (!res || !res.ok) {
        // Fallback to direct fetch if proxy endpoint returned error (e.g. 404 on old daemon)
        return fetchImpl(url, options);
      }

      const data = (await res.json()) as ProxyPayload | null;
      const status = Number(data?.status) || 500;
      const textVal = String(data?.text || '');

      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => textVal,
        json: async () => {
          try {
            return JSON.parse(textVal) as unknown;
          } catch {
            return {};
          }
        },
      };
    } catch {
      // Fallback to direct fetch on network error reaching local daemon
      return fetchImpl(url, options);
    }
  };
}
