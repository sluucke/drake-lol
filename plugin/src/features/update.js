const TRAY_DOWN = 'the Drake tray is not running';


export function makeUpdater({ port, token, fetchImpl = fetch, reloadConfig }) {
  let currentToken = token;

  async function post(path) {
    return fetchImpl(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken }),
    });
  }

  async function withRetry(run) {
    let res;
    try {
      res = await run();
    } catch {
      return { ok: false, reason: TRAY_DOWN };
    }

    if (res.status !== 401 || !reloadConfig) {
      return { res };
    }

    const cfg = await reloadConfig();
    if (!cfg?.token) {
      return { res };
    }
    currentToken = cfg.token;
    try {
      return { res: await run() };
    } catch {
      return { ok: false, reason: TRAY_DOWN };
    }
  }

  return {
    async check() {
      const out = await withRetry(() => post('/update/check'));
      if (out.ok === false) return out;
      const { res } = out;
      if (res.status === 409) {
        return { ok: false, reason: 'an update is already in progress' };
      }
      if (!res.ok) {
        return { ok: false, reason: `could not check for updates (${res.status})` };
      }
      const body = await res.json();
      return { ok: true, ...body };
    },

    async apply() {
      const out = await withRetry(() => post('/update/apply'));
      if (out.ok === false) return out;
      const { res } = out;
      if (res.status === 409) {
        return { ok: false, reason: 'an update is already in progress' };
      }
      if (res.status === 204 || res.ok) {
        return { ok: true, installing: true };
      }
      return { ok: false, reason: `could not install the update (${res.status})` };
    },
  };
}
