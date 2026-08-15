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

  // src/autoAccept.js
  function shouldAccept(payload) {
    if (!payload) return false;
    return payload.state === "InProgress" && payload.playerResponse === "None";
  }
  function startAutoAccept({ enabled, lcu: lcu2, subscribe: subscribe2 }) {
    if (!enabled) return () => {
    };
    return subscribe2("/lol-matchmaking/v1/ready-check", async (payload) => {
      if (!shouldAccept(payload)) return;
      await lcu2.post("/lol-matchmaking/v1/ready-check/accept");
    });
  }

  // src/subscribe.js
  var DEFAULT_POLL_INTERVAL_MS = 1e3;
  function subscribe(route, handler, { fetchImpl = fetch, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
    if (typeof socket !== "undefined" && socket && typeof socket.observe === "function") {
      const observer = (message) => handler(message && message.data);
      socket.observe(route, observer);
      return () => {
        if (typeof socket !== "undefined" && socket && typeof socket.unobserve === "function") {
          socket.unobserve(route, observer);
        }
      };
    }
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetchImpl(route);
        if (!res.ok) return;
        const payload = await res.json();
        if (!stopped) handler(payload);
      } catch {
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }

  // src/index.js
  var TAG = "[Drake]";
  var lcu = {
    post: (route) => fetch(route, { method: "POST" }),
    get: (route) => fetch(route).then((r) => r.json())
  };
  function wireFeatures(cfg) {
    startAutoAccept({ enabled: !!cfg.settings.auto_accept, lcu, subscribe });
  }
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
    wireFeatures(cfg);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
