// Two write paths behind one interface, so the choice never leaks into
// feature code. Which one is primary was measured in Task 1.
//
// The fallback exists for one reason only: the localhost transport being
// UNREACHABLE (a thrown fetch error), in case a future Chromium policy blocks
// it. A response that comes back with a non-2xx status is the tray working
// correctly and saying "no". That must not be silently upgraded to "yes" by
// falling through to DataStore.
//
// A 401 is the one non-2xx worth acting on rather than just reporting: the
// token is generated per tray process, so restarting the tray invalidates the
// one we booted with while config.json on disk already holds the new one.
// Observed live -- without the refresh below, the plugin posts a dead token
// every 5 seconds for the rest of the session and the tray concludes the
// client is uninjected.
export function makeTransport({
  port,
  token,
  fetchImpl = fetch,
  dataStore = null,
  reloadConfig = null,
}) {
  let currentToken = token;
  // One refresh per transport, not one per beat: a token that is still wrong
  // after re-reading config.json is genuinely wrong, and re-reading the file
  // every 5 seconds would not make it right.
  let refreshed = false;

  async function viaLocalhost(host) {
    // Let a thrown error (network/transport failure) propagate to the
    // caller, which treats it as "unreachable" and falls back.
    return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, host }),
    });
  }

  function viaDataStore(host) {
    if (!dataStore) return false;
    dataStore.set('drake_checkin', JSON.stringify({ host, at: Date.now() }));
    return true;
  }

  return {
    async checkIn(host) {
      let res;
      try {
        res = await viaLocalhost(host);
      } catch {
        // Transport unavailable — fall back to DataStore.
        return viaDataStore(host);
      }
      if (res.ok) return true;

      if (res.status === 401 && reloadConfig && !refreshed) {
        refreshed = true;
        const cfg = await loadFreshToken(reloadConfig);
        if (cfg) {
          currentToken = cfg;
          try {
            const retry = await viaLocalhost(host);
            if (retry.ok) return true;
            console.log('[Drake] check-in rejected after refreshing the token, status', retry.status);
            return false;
          } catch {
            return viaDataStore(host);
          }
        }
      }

      // The tray answered and rejected the check-in. That is a real "no",
      // not an unreachable transport — do not fall back.
      console.log('[Drake] check-in rejected, status', res.status);
      return false;
    },
  };
}

async function loadFreshToken(reloadConfig) {
  try {
    const cfg = await reloadConfig();
    return cfg && cfg.token ? cfg.token : null;
  } catch {
    return null;
  }
}
