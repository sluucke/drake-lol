(() => {
  // src/config.js
  async function loadConfig(fetchImpl = fetch) {
    try {
      const res = await fetchImpl(`https://plugins/Drake/config.json?t=${Date.now()}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // src/transport.js
  function makeTransport({ port, token, fetchImpl = fetch, dataStore = null }) {
    async function viaLocalhost(host) {
      return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, host })
      });
    }
    function viaDataStore(host) {
      if (!dataStore) return false;
      dataStore.set("drake_checkin", JSON.stringify({ host, at: Date.now() }));
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
        console.log("[Drake] check-in rejected, status", res.status);
        return false;
      }
    };
  }

  // src/index.js
  var TAG = "[Drake]";
  async function start() {
    const cfg = await loadConfig();
    if (!cfg) {
      console.log(TAG, "no config.json found; the tray app may not be running");
      return;
    }
    const transport = makeTransport({
      port: cfg.port,
      token: cfg.token,
      dataStore: typeof DataStore !== "undefined" ? DataStore : null
    });
    const host = typeof Pengu !== "undefined" && Pengu.version ? `pengu ${Pengu.version}` : "unknown";
    const ok = await transport.checkIn(host);
    console.log(TAG, "check-in", ok ? "ok" : "failed", "| settings", JSON.stringify(cfg.settings));
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
