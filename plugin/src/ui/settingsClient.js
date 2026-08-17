// Writes settings back to the tray.
//
// The tray stays the source of truth (spec 1's decision), so the UI never
// touches settings.json itself -- it asks the tray, which persists and then
// republishes through config.json on its next tick. This reuses the transport
// the check-in already proved: same port, same token, same CORS.

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
        // A thrown fetch means nothing is listening. Anything else is a real
        // response and must be reported by status, not treated as "down".
        return { ok: false, reason: TRAY_DOWN };
      }

      if (res.ok) return { ok: true };

      // The token is per tray process, so a restart invalidates it while
      // config.json on disk already holds the new one. Refresh once -- never
      // in a loop, which would hammer the tray on a genuinely wrong token.
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
