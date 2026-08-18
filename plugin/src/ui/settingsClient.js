






const TRAY_DOWN = 'the Drake tray is not running';

export function makeSettingsClient({ port, token, fetchImpl = fetch, reloadConfig }) {
  let currentToken = token;

  async function post(settings) {
    return fetchImpl(`http://127.0.0.1:${port}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, settings }),
    });
  }

  return {
    async save(settings) {
      let res;
      try {
        res = await post(settings);
      } catch {
        
        
        return { ok: false, reason: TRAY_DOWN };
      }

      if (res.ok) return { ok: true };

      
      
      
      if (res.status === 401 && reloadConfig) {
        const cfg = await reloadConfig();
        if (cfg && cfg.token) {
          currentToken = cfg.token;
          try {
            const retry = await post(settings);
            if (retry.ok) return { ok: true };
            return { ok: false, reason: `the tray rejected the change (${retry.status})` };
          } catch {
            return { ok: false, reason: TRAY_DOWN };
          }
        }
      }

      return { ok: false, reason: `the tray rejected the change (${res.status})` };
    },
  };
}
