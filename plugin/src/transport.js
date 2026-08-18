














export function makeTransport({
  port,
  token,
  fetchImpl = fetch,
  dataStore = null,
  reloadConfig = null,
  pluginBuild = '',
}) {
  let currentToken = token;
  let refreshed = false;
  const loadedBuild = pluginBuild;

  async function viaLocalhost(host) {
    return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, host, plugin_build: loadedBuild }),
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
