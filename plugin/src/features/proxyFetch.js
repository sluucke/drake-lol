export function makeProxyFetch({ port, token, fetchImpl = globalThis.fetch } = {}) {
  return async function proxyFetch(url, options = {}) {
    if (!port || !token || typeof fetchImpl !== 'function') {
      return typeof fetchImpl === 'function' ? fetchImpl(url, options) : null;
    }

    try {
      const method = (options?.method || 'GET').toUpperCase();
      let bodyJson = null;
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

      const headersObj = {};
      if (options?.headers) {
        if (typeof options.headers.forEach === 'function') {
          options.headers.forEach((v, k) => {
            headersObj[k] = v;
          });
        } else if (typeof options.headers === 'object') {
          Object.assign(headersObj, options.headers);
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

      const data = await res.json();
      const status = Number(data?.status) || 500;
      const textVal = String(data?.text || '');

      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => textVal,
        json: async () => {
          try {
            return JSON.parse(textVal);
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
