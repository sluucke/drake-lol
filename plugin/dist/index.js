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

  // src/lcu.js
  function makeLcu(fetchImpl = fetch) {
    const send = (method) => (route, body) => fetchImpl(route, {
      method,
      ...body === void 0 ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    });
    return {
      get: (route) => fetchImpl(route).then((r) => r.json()),
      post: send("POST"),
      put: send("PUT"),
      patch: send("PATCH"),
      delete: send("DELETE")
    };
  }

  // src/transport.js
  function makeTransport({
    port,
    token,
    fetchImpl = fetch,
    dataStore = null,
    reloadConfig = null,
    pluginBuild = ""
  }) {
    let currentToken = token;
    let refreshed = false;
    const loadedBuild = pluginBuild;
    async function viaLocalhost(host) {
      return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken, host, plugin_build: loadedBuild })
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
        if (res.status === 401 && reloadConfig && !refreshed) {
          refreshed = true;
          const cfg = await loadFreshToken(reloadConfig);
          if (cfg) {
            currentToken = cfg;
            try {
              const retry = await viaLocalhost(host);
              if (retry.ok) return true;
              console.log("[Drake] check-in rejected after refreshing the token, status", retry.status);
              return false;
            } catch {
              return viaDataStore(host);
            }
          }
        }
        console.log("[Drake] check-in rejected, status", res.status);
        return false;
      }
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

  // src/buildId.js
  var PLUGIN_BUILD = "__DRAKE_BUILD__";

  // src/features/champSelect.js
  var SESSION_ROUTE = "/lol-champ-select/v1/session";
  function actionRoute(actionId) {
    return `/lol-champ-select/v1/session/actions/${actionId}`;
  }
  function actionCompleteRoute(actionId) {
    return `/lol-champ-select/v1/session/actions/${actionId}/complete`;
  }
  function eachAction(session) {
    const phases = session && session.actions || [];
    return phases.flat ? phases.flat() : [].concat(...phases);
  }
  function findMyQueuedAction(session, type) {
    if (!session || session.localPlayerCellId === void 0) return null;
    for (const a of eachAction(session)) {
      if (a.type !== type) continue;
      if (a.actorCellId !== session.localPlayerCellId) continue;
      if (a.completed) continue;
      return a;
    }
    return null;
  }
  function findMyAction(session, type) {
    const action = findMyQueuedAction(session, type);
    if (!action || !action.isInProgress) return null;
    return action;
  }
  function isPlanningPhase(session) {
    return String(session?.timer?.phase || "") === "PLANNING";
  }
  function unavailableChampionIds(session) {
    const ids = /* @__PURE__ */ new Set();
    if (!session) return ids;
    const bans = session.bans || {};
    for (const id of bans.myTeamBans || []) if (id) ids.add(id);
    for (const id of bans.theirTeamBans || []) if (id) ids.add(id);
    for (const a of eachAction(session)) {
      if (a.completed && a.championId) ids.add(a.championId);
    }
    return ids;
  }
  function accepted(res) {
    if (!res) return true;
    if (typeof res.ok === "boolean") return res.ok;
    return res.ok !== false;
  }
  function makeChampSelect({ lcu: lcu2 }) {
    return {
      async getSession() {
        return lcu2.get(SESSION_ROUTE);
      },
      async commit(actionId, championId, completed, type = "pick") {
        try {
          const pick = await lcu2.patch(actionRoute(actionId), { championId });
          if (!accepted(pick)) {
            return { ok: false, reason: `the client refused it (${pick.status})` };
          }
          if (!completed) return { ok: true };
          try {
            await lcu2.post(actionCompleteRoute(actionId));
          } catch {
          }
          const locked = await lcu2.patch(actionRoute(actionId), { championId, completed: true });
          if (!accepted(locked)) {
            return { ok: false, reason: `the client refused it (${locked.status})` };
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: `could not reach the client (${e.message})` };
        }
      }
    };
  }

  // src/features/dodge.js
  var GAMEFLOW_DODGE_ROUTE = "/lol-gameflow/v1/session/dodge";
  var GAMEFLOW_SESSION_ROUTE = "/lol-gameflow/v1/session";
  var GAMEFLOW_PHASE_ROUTE = "/lol-gameflow/v1/gameflow-phase";
  var LCDS_DODGE_BODY = ["", "teambuilder-draft", "quitV2", "{}"];
  var LCDS_DODGE_BODY_LEGACY = ["", "teambuilder-draft", "quitV2", ""];
  var DODGE_POST_TIMEOUT_MS = 4e3;
  var DODGE_VERIFY_DELAY_MS = 400;
  var DODGE_VERIFY_ATTEMPTS = 16;
  var DODGE_VERIFY_INTERVAL_MS = 300;
  var DODGE_VERIFY_STABLE_READS = 2;
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function withTimeout(promise, ms, message = "timed out") {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      Promise.resolve(promise).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
  var DODGE_ATTEMPTS = 5;
  var DEFAULT_DELAY_MS = 250;
  function lcdsDodgeRoute(body = LCDS_DODGE_BODY) {
    const params = new URLSearchParams({
      destination: "lcdsServiceProxy",
      method: "call",
      args: JSON.stringify(body)
    });
    return `/lol-login/v1/session/invoke?${params.toString()}`;
  }
  var DODGE_ROUTE = lcdsDodgeRoute();
  function explain(status) {
    if (status === 404 || status === 400) {
      return "you have to be in champ select to dodge";
    }
    return `the client refused (${status})`;
  }
  async function readJson(res) {
    if (!res || typeof res.json !== "function") return null;
    try {
      return await withTimeout(res.json(), 500, "json timed out");
    } catch {
      return null;
    }
  }
  async function hasChampSelectSession(fetchImpl = fetch) {
    try {
      const res = await fetchImpl(SESSION_ROUTE);
      return res.ok;
    } catch {
      return false;
    }
  }
  async function readGameflowPhase(fetchImpl = fetch) {
    try {
      const res = await fetchImpl(GAMEFLOW_PHASE_ROUTE);
      if (!res.ok) return null;
      const body = await readJson(res);
      if (typeof body === "string") return body;
      return body?.phase ?? null;
    } catch {
      return null;
    }
  }
  async function readGameflowSession(fetchImpl = fetch) {
    try {
      const res = await fetchImpl(GAMEFLOW_SESSION_ROUTE);
      if (!res.ok) return null;
      return readJson(res);
    } catch {
      return null;
    }
  }
  function buildGameflowDodgeBody(session) {
    const dodge = session?.gameDodge;
    if (!dodge || typeof dodge !== "object") return null;
    return {
      dodgeData: dodge,
      state: dodge.state ?? "Invalid",
      dodgeIds: dodge.dodgeIds ?? [],
      phase: session.phase ?? dodge.phase ?? "ChampSelect"
    };
  }
  async function leftChampSelect(fetchImpl = fetch) {
    if (await hasChampSelectSession(fetchImpl)) return false;
    const phase = await readGameflowPhase(fetchImpl);
    if (!phase) return true;
    return phase !== "ChampSelect" && phase !== "ReadyCheck";
  }
  async function waitForChampSelectExit(fetchImpl = fetch, {
    attempts = DODGE_VERIFY_ATTEMPTS,
    delayMs = DODGE_VERIFY_INTERVAL_MS,
    stableReads = DODGE_VERIFY_STABLE_READS
  } = {}) {
    let stable = 0;
    for (let i = 0; i < attempts; i += 1) {
      if (await leftChampSelect(fetchImpl)) {
        stable += 1;
        if (stable >= stableReads) return true;
      } else {
        stable = 0;
      }
      if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
    }
    return false;
  }
  function postAccepted(res) {
    return !res || res.ok !== false;
  }
  async function readResponseHint(res) {
    if (!res || typeof res.text !== "function") return "";
    try {
      const text = await withTimeout(res.text(), 500, "");
      if (!text) return "";
      return text.length > 120 ? `${text.slice(0, 120)}\u2026` : text;
    } catch {
      return "";
    }
  }
  function postLcdsDodge(fetchImpl = fetch, body = LCDS_DODGE_BODY) {
    return fetchImpl(lcdsDodgeRoute(body), {
      method: "POST",
      body: JSON.stringify(body)
    });
  }
  async function postGameflowDodge(fetchImpl = fetch) {
    const session = await readGameflowSession(fetchImpl);
    const payload = buildGameflowDodgeBody(session);
    if (!payload) return null;
    return fetchImpl(GAMEFLOW_DODGE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
  function dodgeSteps(fetchImpl = fetch) {
    return [
      {
        name: "lcds",
        run: () => postLcdsDodge(fetchImpl, LCDS_DODGE_BODY)
      },
      {
        name: "gameflow",
        run: async () => {
          const res = await postGameflowDodge(fetchImpl);
          if (res) return res;
          return { ok: false, status: 400 };
        }
      },
      {
        name: "lcds-legacy",
        run: () => postLcdsDodge(fetchImpl, LCDS_DODGE_BODY_LEGACY)
      }
    ];
  }
  function makeDodge({
    fetchImpl = fetch,
    steps = dodgeSteps(fetchImpl),
    attempts = DODGE_ATTEMPTS,
    delayMs = DEFAULT_DELAY_MS,
    postTimeoutMs = DODGE_POST_TIMEOUT_MS,
    onStatus = () => {
    }
  }) {
    return {
      async dodge() {
        let reason = "still in champ select";
        for (let i = 0; i < attempts; i += 1) {
          let accepted3 = false;
          for (const step of steps) {
            try {
              onStatus(`attempt ${i + 1}: ${step.name}\u2026`);
              const res = await withTimeout(step.run(), postTimeoutMs, "post timed out");
              const httpStatus = res?.status || 0;
              const hint = await readResponseHint(res);
              if (!postAccepted(res)) {
                reason = explain(httpStatus);
                onStatus(`attempt ${i + 1}: ${step.name} HTTP ${httpStatus}${hint ? ` (${hint})` : ""}`);
                continue;
              }
              accepted3 = true;
              onStatus(
                `attempt ${i + 1}: ${step.name} HTTP ${httpStatus || 200}${hint ? ` (${hint})` : ""}`
              );
            } catch (e) {
              reason = e.message === "post timed out" ? "the client did not respond in time" : `could not reach the client (${e.message})`;
              onStatus(`attempt ${i + 1}: ${step.name} ${reason}`);
            }
          }
          if (!accepted3) {
            if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
            continue;
          }
          onStatus(`attempt ${i + 1}: waiting\u2026`);
          if (DODGE_VERIFY_DELAY_MS > 0) await sleep(DODGE_VERIFY_DELAY_MS);
          if (await waitForChampSelectExit(fetchImpl)) {
            return { ok: true, detail: `left on attempt ${i + 1}` };
          }
          reason = "still in champ select after the dodge call";
          onStatus(`attempt ${i + 1}: still in champ select`);
          if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
        }
        onStatus(`failed: ${reason}`);
        return { ok: false, reason };
      }
    };
  }

  // src/features/inGameIdle.js
  var IN_GAME_PHASES = /* @__PURE__ */ new Set(["GameStart", "InProgress", "Reconnect"]);
  function readGameflowPhase2(payload) {
    if (payload == null) return "";
    if (typeof payload === "string") return payload.replace(/^"+|"+$/g, "");
    const raw = payload.phase ?? payload.data;
    return typeof raw === "string" ? raw.replace(/^"+|"+$/g, "") : "";
  }
  function isInGamePhase(phase) {
    return IN_GAME_PHASES.has(String(phase || "").trim());
  }
  function isChampSelectPhase(phase) {
    return String(phase || "").trim() === "ChampSelect";
  }
  function startInGameIdle({ subscribe: subscribe2, onChange }) {
    let idle = false;
    const unsubscribe = subscribe2(GAMEFLOW_PHASE_ROUTE, (payload) => {
      const phase = readGameflowPhase2(payload);
      if (!phase) return;
      const next = isInGamePhase(phase);
      if (next === idle) return;
      idle = next;
      if (typeof onChange === "function") onChange(idle);
    });
    return {
      stop() {
        if (typeof unsubscribe === "function") unsubscribe();
      }
    };
  }

  // src/autoAccept.js
  var ACCEPT_ROUTE = "/lol-matchmaking/v1/ready-check/accept";
  var DECLINE_ROUTE = "/lol-matchmaking/v1/ready-check/decline";
  function shouldAccept(payload) {
    if (!payload) return false;
    return payload.state === "InProgress" && payload.playerResponse === "None";
  }
  function canCancel(payload) {
    if (!payload) return false;
    return payload.state === "InProgress" && payload.playerResponse === "Accepted";
  }
  function startAutoAccept({
    enabled,
    delayMs = 0,
    lcu: lcu2,
    subscribe: subscribe2,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    onState
  }) {
    if (!enabled && !onState) return () => {
    };
    let pending = null;
    let unsubscribeReadyCheck = null;
    const cancelPending = () => {
      if (pending !== null) {
        clearTimeoutImpl(pending);
        pending = null;
      }
    };
    const stopReadyCheck = () => {
      cancelPending();
      if (typeof unsubscribeReadyCheck === "function") {
        unsubscribeReadyCheck();
        unsubscribeReadyCheck = null;
      }
    };
    const startReadyCheck = () => {
      if (unsubscribeReadyCheck) return;
      unsubscribeReadyCheck = subscribe2("/lol-matchmaking/v1/ready-check", async (payload) => {
        if (onState) onState(payload);
        if (!shouldAccept(payload)) {
          cancelPending();
          return;
        }
        if (!enabled || pending !== null) return;
        if (delayMs > 0) {
          pending = setTimeoutImpl(() => {
            pending = null;
            lcu2.post(ACCEPT_ROUTE);
          }, delayMs);
          return;
        }
        await lcu2.post(ACCEPT_ROUTE);
      });
    };
    const unsubscribePhase = subscribe2(GAMEFLOW_PHASE_ROUTE, (payload) => {
      const phase = readGameflowPhase2(payload);
      if (phase === "Lobby") {
        startReadyCheck();
      } else {
        if (unsubscribeReadyCheck) {
          if (onState) onState(null);
          stopReadyCheck();
        }
      }
    });
    return () => {
      stopReadyCheck();
      if (typeof unsubscribePhase === "function") unsubscribePhase();
    };
  }

  // src/subscribe.js
  var DEFAULT_POLL_INTERVAL_MS = 1e3;
  function subscribe(route, handler, { fetchImpl = fetch, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
    const push = typeof socket !== "undefined" && socket && typeof socket.observe === "function";
    let stopped = false;
    let idle = false;
    let seen = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetchImpl(route);
        if (!res.ok) {
          if (!idle) {
            idle = true;
            if (!stopped) handler(null);
          }
          return;
        }
        const payload = await res.json();
        if (stopped) return;
        const reentered = idle;
        idle = false;
        if (push && seen && !reentered) return;
        seen = true;
        handler(payload);
      } catch {
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    let unobserve = () => {
    };
    if (push) {
      const observer = (message) => {
        if (stopped) return;
        if (!message || message.eventType === "Delete" || message.data == null) {
          idle = true;
          handler(null);
          return;
        }
        idle = false;
        seen = true;
        handler(message.data);
      };
      socket.observe(route, observer);
      unobserve = () => {
        if (typeof socket !== "undefined" && socket && typeof socket.unobserve === "function") {
          socket.unobserve(route, observer);
        }
      };
    }
    return () => {
      stopped = true;
      clearInterval(id);
      unobserve();
    };
  }

  // src/heartbeat.js
  var HEARTBEAT_INTERVAL_MS = 5e3;
  async function startHeartbeat({
    checkIn,
    host,
    intervalMs = HEARTBEAT_INTERVAL_MS,
    setIntervalImpl = setInterval
  }) {
    const beat = async () => {
      try {
        return await checkIn(host);
      } catch {
        return false;
      }
    };
    const first = await beat();
    setIntervalImpl(beat, intervalMs);
    return first;
  }

  // src/ui/hotkey.js
  var TEXT_ENTRY_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA"]);
  function isTextEntry(target) {
    if (!target) return false;
    return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable === true;
  }
  function matchesToggle(event) {
    if (!event.ctrlKey) return false;
    if (event.shiftKey) return false;
    if (event.key !== "d" && event.key !== "D") return false;
    return !isTextEntry(event.target);
  }
  function matchesTeamRevealCardsToggle(event) {
    if (!event.ctrlKey) return false;
    if (!event.shiftKey) return false;
    if (event.key !== "d" && event.key !== "D" && event.code !== "KeyD") return false;
    return true;
  }
  function matchesClose(event) {
    return event.key === "Escape";
  }

  // src/ui/mount.js
  var HOST_ID = "drake-ui-host";
  var SENTINEL = "__drakeUIMounted";
  function mountUI({ doc, win, render, onOpenChange, onMount, onTeamRevealCardsToggle, isIdle }) {
    if (win[SENTINEL]) return win[SENTINEL];
    const ui2 = createUI({ doc, win, render, onOpenChange, onMount, onTeamRevealCardsToggle, isIdle });
    win[SENTINEL] = ui2;
    return ui2;
  }
  function createUI({ doc, win, render, onOpenChange, onMount, onTeamRevealCardsToggle, isIdle }) {
    let host = null;
    let open = false;
    const api = {
      isOpen: () => open,
      toggle: () => setOpen(!open),
      open: () => setOpen(true),
      close: () => setOpen(false),
      host: () => host
    };
    function setOpen(next) {
      if (next === open) return;
      open = next;
      if (onOpenChange) onOpenChange(open);
    }
    function hostCss() {
      return "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    }
    function attach() {
      host = doc.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = hostCss();
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = render();
      doc.documentElement.appendChild(host);
      if (onMount) onMount(shadow, api);
    }
    function build() {
      attach();
      const observer = new MutationObserver(() => {
        if (host && host.parentNode === null) {
          doc.documentElement.appendChild(host);
        }
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
    win.addEventListener(
      "keydown",
      (event) => {
        if (isIdle && isIdle()) return;
        if (event.repeat) return;
        if (matchesToggle(event)) {
          event.preventDefault();
          api.toggle();
        } else if (matchesTeamRevealCardsToggle(event)) {
          event.preventDefault();
          if (onTeamRevealCardsToggle) onTeamRevealCardsToggle();
        } else if (open && matchesClose(event)) {
          event.preventDefault();
          api.close();
        }
      },
      true
    );
    if (doc.body) build();
    else doc.addEventListener("load", build, { once: true });
    return api;
  }

  // src/ui/assets.js
  var DRAKE_ICON = "data:image/png;base64,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";
  var CHECKBOX_SPRITE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAA4CAYAAADNa8lhAAADWElEQVR42uWV20uTYRzH7aB5mKdt7uw2py7NFYSFXWiGV9JVdBVhNjSpKLzQojwQpqFNd/B1c3u3JVuhpsORbgpdqGkHNUWLxH/AIKMr6x94+/3mQ++QDfdWFNTgw/Nj+372vM/YwzduX7JAC5zhiDYOh7sXCxguoPNDhHWKMAkEoxFJRMEFOAE6DAdC5kAkMYgSCdmBfsAGWBEyj0cTHSiQIAX0AhaEzP5IYoDsZCUhM2DchS+a2A9QROoBugEDQuaRaKKN7GYkwYdAF0Lmp5HECfKYFiIaiNBJ6PrtYgB4BowBoxgChoEhwnBEkQNE/Nk/+d+5HU1VhTHfDsiyYsulImZ/inDqQIrQfYCX5QKcAL0byAQgy4r39DoGPpiMTxO5ADo+TewA7EB/OAdTReOQZcW2mmMMCMHEDAmdmCm1J2VKbcl8aV8yX0aFcyhd7IcsK3bUHWcS0iXBZIGc5gkVttSs7L40UXZvmkhpThfvgHMSXzoGWVbsvFbMJGZIgxB2ZEhUVr40hxLINGahXGMSKnKNCM7wpT7IsqLhxkkmiS8LgkQLZDnWLEUuJVbmmSWqfKNEpQ2Bc7pI6YMsKxrrTzEpfHkQdqJBskqU+ZRMrTXLcwqMCs0OOGdKVD7IsiLVWMrwhPJJoUJDS1R5NrnmMJWdV2BW5heaVNojRgRnvkztgywrOlsqUJyCMwYzxMrxTKnaD488JpDn+IQEnPE9yLKit72S4cCfvR2YTYiDF6fboT+b54W8Gj2u3TGyOnq+bsVTwePUHZ0NpSvLA+XMkrtUH3N3dDWUvQWBmegpMeI5Y+oOQ2PZIkp39EVrcE4P/kjhYoAvlrrrq09Mh3eH4VbZG5Rar+heRu2O6xeOzqwNVTIPbhYvYHd03z79OiTV6ub27A4IhXbwd5du4tpSq5uNuTuaa3TzKDXV6GY4d0d5idr7n3bHr98Ort0x8mXzfd3XrXUep+5w0ZaV7a11ZvvTB33M3eF29i6DwGysTpPbEUN3eB5Zl1CiLJ1rV88VktsR1h3y3MKBjvbWmfDueOKxL6DktJteRe2O+23Ns98+bzDeAesSdsfgY0dIctPm+T27w+UwhcLvFp9/xNXlMM/F3B0ueCyUYH3BuTuqL1cN/iPd8R08MkxnZo2Q0QAAAABJRU5ErkJggg==";
  var HASHTAG = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNOS4wMDAwMyA0SDcuMDAwMDNMNy4wMDAwMiA3LjAwMDAxTDQgN1Y5TDcuMDAwMDIgOS4wMDAwMUw3LjAwMDAyIDExTDQgMTFWMTNMNy4wMDAwMSAxM0w3LjAwMDAxIDE2SDkuMDAwMDFMOS4wMDAwMSAxM0wxMSAxM0wxMSAxNkgxM0wxMyAxM0wxNiAxM1YxMUwxMyAxMUwxMyA5LjAwMDAyTDE2IDkuMDAwMDJWNy4wMDAwMkwxMyA3LjAwMDAyTDEzIDRIMTFMMTEgNy4wMDAwMUw5LjAwMDAyIDcuMDAwMDFMOS4wMDAwMyA0Wk0xMSAxMUwxMSA5LjAwMDAxTDkuMDAwMDIgOS4wMDAwMUw5LjAwMDAyIDExTDExIDExWiIgZmlsbD0iI2NkYmU5MSIvPg0KPC9zdmc+DQo=";
  var RANK_ICONS = {
    IRON: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTQuOTY3NiAtNi4zNjUzIDMxLjU3NjYgMzEuNTc2NiI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC00LjE2NjcgMC4wMDAwKSBzY2FsZSgxLjY2NjY2NykiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNS4wOTE2OSA3LjI4NzEzQzUuMDkxNzQgNi43MDk1IDUuMjIxMzkgNi4xMzkxIDUuNDcxMjggNS42MTcxMkM1LjcyMTE3IDUuMDk1MTQgNi4wODUwNSA0LjYzNDYxIDYuNTM2NjQgNC4yNjg4MUM0LjYxMjM1IDMuNTk3MzEgMS44MTI0MyAyLjI1OTQ1IDAuOTk5MTA5IDBDMC45OTkxMDkgMCAwLjgyNjA2MiAyLjI4ODU4IDIuMjEwNDQgNC44NDk1MkMyLjIxMDQ0IDQuODQ5NTIgMy42ODMwOCA1LjgwNTM4IDQuMjcxNDQgNy4wOTM1NkwzLjEyNzYgNi4zOTQ2NUMzLjQxNjY2IDcuMzEzMSAzLjc3MTE0IDguMjEwMTEgNC4xODgzOCA5LjA3ODkzQzQuODUyODggMTAuMzQ0OCA2LjA5MTkxIDExLjMwNTggNi4wOTE5MSAxMS4zMDU4QzYuMDkxOTEgMTEuMzA1OCA1LjUxNTY2IDkuNTkyODMgNi4xOTA1NCAxMC4wMDRDNi4yMTM4MiAxMC4wMTc2IDYuMjM2MzUgMTAuMDMyNSA2LjI1ODAzIDEwLjA0ODVDNS44ODc4OCA5LjY4NjI2IDUuNTk0MDMgOS4yNTQ5IDUuMzkzNTIgOC43Nzk0MkM1LjE5MzAyIDguMzAzOTUgNS4wODk4MyA3Ljc5MzggNS4wODk5NiA3LjI3ODU2TDUuMDkxNjkgNy4yODcxM1pNMTEuNTEyMyA0LjI1MTY4QzExLjkzNDMgNC41ODkxNCAxMi4yODEyIDUuMDA5MjggMTIuNTMxNCA1LjQ4NTc0QzEyLjc4MTYgNS45NjIyMSAxMi45Mjk2IDYuNDg0NzIgMTIuOTY2MiA3LjAyMDQ5QzEzLjAwMjggNy41NTYyNiAxMi45MjcxIDguMDkzNzMgMTIuNzQzOSA4LjU5OTE4QzEyLjU2MDcgOS4xMDQ2MiAxMi4yNzM5IDkuNTY3MTQgMTEuOTAxNiA5Ljk1NzdDMTIuNDAxNyA5LjgwMTgyIDExLjkwMTYgMTEuMzA3NiAxMS45MDE2IDExLjMwNzZDMTEuOTAxNiAxMS4zMDc2IDEzLjE0MDcgMTAuMzQzMSAxMy44MDUyIDkuMDgwNjRDMTQuMjIwMyA4LjIxMTU1IDE0LjU3MzEgNy4zMTQ1NyAxNC44NjA4IDYuMzk2MzZMMTMuNzI1NiA3LjA4MTU3QzE0LjMyNDMgNS44MDE5NSAxNS43ODMxIDQuODQ5NTIgMTUuNzgzMSA0Ljg0OTUyQzE3LjE1ODggMi4yODg1OCAxNi45OTQ0IDAgMTYuOTk0NCAwQzE2LjE5MzIgMi4yMzg5IDEzLjQzNDggMy41NzMzMyAxMS41MTIzIDQuMjUxNjhaTTExLjcyNjkgNy4yODcxMkMxMS43MjY5IDguNzU4MjYgMTAuNTIyMSA5Ljk1MDg0IDkuMDM1OTggOS45NTA4NEM3LjU0OTg0IDkuOTUwODQgNi4zNDUwOSA4Ljc1ODI2IDYuMzQ1MDkgNy4yODcxMkM2LjM0NTA5IDUuODE1OTkgNy41NDk4NCA0LjYyMzQgOS4wMzU5OCA0LjYyMzRDMTAuNTIyMSA0LjYyMzQgMTEuNzI2OSA1LjgxNTk5IDExLjcyNjkgNy4yODcxMloiIGZpbGw9IiM1MTQ4NEEiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    BRONZE: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTUuODAyMCAtNi4zNzM0IDMxLjU5MjggMzEuNTkyOCI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01LjAwMDAgMC4wMDAwKSBzY2FsZSgxLjY2NjY2NykiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNS4wOTEyNSA3LjI4NzEzQzUuMDkxNDIgNi43MDk1MiA1LjIyMTExIDYuMTM5MTYgNS40NzA5NiA1LjYxNzJDNS43MjA4MSA1LjA5NTIzIDYuMDg0NTkgNC42MzQ2OSA2LjUzNjA0IDQuMjY4ODFDNC42MTE5NiAzLjU5NzMxIDEuODEyMzUgMi4yNTk0NSAwLjk5OTEwOSAwQzAuOTk5MTA5IDAgMC44MjYwOCAyLjI4ODU4IDIuMjEwMzEgNC44NDk1MkMyLjIxMDMxIDQuODQ5NTIgMy42ODI3OSA1LjgwNTM4IDQuMjcxMDkgNy4wOTM1NkwzLjEyNzM3IDYuMzk0NjVDMy40MTYzOSA3LjMxMzEgMy43NzA4NCA4LjIxMDExIDQuMTg4MDQgOS4wNzg5M0M0Ljg1MjQ3IDEwLjM0NjYgNi4wOTEzNiAxMS4zMDU4IDYuMDkxMzYgMTEuMzA1OEM2LjA5MTM2IDExLjMwNTggNS41MTUxNyA5LjU5MjgzIDYuMTkxNzEgMTAuMDA0TDYuMjU3NDYgMTAuMDQ4NUM1Ljg4NzM1IDkuNjg2MjYgNS41OTM1MyA5LjI1NDkgNS4zOTMwNSA4Ljc3OTQyQzUuMTkyNTYgOC4zMDM5NSA1LjA4OTM5IDcuNzkzOCA1LjA4OTUyIDcuMjc4NTZMNS4wOTEyNSA3LjI4NzEzWk0xMS41MTI2IDQuMjUxNjhDMTEuOTcwNSA0LjYxNzIgMTIuMzM5OSA1LjA3OTUzIDEyLjU5MzggNS42MDQ3N0MxMi44NDc2IDYuMTMwMDEgMTIuOTc5NiA2LjcwNDg0IDEyLjk3OTkgNy4yODcxM0MxMi45NzkxIDcuNjM5MDggMTIuOTMwOCA3Ljk4OTM1IDEyLjgzNjMgOC4zMjg2M0MxMi42NjMyIDguOTM5MTIgMTIuMzQxOCA5LjQ5ODQgMTEuOTAwMiA5Ljk1NzdDMTIuNDAwMyA5LjgwMTgyIDExLjkwMDIgMTEuMzA3NiAxMS45MDAyIDExLjMwNzZDMTEuOTAwMiAxMS4zMDc2IDEzLjEzNzQgMTAuMzQ0OCAxMy44MDM1IDkuMDgwNjRDMTQuMjIxMSA4LjIxMjU3IDE0LjU3NTUgNy4zMTYxIDE0Ljg2NDIgNi4zOTgwOEwxMy43MjkxIDcuMDgzMjhDMTQuMzIyNiA1LjgwMTk1IDE1Ljc4MyA0Ljg0OTUyIDE1Ljc4MyA0Ljg0OTUyQzE3LjE2NzIgMi4yODg1OCAxNi45OTQyIDAgMTYuOTk0MiAwQzE2LjE5MzEgMi4yMzg5IDEzLjQzMzIgMy41NzMzMyAxMS41MTI2IDQuMjUxNjhaTTExLjcyNTQgNy4yODcxMkMxMS43MjU0IDguNzU4MjYgMTAuNTIwOCA5Ljk1MDg0IDkuMDM0ODUgOS45NTA4NEM3LjU0ODg3IDkuOTUwODQgNi4zNDQyNCA4Ljc1ODI2IDYuMzQ0MjQgNy4yODcxMkM2LjM0NDI0IDUuODE1OTkgNy41NDg4NyA0LjYyMzQgOS4wMzQ4NSA0LjYyMzRDMTAuNTIwOCA0LjYyMzQgMTEuNzI1NCA1LjgxNTk5IDExLjcyNTQgNy4yODcxMloiIGZpbGw9IiM4QzUxM0EiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    SILVER: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTUuODAyMCAtNi4zNzM0IDMxLjU5MjggMzEuNTkyOCI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01LjAwMDAgMC4wMDAwKSBzY2FsZSgxLjY2NjY2NykiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNS4wOTEyNSA3LjI4NzEzQzUuMDkxNDIgNi43MDk1MiA1LjIyMTExIDYuMTM5MTYgNS40NzA5NiA1LjYxNzJDNS43MjA4MSA1LjA5NTIzIDYuMDg0NTkgNC42MzQ2OSA2LjUzNjA0IDQuMjY4ODFDNC42MTE5NiAzLjU5NzMxIDEuODEyMzUgMi4yNTk0NSAwLjk5OTEwOSAwQzAuOTk5MTA5IDAgMC44MjYwOCAyLjI4ODU4IDIuMjEwMzEgNC44NDk1MkMyLjIxMDMxIDQuODQ5NTIgMy42ODI3OSA1LjgwNTM4IDQuMjcxMDkgNy4wOTM1NkwzLjEyNzM3IDYuMzk0NjVDMy40MTYzOSA3LjMxMzEgMy43NzA4NCA4LjIxMDExIDQuMTg4MDQgOS4wNzg5M0M0Ljg1MjQ3IDEwLjM0NjYgNi4wOTEzNiAxMS4zMDU4IDYuMDkxMzYgMTEuMzA1OEM2LjA5MTM2IDExLjMwNTggNS41MTUxNyA5LjU5MjgzIDYuMTkxNzEgMTAuMDA0TDYuMjU3NDYgMTAuMDQ4NUM1Ljg4NzM1IDkuNjg2MjYgNS41OTM1MyA5LjI1NDkgNS4zOTMwNSA4Ljc3OTQyQzUuMTkyNTYgOC4zMDM5NSA1LjA4OTM5IDcuNzkzOCA1LjA4OTUyIDcuMjc4NTZMNS4wOTEyNSA3LjI4NzEzWk0xMS41MTI2IDQuMjUxNjhDMTEuOTcwMiA0LjYxNzI5IDEyLjMzOTQgNS4wNzk2OCAxMi41OTMgNS42MDQ5M0MxMi44NDY2IDYuMTMwMTcgMTIuOTc4MiA2LjcwNDk2IDEyLjk3ODIgNy4yODcxM0MxMi45NzggNy42MzkgMTIuOTMwMyA3Ljk4OTI3IDEyLjgzNjMgOC4zMjg2M0MxMi42NjMyIDguOTM5MTIgMTIuMzQxOCA5LjQ5ODQgMTEuOTAwMiA5Ljk1NzdDMTIuNDAwMyA5LjgwMTgyIDExLjkwMDIgMTEuMzA3NiAxMS45MDAyIDExLjMwNzZDMTEuOTAwMiAxMS4zMDc2IDEzLjEzNzQgMTAuMzQ0OCAxMy44MDM1IDkuMDgwNjRDMTQuMjIxMSA4LjIxMjU3IDE0LjU3NTUgNy4zMTYxIDE0Ljg2NDIgNi4zOTgwOEwxMy43MjkxIDcuMDgzMjhDMTQuMzIyNiA1LjgwMTk1IDE1Ljc4MyA0Ljg0OTUyIDE1Ljc4MyA0Ljg0OTUyQzE3LjE2NzIgMi4yODg1OCAxNi45OTQyIDAgMTYuOTk0MiAwQzE2LjE5MzEgMi4yMzg5IDEzLjQzMzIgMy41NzMzMyAxMS41MTI2IDQuMjUxNjhaTTExLjcyNTUgNy4yODcxMkMxMS43MjU1IDguNzU4MjYgMTAuNTIwOCA5Ljk1MDg0IDkuMDM0ODUgOS45NTA4NEM3LjU0ODg3IDkuOTUwODQgNi4zNDQyNSA4Ljc1ODI2IDYuMzQ0MjUgNy4yODcxMkM2LjM0NDI1IDUuODE1OTkgNy41NDg4NyA0LjYyMzQgOS4wMzQ4NSA0LjYyMzRDMTAuNTIwOCA0LjYyMzQgMTEuNzI1NSA1LjgxNTk5IDExLjcyNTUgNy4yODcxMloiIGZpbGw9IiM4MDk4OUQiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    GOLD: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTUuMjQ3MCAtNC40ODk0IDI4Ljk3NjAgMjguOTc2MCI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0zLjA3NjkgMC4wMDAwKSBzY2FsZSgxLjUzODQ2MikiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMTAuNzM4OCA0Ljc3NzI5QzExLjI5OTQgNS40NTE2MyAxMS42MDY2IDYuMzEwMDMgMTEuNjA0OCA3LjE5NzFDMTEuNjAzMiA3LjgwNTggMTEuNDU3IDguNDA0ODggMTEuMTc5IDguOTQyMzNDMTAuOTAxIDkuNDc5NzcgMTAuNDk5NiA5LjkzOTMyIDEwLjAwOTYgMTAuMjgxMUM5Ljg5ODUyIDEwLjM1OTUgOS43ODI4NCAxMC40MzA4IDkuNjYzMjUgMTAuNDk0N0M5LjQyNDU4IDEwLjg0NTYgOS4yNTY3MSAxMS4yNDIxIDkuMTY5NTUgMTEuNjYwN0M5LjA4MjM5IDEyLjA3OTQgOS4wNzc3MSAxMi41MTE4IDkuMTU1NzggMTIuOTMyM0M5LjMwMTI3IDExLjg1ODYgMTAuODI3MSAxMC40NTAyIDExLjUwNzggMTAuMDkyM0MxMi4xODg1IDkuNzM0NDIgMTEuNTA3OCAxMS40MDgyIDExLjUwNzggMTEuNDA4MkMxMS41MDc4IDExLjQwODIgMTIuNzc3MyAxMC41Mjg2IDEzLjUxIDkuMzAzNTJDMTMuOTczOCA4LjQ1OTc1IDE0LjM3ODkgNy41ODMzIDE0LjcyMjQgNi42ODA3M0wxMy40NjQ5IDcuMzUzNzlDMTMuNzY5OCA1LjkzNjQ1IDE1LjI2NDUgNC43MjIwOSAxNS4yNjQ1IDQuNzIyMDlDMTUuODg2MyAzLjIzNTQyIDE2LjEyNDkgMS42MDkwOCAxNS45NTczIDBDMTUuMzUxMSAyLjQ2MjU0IDEyLjQxODggNC4wNDkwMyAxMC43Mzg4IDQuNzc3MjlaTTQuNDA0OTcgNy4yNjI5OEM0LjQwMzQ3IDYuMzc1OTggNC43MTA2NCA1LjUxNzY3IDUuMjcwOTYgNC44NDMxOEMzLjU5NDQxIDQuMTE0OTIgMC42NjA0NDEgMi41MjEzIDAuMDU1OTgxMyAwLjA2NTg4NzVDLTAuMTExNjMyIDEuNjc1NTUgMC4xMjY5NjYgMy4zMDI0NiAwLjc0ODc3MiA0Ljc4OTc2QzAuNzQ4NzcyIDQuNzg5NzYgMi4yMjc4OCA2LjAwMjMzIDIuNTMyNzEgNy40MTk2N0wxLjI3MzU2IDYuNzQ4NEMxLjYxOTU5IDcuNjUwNzMgMi4wMjc2NCA4LjUyNjYxIDIuNDk0NiA5LjM2OTQxQzMuMjI3MjMgMTAuNTk0NCA0LjUwMzcgMTEuNDc0IDQuNTAzNyAxMS40NzRDNC41MDM3IDExLjQ3NCAzLjgxMDkxIDkuNzkzMTggNC41MDM3IDEwLjE2QzUuMTk2NDkgMTAuNTI2OCA2LjY5OTg0IDExLjkyOTkgNi44NDUzMyAxMi45OTgyQzYuOTIzNCAxMi41Nzc3IDYuOTE4NzIgMTIuMTQ1MyA2LjgzMTU2IDExLjcyNjZDNi43NDQ0IDExLjMwNzkgNi41NzY1MyAxMC45MTE1IDYuMzM3ODYgMTAuNTYwNkM2LjIxODY0IDEwLjQ5NTQgNi4xMDMgMTAuNDIzNSA1Ljk5MTQ3IDEwLjM0NTJDNS41MDMzNCAxMC4wMDI2IDUuMTAzNzcgOS41NDI4OSA0LjgyNzMzIDkuMDA1ODRDNC41NTA5IDguNDY4OCA0LjQwNTkzIDcuODcwNTkgNC40MDQ5NyA3LjI2Mjk4Wk04LjAzNjk1IDkuODEwOThDOS40MDU3NiA5LjgxMDk4IDEwLjUxNTQgOC42NzAyIDEwLjUxNTQgNy4yNjI5N0MxMC41MTU0IDUuODU1NzUgOS40MDU3NiA0LjcxNDk3IDguMDM2OTUgNC43MTQ5N0M2LjY2ODEzIDQuNzE0OTcgNS41NTg0OSA1Ljg1NTc1IDUuNTU4NDkgNy4yNjI5N0M1LjU1ODQ5IDguNjcwMiA2LjY2ODEzIDkuODEwOTggOC4wMzY5NSA5LjgxMDk4WiIgZmlsbD0iI0NEODgzNyIvPg0KICA8L2c+DQo8L3N2Zz4NCg==",
    PLATINUM: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMC41ODg5IDAuMDgxOSAxOC44MzQzIDE4LjgzNDMiPg0KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjAwMDAgMC4wMDAwKSBzY2FsZSgxLjAwMDAwMCkiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMTIuNzM4MiA3Ljc3NzI5QzEzLjI5ODggOC40NTE2MyAxMy42MDYgOS4zMTAwMyAxMy42MDQyIDEwLjE5NzFDMTMuNjAyNiAxMC44MDU4IDEzLjQ1NjQgMTEuNDA0OSAxMy4xNzg0IDExLjk0MjNDMTIuOTAwNSAxMi40Nzk4IDEyLjQ5OTEgMTIuOTM5MyAxMi4wMDkxIDEzLjI4MTFDMTEuODk4IDEzLjM1OTUgMTEuNzgyMyAxMy40MzA4IDExLjY2MjcgMTMuNDk0N0MxMS40MjQgMTMuODQ1NiAxMS4yNTYxIDE0LjI0MjEgMTEuMTY5IDE0LjY2MDdDMTEuMDgxOCAxNS4wNzk0IDExLjA3NzEgMTUuNTExOCAxMS4xNTUyIDE1LjkzMjNDMTEuMzAwNyAxNC44NTg2IDEyLjgyNjYgMTMuNDUwMiAxMy41MDcyIDEzLjA5MjNDMTQuMTg3OSAxMi43MzQ0IDEzLjUwNzIgMTQuNDA4MiAxMy41MDcyIDE0LjQwODJDMTMuNTA3MiAxNC40MDgyIDE0Ljc3NjggMTMuNTI4NiAxNS41MDk0IDEyLjMwMzVDMTUuOTczMiAxMS40NTk4IDE2LjM3ODQgMTAuNTgzMyAxNi43MjE4IDkuNjgwNzNMMTUuNDY0NCAxMC4zNTM4QzE1Ljc2OTIgOC45MzY0NSAxNy4yNjM5IDcuNzIyMDkgMTcuMjYzOSA3LjcyMjA5QzE3Ljg4NTcgNi4yMzU0MiAxOC4xMjQzIDQuNjA5MDggMTcuOTU2NyAzQzE3LjM1MDUgNS40NjI1NCAxNC40MTgzIDcuMDQ5MDMgMTIuNzM4MiA3Ljc3NzI5Wk02LjQwNDQxIDEwLjI2M0M2LjQwMjkxIDkuMzc1OTggNi43MTAwNyA4LjUxNzY3IDcuMjcwNCA3Ljg0MzE4QzUuNTkzODUgNy4xMTQ5MiAyLjY1OTg4IDUuNTIxMyAyLjA1NTQyIDMuMDY1ODlDMS44ODc4IDQuNjc1NTUgMi4xMjY0IDYuMzAyNDYgMi43NDgyMSA3Ljc4OTc2QzIuNzQ4MjEgNy43ODk3NiA0LjIyNzMyIDkuMDAyMzMgNC41MzIxNCAxMC40MTk3TDMuMjczIDkuNzQ4NEMzLjYxOTAzIDEwLjY1MDcgNC4wMjcwOCAxMS41MjY2IDQuNDk0MDQgMTIuMzY5NEM1LjIyNjY3IDEzLjU5NDQgNi41MDMxMyAxNC40NzQgNi41MDMxMyAxNC40NzRDNi41MDMxMyAxNC40NzQgNS44MTAzNCAxMi43OTMyIDYuNTAzMTMgMTMuMTZDNy4xOTU5MiAxMy41MjY4IDguNjk5MjggMTQuOTI5OSA4Ljg0NDc3IDE1Ljk5ODJDOC45MjI4NCAxNS41Nzc3IDguOTE4MTYgMTUuMTQ1MyA4LjgzMSAxNC43MjY2QzguNzQzODQgMTQuMzA3OSA4LjU3NTk3IDEzLjkxMTUgOC4zMzczIDEzLjU2MDZDOC4yMTgwNyAxMy40OTU0IDguMTAyNDMgMTMuNDIzNSA3Ljk5MDkgMTMuMzQ1MkM3LjUwMjc3IDEzLjAwMjYgNy4xMDMyIDEyLjU0MjkgNi44MjY3NyAxMi4wMDU4QzYuNTUwMzQgMTEuNDY4OCA2LjQwNTM3IDEwLjg3MDYgNi40MDQ0MSAxMC4yNjNaTTEwLjAzNjQgMTIuODExQzExLjQwNTIgMTIuODExIDEyLjUxNDggMTEuNjcwMiAxMi41MTQ4IDEwLjI2M0MxMi41MTQ4IDguODU1NzUgMTEuNDA1MiA3LjcxNDk3IDEwLjAzNjQgNy43MTQ5N0M4LjY2NzU3IDcuNzE0OTcgNy41NTc5MiA4Ljg1NTc1IDcuNTU3OTIgMTAuMjYzQzcuNTU3OTIgMTEuNjcwMiA4LjY2NzU3IDEyLjgxMSAxMC4wMzY0IDEyLjgxMVoiIGZpbGw9IiMyNUFDRDYiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    EMERALD: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMC41OTc4IDAuMDUzNyAxOC44MjQ4IDE4LjgyNDgiPg0KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjAwMDAgMC4wMDAwKSBzY2FsZSgxLjAwMDAwMCkiPg0KICAgIDxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNy4yODIwOSA3Ljc3NzI5QzYuNzIxNSA4LjQ1MTYzIDYuNDE0MjkgOS4zMTAwMyA2LjQxNjEgMTAuMTk3MUM2LjQxNzc0IDEwLjgwNTggNi41NjM5IDExLjQwNDkgNi44NDE4OSAxMS45NDIzQzcuMTE5ODggMTIuNDc5OCA3LjUyMTI5IDEyLjkzOTMgOC4wMTEyNiAxMy4yODExQzguMTIyMzggMTMuMzU5NSA4LjIzODA2IDEzLjQzMDggOC4zNTc2NSAxMy40OTQ3QzguNTk2MzIgMTMuODQ1NiA4Ljc2NDE5IDE0LjI0MjEgOC44NTEzNSAxNC42NjA3QzguOTM4NTEgMTUuMDc5NCA4Ljk0MzE5IDE1LjUxMTggOC44NjUxMiAxNS45MzIzQzguNzE5NjMgMTQuODU4NiA3LjE5Mzc2IDEzLjQ1MDIgNi41MTMwOSAxMy4wOTIzQzUuODMyNDMgMTIuNzM0NCA2LjUxMzA5IDE0LjQwODIgNi41MTMwOSAxNC40MDgyQzYuNTEzMDkgMTQuNDA4MiA1LjM2NDYgMTMuNTYwNSA0LjMzMDkzIDExLjk5NDFDNC4zMTY5OSAxMS45NzMgNC4zMDMxMyAxMS45NTE5IDQuMjg5MzUgMTEuOTMxQzMuNjI4NjcgMTAuOTI5MyAzLjE0OTIgMTAuMjAyMyAyLjEzMTYyIDkuOTIxODhDMy4xMTcyMiA5LjU4NzQ4IDQuNTU1OTYgMTAuMzUzOCA0LjU1NTk2IDEwLjM1MzhDNC4yNTExMyA4LjkzNjQ1IDIuNzU2NDQgNy43MjIwOSAyLjc1NjQ0IDcuNzIyMDlDMi4xMzQ2MyA2LjIzNTQyIDEuODk2MDIgNC42MDkwOCAyLjA2MzY1IDNDMi42Njk4NCA1LjQ2MjU0IDUuNjAyMDggNy4wNDkwMyA3LjI4MjA5IDcuNzc3MjlaTTEzLjYwNDIgMTAuMTk3MUMxMy42MDYgOS4zMTAwMyAxMy4yOTg4IDguNDUxNjMgMTIuNzM4MiA3Ljc3NzI5QzE0LjQxODMgNy4wNDkwMyAxNy4zNTA1IDUuNDYyNTQgMTcuOTU2NyAzQzE4LjEyNDMgNC42MDkwOCAxNy44ODU3IDYuMjM1NDIgMTcuMjYzOSA3LjcyMjA5QzE3LjI2MzkgNy43MjIwOSAxNS43NjkyIDguOTM2NDUgMTUuNDY0NCAxMC4zNTM4QzE1LjQ2NDQgMTAuMzUzOCAxNi45MDMxIDkuNTg3NDggMTcuODg4NyA5LjkyMTg4QzE2Ljg3MTEgMTAuMjAyMyAxNi4zOTE3IDEwLjkyOTMgMTUuNzMxIDExLjkzMUwxNS42ODk0IDExLjk5NDFDMTQuNjU1NyAxMy41NjA1IDEzLjUwNzIgMTQuNDA4MiAxMy41MDcyIDE0LjQwODJDMTMuNTA3MiAxNC40MDgyIDE0LjE4NzkgMTIuNzM0NCAxMy41MDcyIDEzLjA5MjNDMTIuODI2NiAxMy40NTAyIDExLjMwMDcgMTQuODU4NiAxMS4xNTUyIDE1LjkzMjNDMTEuMDc3MSAxNS41MTE4IDExLjA4MTggMTUuMDc5NCAxMS4xNjkgMTQuNjYwN0MxMS4yNTYxIDE0LjI0MjEgMTEuNDI0IDEzLjg0NTYgMTEuNjYyNyAxMy40OTQ3QzExLjc4MjMgMTMuNDMwOCAxMS44OTggMTMuMzU5NSAxMi4wMDkxIDEzLjI4MTFDMTIuNDk5MSAxMi45MzkzIDEyLjkwMDUgMTIuNDc5OCAxMy4xNzg1IDExLjk0MjNDMTMuNDU2NCAxMS40MDQ5IDEzLjYwMjYgMTAuODA1OCAxMy42MDQyIDEwLjE5NzFaTTEwLjAzNjQgMTIuODExQzExLjQwNTIgMTIuODExIDEyLjUxNDkgMTEuNjcwMiAxMi41MTQ5IDEwLjI2M0MxMi41MTQ5IDguODU1NzUgMTEuNDA1MiA3LjcxNDk3IDEwLjAzNjQgNy43MTQ5N0M4LjY2NzU4IDcuNzE0OTcgNy41NTc5NCA4Ljg1NTc1IDcuNTU3OTQgMTAuMjYzQzcuNTU3OTQgMTEuNjcwMiA4LjY2NzU4IDEyLjgxMSAxMC4wMzY0IDEyLjgxMVoiIGZpbGw9IiMxNDlDM0EiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    DIAMOND: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTAuNDU3OSAtMC45OTM0IDIwLjkxOTEgMjAuOTE5MSI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAwMCAwLjAwMDApIHNjYWxlKDEuMDAwMDAwKSI+DQogICAgPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik03LjI2NTAxIDcuNzc3MjhDNi43MDQ0MSA4LjQ1MTYyIDYuMzk3MjEgOS4zMTAwMyA2LjM5OTAyIDEwLjE5NzFDNi40MDA2NiAxMC44MDU4IDYuNTQ2ODIgMTEuNDA0OSA2LjgyNDggMTEuOTQyM0M3LjEwMjc5IDEyLjQ3OTggNy41MDQyIDEyLjkzOTMgNy45OTQxNyAxMy4yODExQzguMTA1MjkgMTMuMzU5NSA4LjIyMDk3IDEzLjQzMDggOC4zNDA1NiAxMy40OTQ3QzguNTc5MjMgMTMuODQ1NiA4Ljc0NzExIDE0LjI0MjEgOC44MzQyNyAxNC42NjA3QzguOTIxNDIgMTUuMDc5NCA4LjkyNjExIDE1LjUxMTggOC44NDgwMyAxNS45MzIzQzguNzAyNTUgMTQuODU4NiA3LjE3NjY4IDEzLjQ1MDIgNi40OTYwMSAxMy4wOTIzQzUuODE1MzQgMTIuNzM0NCA2LjQ5NjAxIDE0LjQwODIgNi40OTYwMSAxNC40MDgyQzQuODUxMzMgMTMuNDA5OSA0LjUzMjkzIDEyLjQ2MTYgNC4yMTc0OCAxMS41MjIxQzMuOTg2NjEgMTAuODM0NSAzLjc1NzMyIDEwLjE1MTYgMy4wMTA3OCA5LjQ1NzMxQzQuMTU2MjggOS43OTYxMiA0LjUzODg4IDEwLjM1MzggNC41Mzg4OCAxMC4zNTM4QzQuMzkyMjEgOC41NDYxNCAyLjUxODY5IDcuOTk3NDUgMi41MTg2OSA3Ljk5NzQ1QzIuMjc5NDcgNy4xNjcyMSAyLjE0Njc4IDYuNDkwMjEgMi4wMzAyIDUuODk1MzNDMS44MTU0NyA0Ljc5OTY5IDEuNjU1MzQgMy45ODI2NSAwLjk4NDc3MiAzQzQuMjg3MDEgMy44OTcwNCA1LjYzODc5IDUuNTI2MTEgNy4yNjUwMSA3Ljc3NzI4Wk0xMy42MDQzIDEwLjE5NzFDMTMuNjA2MSA5LjMxMDAzIDEzLjI5ODkgOC40NTE2MyAxMi43MzgzIDcuNzc3MjlDMTQuMzY0NSA1LjUyNjEyIDE1LjcxNjMgMy44OTcwNCAxOS4wMTg1IDMuMDAwMDFDMTguMzQ3OSAzLjk4MjY1IDE4LjE4NzggNC43OTk3IDE3Ljk3MzEgNS44OTUzNEMxNy44NTY1IDYuNDkwMjEgMTcuNzIzOCA3LjE2NzIyIDE3LjQ4NDYgNy45OTc0NUMxNy40ODQ2IDcuOTk3NDUgMTUuNjExMSA4LjU0NjE1IDE1LjQ2NDQgMTAuMzUzOEMxNS40NjQ0IDEwLjM1MzggMTUuODQ3IDkuNzk2MTIgMTYuOTkyNSA5LjQ1NzMxQzE2LjI0NTkgMTAuMTUxNiAxNi4wMTY3IDEwLjgzNDUgMTUuNzg1OCAxMS41MjIxQzE1LjQ3MDMgMTIuNDYxNiAxNS4xNTE5IDEzLjQwOTkgMTMuNTA3MyAxNC40MDgyQzEzLjUwNzMgMTQuNDA4MiAxNC4xODc5IDEyLjczNDQgMTMuNTA3MyAxMy4wOTIzQzEyLjgyNjYgMTMuNDUwMiAxMS4zMDA3IDE0Ljg1ODYgMTEuMTU1MiAxNS45MzIzQzExLjA3NzIgMTUuNTExOCAxMS4wODE4IDE1LjA3OTQgMTEuMTY5IDE0LjY2MDdDMTEuMjU2MiAxNC4yNDIxIDExLjQyNCAxMy44NDU2IDExLjY2MjcgMTMuNDk0N0MxMS43ODIzIDEzLjQzMDggMTEuODk4IDEzLjM1OTUgMTIuMDA5MSAxMy4yODExQzEyLjQ5OTEgMTIuOTM5MyAxMi45MDA1IDEyLjQ3OTggMTMuMTc4NSAxMS45NDIzQzEzLjQ1NjUgMTEuNDA0OSAxMy42MDI2IDEwLjgwNTggMTMuNjA0MyAxMC4xOTcxWk0xMC4wMzY0IDEyLjgxMUMxMS40MDUyIDEyLjgxMSAxMi41MTQ5IDExLjY3MDIgMTIuNTE0OSAxMC4yNjNDMTIuNTE0OSA4Ljg1NTc1IDExLjQwNTIgNy43MTQ5NyAxMC4wMzY0IDcuNzE0OTdDOC42Njc1OSA3LjcxNDk3IDcuNTU3OTUgOC44NTU3NSA3LjU1Nzk1IDEwLjI2M0M3LjU1Nzk1IDExLjY3MDIgOC42Njc1OSAxMi44MTEgMTAuMDM2NCAxMi44MTFaIiBmaWxsPSIjODE0MUVCIi8+DQogIDwvZz4NCjwvc3ZnPg0K",
    MASTER: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTEuNzE4NCAtMi4zODM4IDI0Ljc2NzYgMjQuNzY3NiI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xLjMzMzMgMC4wMDAwKSBzY2FsZSgxLjMzMzMzMykiPg0KICAgIDxwYXRoIGQ9Ik03LjYxNDg4IDE1QzcuOTAyNzEgMTQuMjQ3MSA4LjE0Mjg3IDEzLjQ3NDQgOC4zMzM3NSAxMi42ODcyQzcuNzUzNTcgMTIuNTYxMSA3LjIxNzUzIDEyLjI2NTcgNi43ODUyNiAxMS44MzM5QzYuMzUzIDExLjQwMiA2LjA0MTQ1IDEwLjg1MDYgNS44ODUyOCAxMC4yNDExQzUuNzI5MTEgOS42MzE1MyA1LjczNDQ1IDguOTg3NjggNS45MDA2OCA4LjM4MTE2QzYuMDY2OTIgNy43NzQ2NCA2LjM4NzU1IDcuMjI5MjQgNi44MjY4OSA2LjgwNTYxQzUuNTYwMjQgNS40MDU3NSAzLjM3MDggMi41NjM2MyAzLjc2NDc5IDBDMy43NjQ3OSAwIDIuNjE1NjQgMS44Mjk1OCAyLjYwMDA5IDQuNjQ1ODlDMi42MDAwOSA0LjY0NTg5IDMuMjY4ODQgNS45NTkwNiAzLjI5MTMxIDcuMjM5MDNDMi4zNzAyNiA2LjM2Mjk3IDEuMzkwNDUgNS4xMDY5NyAxLjM2Nzk5IDMuNzM0NzhDMS4zNjc5OSAzLjczNDc4IDEuMzI0NzkgMy44NDkxMyAxLjI2Nzc2IDQuMDUyMDFMMS4xMzQ3IDQuNjM2NjdDMS4wNTk1NyA1LjA1ODEgMS4wMTk2NyA1LjQ4NTgyIDEuMDE1NDcgNS45MTQ3OUMwLjk5MjI0IDYuMzY3NTQgMC45OTIyNCA2LjgyMTMyIDEuMDE1NDcgNy4yNzQwN0MxLjA3MTAxIDguNTA2MzQgMS4zNTQwNiA5LjcxNDc2IDEuODQ4MzkgMTAuODNDMS44NDgzOSAxMC44MyAyLjA4MTY3IDEwLjg4MTYgMi40NTE0OCAxMC45ODY3QzMuNDE3NDUgMTEuMjQ4NiA0Ljc2MTg4IDExLjcyNDUgNS44MjgwOCAxMi40ODI1TDUuOTI2NTggMTIuNTU0NEM2Ljc1Nzc3IDEzLjE1MDEgNy40MTYxNiAxMy45MTM3IDcuNTIzMyAxNC44NjcyIiBmaWxsPSIjQTQ1ODRFIi8+DQo8cGF0aCBkPSJNMTEuMTU5MSA5LjMzOTgxQzExLjE1OTQgOC44NzgzIDExLjAzMTUgOC40MjcwNCAxMC43OTE1IDguMDQzMTJDMTAuNTUxNSA3LjY1OTIgMTAuMjEwMiA3LjM1OTg4IDkuODEwODMgNy4xODMwMUM5LjQxMTQyIDcuMDA2MTQgOC45NzE4NCA2Ljk1OTY3IDguNTQ3NjkgNy4wNDk0OUM4LjEyMzU0IDcuMTM5MyA3LjczMzg3IDcuMzYxMzYgNy40Mjc5OCA3LjY4NzU4QzcuMTIyMDkgOC4wMTM3OSA2LjkxMzczIDguNDI5NSA2LjgyOTI0IDguODgyMTNDNi43NDQ3NSA5LjMzNDc1IDYuNzg3OTQgOS44MDM5NSA2Ljk1MzM0IDEwLjIzMDRDNy4xMTg3NCAxMC42NTY4IDcuMzk4OTMgMTEuMDIxMyA3Ljc1ODQ1IDExLjI3NzdDOC4xMTc5NyAxMS41MzQyIDguNTQwNjcgMTEuNjcxMSA4Ljk3MzA5IDExLjY3MTFDOS41NTI0MSAxMS42NzA2IDEwLjEwNzkgMTEuNDI0OSAxMC41MTc3IDEwLjk4NzhDMTAuOTI3NSAxMC41NTA4IDExLjE1ODIgOS45NTgxMiAxMS4xNTkxIDkuMzM5ODFaIiBmaWxsPSIjOUQ0OEUwIi8+DQo8cGF0aCBkPSJNMTAuMzg0OSAxNUMxMC4wOTcxIDE0LjI0NzEgOS44NTY5IDEzLjQ3NDQgOS42NjYwMiAxMi42ODcyQzEwLjI0NjIgMTIuNTYxMSAxMC43ODIyIDEyLjI2NTcgMTEuMjE0NSAxMS44MzM5QzExLjY0NjggMTEuNDAyIDExLjk1ODMgMTAuODUwNiAxMi4xMTQ1IDEwLjI0MTFDMTIuMjcwNyA5LjYzMTUzIDEyLjI2NTMgOC45ODc2OCAxMi4wOTkxIDguMzgxMTZDMTEuOTMyOCA3Ljc3NDY0IDExLjYxMjIgNy4yMjkyNCAxMS4xNzI5IDYuODA1NjFDMTIuNDM5NSA1LjQwNTc1IDE0LjYyOSAyLjU2MzYzIDE0LjIzNSAwQzE0LjIzNSAwIDE1LjM4NDEgMS44Mjk1OCAxNS4zOTggNC42NDU4OUMxNS4zOTggNC42NDU4OSAxNC43MzA5IDUuOTU5MDYgMTQuNzA2NyA3LjIzOTAzQzE1LjYyNzggNi4zNjI5NyAxNi42MDc2IDUuMTA2OTcgMTYuNjMgMy43MzQ3OEMxNi42MyAzLjczNDc4IDE2LjY3MzMgMy44NDkxMyAxNi43MzAzIDQuMDUyMDFMMTYuODYxNiA0LjYzMjk4QzE2LjkzODMgNS4wNTQyMSAxNi45Nzg4IDUuNDgyMDIgMTYuOTgyNiA1LjkxMTFDMTcuMDA1OCA2LjM2Mzg2IDE3LjAwNTggNi44MTc2MyAxNi45ODI2IDcuMjcwMzhDMTYuOTI4NyA4LjUwMjI3IDE2LjY0NzQgOS43MTA2OCAxNi4xNTQ4IDEwLjgyNjNDMTYuMTU0OCAxMC44MjYzIDE1LjkxOTggMTAuODc3OSAxNS41NTE3IDEwLjk4M0MxNC41ODQgMTEuMjQ0OSAxMy4yNDEzIDExLjcyMDggMTIuMTc1MSAxMi40Nzg4TDEyLjA3NDkgMTIuNTUwN0MxMS4yNDM3IDEzLjE0NjQgMTAuNTg1MyAxMy45MSAxMC40NzgyIDE0Ljg2MzUiIGZpbGw9IiNBNDU4NEUiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    GRANDMASTER: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTEuNzE4NCAtMi4zODM4IDI0Ljc2NzYgMjQuNzY3NiI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xLjMzMzMgMC4wMDAwKSBzY2FsZSgxLjMzMzMzMykiPg0KICAgIDxwYXRoIGQ9Ik03LjYxNDg4IDE1QzcuOTAyNzEgMTQuMjQ3MSA4LjE0Mjg3IDEzLjQ3NDQgOC4zMzM3NSAxMi42ODcyQzcuNzUzNTcgMTIuNTYxMSA3LjIxNzUzIDEyLjI2NTcgNi43ODUyNiAxMS44MzM5QzYuMzUzIDExLjQwMiA2LjA0MTQ1IDEwLjg1MDYgNS44ODUyOCAxMC4yNDExQzUuNzI5MTEgOS42MzE1MyA1LjczNDQ1IDguOTg3NjggNS45MDA2OCA4LjM4MTE2QzYuMDY2OTIgNy43NzQ2NCA2LjM4NzU1IDcuMjI5MjQgNi44MjY4OSA2LjgwNTYxQzUuNTYwMjQgNS40MDU3NSAzLjM3MDggMi41NjM2MyAzLjc2NDc5IDBDMy43NjQ3OSAwIDIuNjE1NjQgMS44Mjk1OCAyLjYwMDA5IDQuNjQ1ODlDMi42MDAwOSA0LjY0NTg5IDMuMjY4ODQgNS45NTkwNiAzLjI5MTMxIDcuMjM5MDNDMi4zNzAyNiA2LjM2Mjk3IDEuMzkwNDUgNS4xMDY5NyAxLjM2Nzk5IDMuNzM0NzhDMS4zNjc5OSAzLjczNDc4IDEuMzI0NzkgMy44NDkxMyAxLjI2Nzc2IDQuMDUyMDFMMS4xMzQ3IDQuNjM2NjdDMS4wNTk1NyA1LjA1ODEgMS4wMTk2NyA1LjQ4NTgyIDEuMDE1NDcgNS45MTQ3OUMwLjk5MjI0IDYuMzY3NTQgMC45OTIyNCA2LjgyMTMyIDEuMDE1NDcgNy4yNzQwN0MxLjA3MTAxIDguNTA2MzQgMS4zNTQwNiA5LjcxNDc2IDEuODQ4MzkgMTAuODNDMS44NDgzOSAxMC44MyAyLjA4MTY3IDEwLjg4MTYgMi40NTE0OCAxMC45ODY3QzMuNDE3NDUgMTEuMjQ4NiA0Ljc2MTg4IDExLjcyNDUgNS44MjgwOCAxMi40ODI1TDUuOTI2NTggMTIuNTU0NEM2Ljc1Nzc3IDEzLjE1MDEgNy40MTYxNiAxMy45MTM3IDcuNTIzMyAxNC44NjcyIiBmaWxsPSIjNzU2NTcyIi8+DQo8cGF0aCBkPSJNMTEuMTU5MSA5LjMzOTgxQzExLjE1OTQgOC44NzgzIDExLjAzMTUgOC40MjcwNCAxMC43OTE1IDguMDQzMTJDMTAuNTUxNSA3LjY1OTIgMTAuMjEwMiA3LjM1OTg4IDkuODEwODMgNy4xODMwMUM5LjQxMTQyIDcuMDA2MTQgOC45NzE4NCA2Ljk1OTY3IDguNTQ3NjkgNy4wNDk0OUM4LjEyMzU0IDcuMTM5MyA3LjczMzg3IDcuMzYxMzYgNy40Mjc5OCA3LjY4NzU4QzcuMTIyMDkgOC4wMTM3OSA2LjkxMzczIDguNDI5NSA2LjgyOTI0IDguODgyMTNDNi43NDQ3NSA5LjMzNDc1IDYuNzg3OTQgOS44MDM5NSA2Ljk1MzM0IDEwLjIzMDRDNy4xMTg3NCAxMC42NTY4IDcuMzk4OTMgMTEuMDIxMyA3Ljc1ODQ1IDExLjI3NzdDOC4xMTc5NyAxMS41MzQyIDguNTQwNjcgMTEuNjcxMSA4Ljk3MzA5IDExLjY3MTFDOS41NTI0MSAxMS42NzA2IDEwLjEwNzkgMTEuNDI0OSAxMC41MTc3IDEwLjk4NzhDMTAuOTI3NSAxMC41NTA4IDExLjE1ODIgOS45NTgxMiAxMS4xNTkxIDkuMzM5ODFaIiBmaWxsPSIjQ0Q0NTQ1Ii8+DQo8cGF0aCBkPSJNMTAuMzg0OSAxNUMxMC4wOTcxIDE0LjI0NzEgOS44NTY5IDEzLjQ3NDQgOS42NjYwMiAxMi42ODcyQzEwLjI0NjIgMTIuNTYxMSAxMC43ODIyIDEyLjI2NTcgMTEuMjE0NSAxMS44MzM5QzExLjY0NjggMTEuNDAyIDExLjk1ODMgMTAuODUwNiAxMi4xMTQ1IDEwLjI0MTFDMTIuMjcwNyA5LjYzMTUzIDEyLjI2NTMgOC45ODc2OCAxMi4wOTkxIDguMzgxMTZDMTEuOTMyOCA3Ljc3NDY0IDExLjYxMjIgNy4yMjkyNCAxMS4xNzI5IDYuODA1NjFDMTIuNDM5NSA1LjQwNTc1IDE0LjYyOSAyLjU2MzYzIDE0LjIzNSAwQzE0LjIzNSAwIDE1LjM4NDEgMS44Mjk1OCAxNS4zOTggNC42NDU4OUMxNS4zOTggNC42NDU4OSAxNC43MzA5IDUuOTU5MDYgMTQuNzA2NyA3LjIzOTAzQzE1LjYyNzggNi4zNjI5NyAxNi42MDc2IDUuMTA2OTcgMTYuNjMgMy43MzQ3OEMxNi42MyAzLjczNDc4IDE2LjY3MzMgMy44NDkxMyAxNi43MzAzIDQuMDUyMDFMMTYuODYxNiA0LjYzMjk4QzE2LjkzODMgNS4wNTQyMSAxNi45Nzg4IDUuNDgyMDIgMTYuOTgyNiA1LjkxMTFDMTcuMDA1OCA2LjM2Mzg2IDE3LjAwNTggNi44MTc2MyAxNi45ODI2IDcuMjcwMzhDMTYuOTI4NyA4LjUwMjI3IDE2LjY0NzQgOS43MTA2OCAxNi4xNTQ4IDEwLjgyNjNDMTYuMTU0OCAxMC44MjYzIDE1LjkxOTggMTAuODc3OSAxNS41NTE3IDEwLjk4M0MxNC41ODQgMTEuMjQ0OSAxMy4yNDEzIDExLjcyMDggMTIuMTc1MSAxMi40Nzg4TDEyLjA3NDkgMTIuNTUwN0MxMS4yNDM3IDEzLjE0NjQgMTAuNTg1MyAxMy45MSAxMC40NzgyIDE0Ljg2MzUiIGZpbGw9IiM3NTY1NzIiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    CHALLENGER: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTEuNzE4NCAtMi4zODM4IDI0Ljc2NzYgMjQuNzY3NiI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xLjMzMzMgMC4wMDAwKSBzY2FsZSgxLjMzMzMzMykiPg0KICAgIDxwYXRoIGQ9Ik03LjYxNDg4IDE1QzcuOTAyNzEgMTQuMjQ3MSA4LjE0Mjg3IDEzLjQ3NDQgOC4zMzM3NSAxMi42ODcyQzcuNzUzNTcgMTIuNTYxMSA3LjIxNzUzIDEyLjI2NTcgNi43ODUyNiAxMS44MzM5QzYuMzUzIDExLjQwMiA2LjA0MTQ1IDEwLjg1MDYgNS44ODUyOCAxMC4yNDExQzUuNzI5MTEgOS42MzE1MyA1LjczNDQ1IDguOTg3NjggNS45MDA2OCA4LjM4MTE2QzYuMDY2OTIgNy43NzQ2NCA2LjM4NzU1IDcuMjI5MjQgNi44MjY4OSA2LjgwNTYxQzUuNTYwMjQgNS40MDU3NSAzLjM3MDggMi41NjM2MyAzLjc2NDc5IDBDMy43NjQ3OSAwIDIuNjE1NjQgMS44Mjk1OCAyLjYwMDA5IDQuNjQ1ODlDMi42MDAwOSA0LjY0NTg5IDMuMjY4ODQgNS45NTkwNiAzLjI5MTMxIDcuMjM5MDNDMi4zNzAyNiA2LjM2Mjk3IDEuMzkwNDUgNS4xMDY5NyAxLjM2Nzk5IDMuNzM0NzhDMS4zNjc5OSAzLjczNDc4IDEuMzI0NzkgMy44NDkxMyAxLjI2Nzc2IDQuMDUyMDFMMS4xMzQ3IDQuNjM2NjdDMS4wNTk1NyA1LjA1ODEgMS4wMTk2NyA1LjQ4NTgyIDEuMDE1NDcgNS45MTQ3OUMwLjk5MjI0IDYuMzY3NTQgMC45OTIyNCA2LjgyMTMyIDEuMDE1NDcgNy4yNzQwN0MxLjA3MTAxIDguNTA2MzQgMS4zNTQwNiA5LjcxNDc2IDEuODQ4MzkgMTAuODNDMS44NDgzOSAxMC44MyAyLjA4MTY3IDEwLjg4MTYgMi40NTE0OCAxMC45ODY3QzMuNDE3NDUgMTEuMjQ4NiA0Ljc2MTg4IDExLjcyNDUgNS44MjgwOCAxMi40ODI1TDUuOTI2NTggMTIuNTU0NEM2Ljc1Nzc3IDEzLjE1MDEgNy40MTYxNiAxMy45MTM3IDcuNTIzMyAxNC44NjcyIiBmaWxsPSIjRjRDODc0Ii8+DQo8cGF0aCBkPSJNMTEuMTU5MSA5LjMzOTgxQzExLjE1OTQgOC44NzgzIDExLjAzMTUgOC40MjcwNCAxMC43OTE1IDguMDQzMTJDMTAuNTUxNSA3LjY1OTIgMTAuMjEwMiA3LjM1OTg4IDkuODEwODMgNy4xODMwMUM5LjQxMTQyIDcuMDA2MTQgOC45NzE4NCA2Ljk1OTY3IDguNTQ3NjkgNy4wNDk0OUM4LjEyMzU0IDcuMTM5MyA3LjczMzg3IDcuMzYxMzYgNy40Mjc5OCA3LjY4NzU4QzcuMTIyMDkgOC4wMTM3OSA2LjkxMzczIDguNDI5NSA2LjgyOTI0IDguODgyMTNDNi43NDQ3NSA5LjMzNDc1IDYuNzg3OTQgOS44MDM5NSA2Ljk1MzM0IDEwLjIzMDRDNy4xMTg3NCAxMC42NTY4IDcuMzk4OTMgMTEuMDIxMyA3Ljc1ODQ1IDExLjI3NzdDOC4xMTc5NyAxMS41MzQyIDguNTQwNjcgMTEuNjcxMSA4Ljk3MzA5IDExLjY3MTFDOS41NTI0MSAxMS42NzA2IDEwLjEwNzkgMTEuNDI0OSAxMC41MTc3IDEwLjk4NzhDMTAuOTI3NSAxMC41NTA4IDExLjE1ODIgOS45NTgxMiAxMS4xNTkxIDkuMzM5ODFaIiBmaWxsPSIjM0ZCRkREIi8+DQo8cGF0aCBkPSJNMTAuMzg0OSAxNUMxMC4wOTcxIDE0LjI0NzEgOS44NTY5IDEzLjQ3NDQgOS42NjYwMiAxMi42ODcyQzEwLjI0NjIgMTIuNTYxMSAxMC43ODIyIDEyLjI2NTcgMTEuMjE0NSAxMS44MzM5QzExLjY0NjggMTEuNDAyIDExLjk1ODMgMTAuODUwNiAxMi4xMTQ1IDEwLjI0MTFDMTIuMjcwNyA5LjYzMTUzIDEyLjI2NTMgOC45ODc2OCAxMi4wOTkxIDguMzgxMTZDMTEuOTMyOCA3Ljc3NDY0IDExLjYxMjIgNy4yMjkyNCAxMS4xNzI5IDYuODA1NjFDMTIuNDM5NSA1LjQwNTc1IDE0LjYyOSAyLjU2MzYzIDE0LjIzNSAwQzE0LjIzNSAwIDE1LjM4NDEgMS44Mjk1OCAxNS4zOTggNC42NDU4OUMxNS4zOTggNC42NDU4OSAxNC43MzA5IDUuOTU5MDYgMTQuNzA2NyA3LjIzOTAzQzE1LjYyNzggNi4zNjI5NyAxNi42MDc2IDUuMTA2OTcgMTYuNjMgMy43MzQ3OEMxNi42MyAzLjczNDc4IDE2LjY3MzMgMy44NDkxMyAxNi43MzAzIDQuMDUyMDFMMTYuODYxNiA0LjYzMjk4QzE2LjkzODMgNS4wNTQyMSAxNi45Nzg4IDUuNDgyMDIgMTYuOTgyNiA1LjkxMTFDMTcuMDA1OCA2LjM2Mzg2IDE3LjAwNTggNi44MTc2MyAxNi45ODI2IDcuMjcwMzhDMTYuOTI4NyA4LjUwMjI3IDE2LjY0NzQgOS43MTA2OCAxNi4xNTQ4IDEwLjgyNjNDMTYuMTU0OCAxMC44MjYzIDE1LjkxOTggMTAuODc3OSAxNS41NTE3IDEwLjk4M0MxNC41ODQgMTEuMjQ0OSAxMy4yNDEzIDExLjcyMDggMTIuMTc1MSAxMi40Nzg4TDEyLjA3NDkgMTIuNTUwN0MxMS4yNDM3IDEzLjE0NjQgMTAuNTg1MyAxMy45MSAxMC40NzgyIDE0Ljg2MzUiIGZpbGw9IiNGNEM4NzQiLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    UNRANKED: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iLTEuNjAwMCAtMi42NzMwIDIzLjIwMDAgMjMuMjAwMCI+DQogIDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAwMCAwLjAwMDApIHNjYWxlKDEuMjUwMDAwKSI+DQogICAgPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik03Ljk5ODQzIDBMOS45Nzc5MiAyLjI4NTcxSDkuOTU3MDdDOS4zNDAyMiAyLjEwMDE4IDguNjgyNTkgMiA4IDJDNy4zMTc0MSAyIDYuNjU5NzggMi4xMDAxOCA2LjA0MjkzIDIuMjg1NzFINi4wMTg5NUw3Ljk5ODQzIDBaTTggMTRDNy4zMTc0MSAxNCA2LjY1OTc4IDEzLjg5OTggNi4wNDI5MyAxMy43MTQzSDYuMDE4OTVMNy45OTg0MyAxNkw5Ljk3NzkyIDEzLjcxNDNIOS45NTcwN0M5LjM0MDIyIDEzLjg5OTggOC42ODI1OSAxNCA4IDE0Wk0wIDcuOTk5OTlDMCA2LjEyOTk1IDAuNjQxNjM0IDQuNDA5NzcgMS43MTY3NiAzLjA0NzZINC42MTE2OUMzLjAzNDYgNC4xMjg2OCAyIDUuOTQzNTEgMiA3Ljk5OTk5QzIgMTAuMDU2NSAzLjAzNDYxIDExLjg3MTMgNC42MTE3MSAxMi45NTI0SDEuNzE2NzdDMC42NDE2MzkgMTEuNTkwMiAwIDkuODcwMDMgMCA3Ljk5OTk5Wk0xNC4yODMyIDEyLjk1MjRDMTUuMzU4NCAxMS41OTAyIDE2IDkuODcwMDMgMTYgNy45OTk5OUMxNiA2LjEyOTk1IDE1LjM1ODQgNC40MDk3NyAxNC4yODMyIDMuMDQ3NkgxMS4zODgzQzEyLjk2NTQgNC4xMjg2OCAxNCA1Ljk0MzUxIDE0IDcuOTk5OTlDMTQgMTAuMDU2NSAxMi45NjU0IDExLjg3MTMgMTEuMzg4MyAxMi45NTI0SDE0LjI4MzJaTTExIDhDMTEgOS42NTY4NSA5LjY1Njg1IDExIDggMTFDNi4zNDMxNSAxMSA1IDkuNjU2ODUgNSA4QzUgNi4zNDMxNSA2LjM0MzE1IDUgOCA1QzkuNjU2ODUgNSAxMSA2LjM0MzE1IDExIDhaIiBmaWxsPSIjNjM2NjZCIi8+DQogIDwvZz4NCjwvc3ZnPg0K"
  };

  // src/ui/styles.js
  var DISPLAY = `var(--font-display, 'Beaufort for LOL'), serif`;
  var BODY = `var(--font-body, 'Spiegel'), 'Segoe UI', system-ui, sans-serif`;
  var CSS = `
:host, * { box-sizing: border-box; }





::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #010a13;
  border-left: 1px solid #1e2328;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #785a28, #463714);
  border: 1px solid #010a13;
  
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
}

::-webkit-scrollbar-thumb:active {
  background: #c8aa6e;
}



::-webkit-scrollbar-button,
::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}



::-webkit-resizer {
  background:
    linear-gradient(135deg, transparent 0 42%, #785a28 42% 52%, transparent 52% 66%),
    linear-gradient(135deg, transparent 0 66%, #785a28 66% 76%, transparent 76%);
  background-color: #010a13;
}

.scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  font-family: ${BODY};


  pointer-events: auto;
}

.window {
  width: 720px;
  max-width: 92vw;
  height: 86vh;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 90% 45% at 50% -10%, rgba(8, 30, 60, 0.55) 0%, transparent 58%),
    #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.8);
}



.titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #1e2328;
  background: linear-gradient(to bottom, rgba(30, 35, 40, 0.6), transparent);
}

.mark {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
  display: block;
}

.title {
  font-family: ${DISPLAY};
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #f0e6d2;
  flex: 1;
}

.hint {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #5c5b57;
  text-transform: uppercase;
}

.close {
  width: 24px;
  height: 24px;
  border: 1px solid #785a28;
  background: transparent;
  color: #c8aa6e;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.close:hover { color: #f0e6d2; border-color: #c8aa6e; }



.body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.nav {
  width: 168px;
  flex-shrink: 0;
  padding: 14px 0;
  border-right: 1px solid #1e2328;
}

.navitem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 18px;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  color: #a09b8c;
  font-family: ${DISPLAY};
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}
.navitem:hover { color: #f0e6d2; }
.navitem[aria-selected='true'] {
  color: #f0e6d2;
  border-left-color: #c8aa6e;
  background: linear-gradient(to right, rgba(200, 170, 110, 0.14), transparent);
}

.content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
  overflow-y: auto;
}

.screen-title {
  font-family: ${DISPLAY};
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #f0e6d2;
  margin: 0 0 4px;
}

.screen-sub {
  font-size: 12px;
  line-height: 1.5;
  color: #a09b8c;
  margin: 0 0 18px;
}

.rule {
  height: 1px;
  background: linear-gradient(to right, #785a28, transparent);
  margin: 18px 0;
}



.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.check-row:disabled { cursor: default; opacity: 0.5; }

.check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background: url('${CHECKBOX_SPRITE}') no-repeat 0 0 / 14px 56px;
}
.check-row:hover:not(:disabled) .check { background-position: 0 -14px; }
.check[data-checked='true'] { background-position: 0 -28px; }
.check-row:hover:not(:disabled) .check[data-checked='true'] { background-position: 0 -42px; }

.check-label {
  font-size: 13px;
  font-weight: 600;
  color: #a09b8c;
}
.check-row:hover:not(:disabled) .check-label { color: #f0e6d2; }

.check-help {
  font-size: 11px;
  line-height: 1.5;
  color: #5c5b57;
  margin: 6px 0 0 24px;
  max-width: 46ch;
}



.footer {
  padding: 10px 18px;
  border-top: 1px solid #1e2328;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #5c5b57;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}


.hextech-btn, .pill, .navitem, .champ, .skin, .rank, .check-row, .select-wrap {
  transition: filter 90ms ease, color 90ms ease, border-color 90ms ease,
    box-shadow 90ms ease, background 90ms ease, transform 60ms ease;
}
.hextech-btn:active:not(:disabled),
.pill:active,
.champ:active,
.skin:active,
.rank:active {
  transform: translateY(1px);
}

.status-bad { color: #c33c3c; }
.status-good { color: #0acbe6; }



.field { margin-top: 16px; }
.field-off { opacity: 0.45; }

.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #a09b8c;
}

.field-value {
  font-family: ${DISPLAY};
  font-size: 15px;
  color: #f0e6d2;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: linear-gradient(to right, #785a28, #1e2328);
  outline: none;
  cursor: pointer;
}
.slider:disabled { cursor: default; }



.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #c8aa6e;
  border: 1px solid #010a13;
  transform: rotate(45deg);
  cursor: pointer;
}
.slider:disabled::-webkit-slider-thumb { background: #5c5b57; cursor: default; }





.cancel-dock {
  position: fixed;
  left: 50%;
  bottom: 12vh;
  transform: translateX(-50%);
  pointer-events: auto;
  z-index: 1;
}
.cancel-dock[hidden] { display: none; }





.dodge-dock {
  position: fixed;
  pointer-events: auto;
  z-index: 2;
}
.dodge-dock[hidden] { display: none; }

.hextech-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 168px;
  min-height: 32px;
  padding: 5px 1.3em;
  font-family: ${DISPLAY};
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: #1e2328;
  color: #c8aa6e;
  box-shadow: 0 0 1px 1px #010a13, inset 0 0 1px 1px #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  cursor: pointer;
}
.hextech-btn:hover {
  color: #f0e6d2;
  text-shadow: 0 0 5px #ffffff80;
  box-shadow: 0 0 8px 0 #ffffff50;
  background: linear-gradient(to bottom, #1e2328, #433d2b);
}



.status-box {
  display: block;
  width: 100%;
  min-height: 120px;
  max-height: 46vh;
  padding: 10px 12px;
  color: #f0e6d2;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25) inset;
  outline: none;


  resize: vertical;


  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.15;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}
.status-box:focus {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.status-actions-spacer { flex: 1; }

.status-count {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #5c5b57;
}

.hextech-btn-muted {
  min-width: 0;
  padding: 5px 1.1em;
  border-width: 1px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: none;
}

.pill-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.pill {
  padding: 5px 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #a09b8c;
  background: #1e2328;
  border: 1px solid #3c3c41;
  cursor: pointer;
}
.pill:hover { color: #f0e6d2; border-color: #785a28; }
.pill[aria-selected='true'] {
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border-color: #c8aa6e;
}

.champ-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 4px;
}
.champ-grid-sm {
  max-height: 180px;
}

.champ {
  position: relative;
  padding: 0;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
  line-height: 0;
  filter: grayscale(0.55) brightness(0.8);
}
.champ img { width: 100%; display: block; }
.champ:hover { filter: none; border-color: #785a28; }
.champ-on {
  filter: none;
  border-color: #c8aa6e;
  box-shadow: 0 0 8px rgba(200, 170, 110, 0.5);
}
.champ-slot {
  position: absolute;
  top: 2px;
  left: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border: 1px solid #c8aa6e;
  border-radius: 2px;
  pointer-events: none;
}

.pick-order {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
}
.pick-order-empty {
  margin: 0 0 10px;
  color: #a09b8c;
  font-size: 12px;
}
.pick-order-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  font-size: 12px;
  color: #f0e6d2;
  background: rgba(1, 10, 19, 0.55);
  border: 1px solid #785a28;
  border-radius: 4px;
}
.pick-order-remove.close {
  width: 18px;
  height: 18px;
  border: none;
  font-size: 11px;
  flex-shrink: 0;
}
.pick-order-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 700;
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border-radius: 50%;
}
.pick-order-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.hextech-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
  outline: none;
}
.hextech-input:focus {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
  background: linear-gradient(to right, rgba(32, 39, 44, 0.9), rgba(7, 16, 25, 0.7));
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.row .hextech-input { flex: 1; }

select.hextech-input {
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
select.hextech-input option { background: #010a13; color: #f0e6d2; }

.friend-list { display: flex; flex-direction: column; }

.friend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px solid #1e2328;
  font-size: 12px;
}

.dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  background: #3c3c41;
  transform: rotate(45deg);
}
.dot-on { background: #0acbe6; }

.friend-name { color: #f0e6d2; }
.friend-note {
  color: #5c5b57;
  margin-left: auto;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}



.rank-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}

.rank {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 2px;
  background: none;
  border: 1px solid transparent;
  color: #a09b8c;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  filter: grayscale(0.7) brightness(0.75);
}
.rank img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  object-position: center;
  display: block;
  margin: 0 auto;
}
.rank:hover { filter: none; color: #f0e6d2; border-color: #785a28; }
.rank-on {
  filter: none;
  color: #f0e6d2;
  border-color: #c8aa6e;
  background: linear-gradient(to bottom, rgba(200, 170, 110, 0.16), transparent);
}



.select-wrap {
  position: relative;
  display: flex;
  flex: 1;
  height: 32px;
  background: linear-gradient(to bottom, rgba(7, 16, 25, 0.9), rgba(0, 0, 0, 0.8));
  border: thin solid #785a28;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
}
.select-wrap:focus-within {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
}

.select-field {
  flex: 1;


  -webkit-appearance: none;
  appearance: none;
  padding: 0 26px 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
}
.select-field {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.select-field option {
  background: #010a13;
  color: #f0e6d2;
  text-transform: none;
  letter-spacing: 0;
}

.select-arrows {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 22px;
  border-left: thin solid #785a28;
  background: linear-gradient(to bottom, #1e2328, #010a13);
  color: #c8aa6e;
  font-size: 6px;
  line-height: 1.3;
  
  pointer-events: none;
}
.select-wrap:hover .select-arrows { color: #f0e6d2; }
.select-wrap:hover { border-color: #c8aa6e; }

.select-field:focus + .select-arrows { color: #f0e6d2; }





.skin-viewport {
  height: 300px;
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 4px;
}

.skin-spacer { position: relative; }

.skin-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  align-content: start;
}



.skin {
  display: flex;
  flex-direction: column;
  height: 84px;
  padding: 0;
  background: #010a13;
  border: 2px solid transparent;
  cursor: pointer;
  color: #a09b8c;
  font-size: 10px;
  text-align: left;
  overflow: hidden;
  filter: grayscale(0.4) brightness(0.8);
}
.skin img {
  width: 100%;
  height: 62px;
  flex: none;
  display: block;


  object-fit: cover;
}
.skin span {
  display: block;
  flex: none;
  padding: 3px 4px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skin:hover { filter: none; border-color: #785a28; color: #f0e6d2; }
.skin-on { filter: none; border-color: #c8aa6e; color: #f0e6d2; }



.split-input {
  display: flex;
  align-items: center;
  height: 32px;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
}
.split-input:focus-within {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;


  background: linear-gradient(to right, rgba(32, 39, 44, 0.9), rgba(7, 16, 25, 0.7));
}

.split-name, .split-tag {
  height: 100%;
  padding: 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background: transparent;
  border: none;
  outline: none;
}
.split-name { flex: 1; }
.split-tag { width: 74px; }

.split-hash {
  width: 9px;
  height: 9px;
  opacity: 0.55;
  flex-shrink: 0;
}

.team-reveal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  pointer-events: auto;
  z-index: 2147483646;
  font-family: ${BODY};
  color: #a09b8c;
}
.team-reveal-overlay[hidden] { display: none; }
.team-reveal-status {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483645;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(320px, calc(100vw - 32px));
  padding: 7px 10px 10px;
  overflow: hidden;
  background: rgba(1, 10, 19, 0.78);
  border: 1px solid rgba(200, 170, 109, 0.32);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: #f0e6d2;
  font-family: ${BODY};
  font-size: 12px;
  letter-spacing: 0.02em;
  pointer-events: auto;
}
.team-reveal-status-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  transform-origin: left center;
  background: #c8aa6d;
  pointer-events: none;
}
@keyframes team-reveal-status-shrink {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}
.team-reveal-status[hidden] { display: none; }
.team-reveal-status-spinner {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #c8aa6d;
  flex-shrink: 0;
}
.team-reveal-spinner-svg {
  display: block;
  animation: team-reveal-spin 0.8s linear infinite;
}
@keyframes team-reveal-spin {
  to { transform: rotate(360deg); }
}
.team-reveal-status-text {
  line-height: 1.25;
}
.team-reveal-status-open {
  appearance: none;
  border: 1px solid rgba(200, 170, 109, 0.55);
  background: rgba(200, 170, 109, 0.12);
  color: #c8aa6d;
  font-family: ${DISPLAY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.team-reveal-status-open:hover {
  background: rgba(200, 170, 109, 0.22);
}
.team-reveal-shell {
  position: relative;
  box-sizing: border-box;
  width: min(980px, 94vw);
  max-height: 86vh;
  padding: 36px 16px 16px;
  background:
    radial-gradient(ellipse 90% 45% at 50% -10%, rgba(8, 30, 60, 0.55) 0%, transparent 58%),
    #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.8);
}
.team-reveal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  appearance: none;
  border: 1px solid rgba(200, 170, 109, 0.4);
  background: rgba(1, 10, 19, 0.65);
  color: #c8aa6d;
  font-family: ${DISPLAY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 4px 8px;
  cursor: pointer;
  z-index: 2;
}
.team-reveal-close:hover {
  background: rgba(200, 170, 109, 0.16);
}
.team-reveal-panel {
  max-height: calc(86vh - 36px);
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.team-reveal-card {
  border: 1px solid #3c3c41;
  background: linear-gradient(to bottom, rgba(30, 35, 40, 0.35), rgba(0, 0, 0, 0.45));
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.team-reveal-card.is-you {
  border-color: #785a28;
  box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.18);
}
.team-reveal-card-head {
  padding-bottom: 8px;
  border-bottom: 1px solid #1e2328;
}
.team-reveal-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-reveal-role-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  object-fit: contain;
  opacity: 0.92;
}
.team-reveal-card-title {
  color: #f0e6d2;
  font-family: ${DISPLAY};
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.team-reveal-you {
  color: #c8aa6e;
  font-family: ${BODY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: none;
  font-weight: 600;
}
.team-reveal-ranks {
  display: grid;
  gap: 8px;
}
.team-reveal-rank-block {
  padding: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid #1e2328;
}
.team-reveal-rank-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-reveal-rank-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}
.team-reveal-rank-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.team-reveal-rank-queue {
  color: #5c5b57;
  font-family: ${DISPLAY};
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.team-reveal-rank-tier {
  color: #f0e6d2;
  font-family: ${BODY};
  font-size: 12px;
  font-weight: 600;
}
.team-reveal-card-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
  border-top: 1px solid #1e2328;
}
.team-reveal-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  margin-top: 4px;
  gap: 10px;
}
.team-reveal-card-label {
  color: #5c5b57;
  flex-shrink: 0;
  font-family: ${DISPLAY};
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.team-reveal-card-value {
  color: #a09b8c;
  text-align: right;
  font-family: ${BODY};
}
.team-reveal-champ {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.team-reveal-champ-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
}
.team-reveal-recent-games {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.team-reveal-recent-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 28px;
}
.team-reveal-recent-game .team-reveal-champ-icon {
  width: 22px;
  height: 22px;
  box-shadow: 0 0 0 1px #1e2328;
}
.team-reveal-recent-game.is-win .team-reveal-champ-icon {
  box-shadow: 0 0 0 1px #0acbe6;
}
.team-reveal-recent-game.is-loss .team-reveal-champ-icon {
  box-shadow: 0 0 0 1px #c33c3c;
}
.team-reveal-recent-kda {
  color: #a09b8c;
  font-family: ${BODY};
  font-size: 9px;
  line-height: 1;
  white-space: nowrap;
}
.team-reveal-recent-empty {
  color: #5c5b57;
}
.wl-win { color: #0acbe6; }
.wl-loss { color: #c33c3c; }
.drake-reveal-name {
  color: inherit;
  display: block;
  white-space: nowrap;
}
.drake-reveal-stats {
  color: #a09b8c;
  font-size: 10px;
  display: block;
  line-height: 1.05;
  margin-top: 1px;
  white-space: nowrap;
}

.hextech-btn-danger {
  color: #c33c3c;
  border-image: linear-gradient(to bottom, #c33c3c, #6b1f1f);
  border-image-slice: 1;
}
.hextech-btn-danger:hover {
  color: #ff6b6b;
  background: linear-gradient(to bottom, #1e2328, #3a2020);
  box-shadow: 0 0 8px 0 #c33c3c50;
}
`;

  // src/features/champSelectPuuid.js
  var CHAMP_SELECT_PUUID_MASK = [
    129,
    112,
    118,
    169,
    244,
    81,
    80,
    155,
    149,
    152,
    104,
    19,
    206,
    145,
    23,
    231
  ];
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function deobfuscateChampSelectPuuid(obfuscatedPuuid) {
    const normalized = String(obfuscatedPuuid || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) return "";
    const sourceHex = normalized.replace(/-/g, "");
    let resultHex = "";
    for (let index = 0; index < CHAMP_SELECT_PUUID_MASK.length; index += 1) {
      const sourceByte = Number.parseInt(sourceHex.slice(index * 2, index * 2 + 2), 16);
      resultHex += (sourceByte ^ CHAMP_SELECT_PUUID_MASK[index]).toString(16).padStart(2, "0");
    }
    return [
      resultHex.slice(0, 8),
      resultHex.slice(8, 12),
      resultHex.slice(12, 16),
      resultHex.slice(16, 20),
      resultHex.slice(20)
    ].join("-");
  }
  function resolveChampSelectPuuid(player) {
    if (!player) return "";
    if (player.puuid) return player.puuid;
    if (player.nameVisibilityType !== "HIDDEN" || !player.obfuscatedPuuid) return "";
    return deobfuscateChampSelectPuuid(player.obfuscatedPuuid);
  }

  // src/features/reveal.js
  var CHAMP_SELECT_ROUTE = "/lol-champ-select/v1/session";
  var SUMMONER_BY_PUUID_ROUTE = (puuid) => `/lol-summoner/v2/summoners/puuid/${puuid}`;
  var SUMMONER_BY_ID_ROUTE = (summonerId) => `/lol-summoner/v1/summoners/${summonerId}`;
  var PROVIDERS = [
    { id: "porofessor", label: "Porofessor" },
    { id: "opgg", label: "OP.GG" }
  ];
  function formatRiotId({ gameName, tagLine } = {}) {
    const name = (gameName || "").trim();
    if (!name) return "";
    const tag = (tagLine || "").trim();
    return tag ? `${name}#${tag}` : name;
  }
  function lobbyPlayers(session) {
    if (!session) return [];
    return [...session.myTeam || [], ...session.theirTeam || []].filter(
      (p) => p && (formatRiotId(p) || p.puuid || p.obfuscatedPuuid || p.summonerId)
    );
  }
  async function resolvePlayerName(player, lcu2) {
    const direct = formatRiotId(player);
    if (direct) return direct;
    const puuid = resolveChampSelectPuuid(player);
    if (puuid) {
      try {
        const summoner = await lcu2.get(SUMMONER_BY_PUUID_ROUTE(puuid));
        const resolved = formatRiotId(summoner);
        if (resolved) return resolved;
      } catch {
      }
    }
    if (player.summonerId) {
      try {
        const summoner = await lcu2.get(SUMMONER_BY_ID_ROUTE(player.summonerId));
        return formatRiotId(summoner);
      } catch {
        return "";
      }
    }
    return "";
  }
  async function resolveLobbyNames(session, lcu2) {
    const names = [];
    const seen = /* @__PURE__ */ new Set();
    for (const player of lobbyPlayers(session)) {
      const name = await resolvePlayerName(player, lcu2);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }
  function buildRevealUrl(provider, region, names) {
    const r = String(region || "").toLowerCase();
    const encoded = encodeURIComponent(names.join(","));
    if (provider === "opgg") {
      return `https://www.op.gg/multisearch/${r}?summoners=${encoded}`;
    }
    return `https://porofessor.gg/pregame/${r}/${encoded}/soloqueue/season`;
  }
  function makeReveal({ lcu: lcu2, region, open }) {
    return {
      async reveal(provider) {
        let session;
        try {
          session = await lcu2.get(CHAMP_SELECT_ROUTE);
        } catch {
          return { ok: false, reason: "you have to be in champ select to reveal a lobby" };
        }
        const names = await resolveLobbyNames(session, lcu2);
        if (names.length === 0) {
          return { ok: false, reason: "you have to be in champ select to reveal a lobby" };
        }
        open(buildRevealUrl(provider, region, names));
        return { ok: true, count: names.length };
      }
    };
  }

  // src/features/champions.js
  var SUMMARY_ROUTE = "/lol-game-data/assets/v1/champion-summary.json";
  function iconUrl(championId) {
    return `/lol-game-data/assets/v1/champion-icons/${championId}.png`;
  }
  var VARIANT_ID_FLOOR = 6e4;
  function normaliseChampions(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((c) => c && c.id > 0 && c.id < VARIANT_ID_FLOOR && c.name).map((c) => ({ id: c.id, name: c.name, alias: c.alias || c.name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function fold(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function searchChampions(list, query) {
    const q = fold(query).trim();
    if (!q) return list;
    return list.filter((c) => fold(c.name).includes(q) || fold(c.alias).includes(q));
  }
  async function loadChampions(lcu2) {
    try {
      return normaliseChampions(await lcu2.get(SUMMARY_ROUTE));
    } catch {
      return [];
    }
  }

  // src/features/presence.js
  var CHAT_ME = "/lol-chat/v1/me";
  var TIERS = [
    "CHALLENGER",
    "GRANDMASTER",
    "MASTER",
    "DIAMOND",
    "EMERALD",
    "PLATINUM",
    "GOLD",
    "SILVER",
    "BRONZE",
    "IRON"
  ];
  var DIVISIONS = ["I", "II", "III", "IV"];
  var QUEUES = [
    { id: "RANKED_SOLO_5x5", label: "Solo/Duo" },
    { id: "RANKED_FLEX_SR", label: "Flex" },
    { id: "RANKED_TFT", label: "TFT" }
  ];
  var CRYSTALS = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER"
  ];
  function readLol(me) {
    const lol = me && me.lol;
    if (!lol) return {};
    if (typeof lol === "string") {
      try {
        return JSON.parse(lol);
      } catch {
        return {};
      }
    }
    return typeof lol === "object" ? lol : {};
  }
  function makePresence({ lcu: lcu2 }) {
    async function merge(fields) {
      let current;
      try {
        current = readLol(await lcu2.get(CHAT_ME));
      } catch (e) {
        return { ok: false, reason: `could not read your presence (${e.message})` };
      }
      try {
        const res = await lcu2.put(CHAT_ME, { lol: { ...current, ...fields } });
        if (res && res.ok === false) {
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    }
    return {
      merge,
      setRank({ tier, division, queue }) {
        return merge({
          rankedLeagueTier: tier,
          rankedLeagueDivision: division,
          rankedLeagueQueue: queue
        });
      },
      clearRank() {
        return merge({
          rankedLeagueTier: "",
          rankedLeagueDivision: "",
          rankedLeagueQueue: ""
        });
      },
      setBanner(id) {
        return merge({ bannerIdSelected: String(id) });
      },
      setBadges({ crystal, titleId }) {
        const fields = {};
        if (crystal !== void 0) fields.challengeCrystalLevel = crystal;
        if (titleId !== void 0) fields.playerTitleSelected = String(titleId);
        return merge(fields);
      }
    };
  }

  // src/ui/virtualGrid.js
  function visibleWindow({
    total,
    perRow,
    rowHeight,
    viewportHeight,
    scrollTop,
    overscan = 2
  }) {
    const rows = Math.ceil(total / perRow);
    const totalHeight = rows * rowHeight;
    if (total === 0) {
      return { start: 0, end: 0, offsetY: 0, totalHeight: 0 };
    }
    const firstRow = Math.min(
      Math.max(0, rows - 1),
      Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    );
    const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const start2 = firstRow * perRow;
    const end = Math.min(total, (firstRow + visibleRows) * perRow);
    return { start: start2, end, offsetY: firstRow * rowHeight, totalHeight };
  }

  // src/ui/panel.js
  var SCREENS = [
    { id: "auto-accept", label: "Auto Accept" },
    { id: "auto-pick", label: "Auto Pick" },
    { id: "auto-ban", label: "Auto Ban" },
    { id: "queue", label: "Queue" },
    { id: "status", label: "Status" },
    { id: "profile", label: "Profile" },
    { id: "friends", label: "Friends" },
    { id: "settings", label: "Settings" }
  ];
  function renderShell() {
    const nav = SCREENS.map(
      (s, i) => `<button class="navitem" role="tab" data-screen="${s.id}" aria-selected="${i === 0}">${s.label}</button>`
    ).join("");
    return `
    <style>${CSS}</style>

    
    <div class="cancel-dock" id="cancel-dock" hidden>
      <button class="hextech-btn hextech-btn-danger" id="cancel-queue">Cancel Queue</button>
    </div>

    
    <div class="dodge-dock" id="dodge-dock" hidden>
      <button class="hextech-btn hextech-btn-danger" id="dodge-champ-select">Dodge</button>
    </div>

    <div class="scrim" id="scrim">
      <div class="window" role="dialog" aria-label="Drake">
        <div class="titlebar">
          <img class="mark" src="${DRAKE_ICON}" alt="" aria-hidden="true">
          <div class="title">Drake</div>
          <div class="hint">Ctrl + D</div>
          <button class="close" id="close" aria-label="Close">\u2715</button>
        </div>

        <div class="body">
          <div class="nav" role="tablist">${nav}</div>
          <div class="content" id="content"></div>
        </div>

        <div class="footer">
          <span id="host-label">\u2014</span>
          <span id="status">\u2014</span>
        </div>
      </div>
    </div>`;
  }
  function renderCheckRow({ id, label, help, checked, disabled }) {
    return `
    <button class="check-row" data-setting="${id}" ${disabled ? "disabled" : ""}>
      <span class="check" data-checked="${checked}"></span>
      <span class="check-label">${label}</span>
    </button>
    ${help ? `<p class="check-help">${help}</p>` : ""}`;
  }
  function formatDelay(ms) {
    return ms === 0 ? "Instant" : `${(ms / 1e3).toFixed(1)}s`;
  }
  function renderAutoAccept(settings, { disabled, maxDelayMs }) {
    const delay = settings.auto_accept_delay_ms || 0;
    return `
    <h2 class="screen-title">Auto Accept</h2>
    <p class="screen-sub">Accepts the ready check for you the moment it appears.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: "auto_accept",
      label: "Accept ready checks automatically",
      checked: !!settings.auto_accept,
      disabled
    })}

    <div class="field ${settings.auto_accept ? "" : "field-off"}">
      <div class="field-head">
        <label class="field-label" for="delay">Accept after</label>
        <span class="field-value" id="delay-value">${formatDelay(delay)}</span>
      </div>
      <input class="slider" type="range" id="delay" name="delay"
             min="0" max="${maxDelayMs}" step="500" value="${delay}"
             ${disabled || !settings.auto_accept ? "disabled" : ""}>
      <p class="check-help" style="margin-left:0">
        A short wait leaves you a window to decline by hand, and looks less
        mechanical than accepting the instant the prompt renders.
      </p>
    </div>`;
  }
  function renderQueue({ provider, settings = {}, disabled }) {
    const options = PROVIDERS.map(
      (p) => `<button class="pill" data-provider="${p.id}" aria-selected="${p.id === provider}">${p.label}</button>`
    ).join("");
    return `
    <h2 class="screen-title">Queue</h2>
    <p class="screen-sub">Tools for champ select.</p>
    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Lobby reveal</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Looks your whole team up on a scouting site. Only works while you are in
      champ select, because that is when the names exist.
    </p>
    <div class="pill-row">${options}</div>
    <div class="status-actions">
      <button class="hextech-btn" id="reveal">Reveal Lobby</button>
    </div>

    <div class="rule"></div>

    ${renderCheckRow({
      id: "queue_team_reveal_in_client",
      label: "Reveal my team in-client",
      help: "Rewrites ally rows and enables the Ctrl+Shift+D cards overlay while in champ select.",
      checked: !!settings.queue_team_reveal_in_client,
      disabled
    })}

    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Dodge</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Leaves champ select. Costs you the usual dodge penalty \u2014 Drake does not
      confirm first, so only press it if you mean it.
    </p>
    <div class="status-actions">
      <button class="hextech-btn hextech-btn-danger" id="dodge">Dodge</button>
    </div>`;
  }
  function renderChampionPicker({ id, list, query, selectedId, compact }) {
    const cells = list.map(
      (c) => `
      <button class="champ ${c.id === selectedId ? "champ-on" : ""}"
              data-champ="${c.id}" data-for="${id}" title="${c.name}">
        <img src="${iconUrl(c.id)}" alt="" loading="lazy">
      </button>`
    ).join("");
    return `
    <input class="hextech-input" type="search" data-search="${id}"
           value="${String(query || "").replace(/"/g, "&quot;")}"
           placeholder="Search champions...">
    <div class="champ-grid${compact ? " champ-grid-sm" : ""}">${cells || '<p class="check-help">No champions match.</p>'}</div>`;
  }
  function championName(list, id) {
    const found = list.find((c) => c.id === id);
    return found ? found.name : "none chosen";
  }
  function autoPickOrder(settings) {
    const first = Number(settings.auto_pick_champion_id) || 0;
    const second = Number(settings.auto_pick_champion_id_2) || 0;
    return [first, second].filter((id) => id > 0);
  }
  function toggleAutoPickChampion(settings, championId) {
    const id = Number(championId) || 0;
    if (!id) return settings;
    let first = Number(settings.auto_pick_champion_id) || 0;
    let second = Number(settings.auto_pick_champion_id_2) || 0;
    if (first === id) {
      return { ...settings, auto_pick_champion_id: second, auto_pick_champion_id_2: 0 };
    }
    if (second === id) {
      return { ...settings, auto_pick_champion_id_2: 0 };
    }
    if (!first) {
      return { ...settings, auto_pick_champion_id: id };
    }
    if (!second) {
      return { ...settings, auto_pick_champion_id_2: id };
    }
    return { ...settings, auto_pick_champion_id_2: id };
  }
  function renderPickOrderSummary(list, pickIds) {
    if (pickIds.length === 0) {
      return '<p class="pick-order pick-order-empty">Click up to 2 champions \u2014 first is your pick, second is the backup.</p>';
    }
    const items = pickIds.map(
      (id, index) => `
      <span class="pick-order-item">
        <span class="pick-order-num">${index + 1}</span>
        <img class="pick-order-icon" src="${iconUrl(id)}" alt="">
        ${championName(list, id)}
        <button class="close pick-order-remove" type="button" data-remove-pick="${id}" aria-label="Remove">\u2715</button>
      </span>`
    ).join("");
    return `<div class="pick-order">${items}</div>`;
  }
  function renderOrderedChampionPicker({ list, query, pickIds, compact }) {
    const order = new Map(pickIds.map((id, index) => [id, index + 1]));
    const cells = list.map((c) => {
      const slot = order.get(c.id);
      return `
      <button class="champ ${slot ? "champ-on" : ""}"
              data-champ="${c.id}" data-for="auto_pick" title="${c.name}">
        <img src="${iconUrl(c.id)}" alt="" loading="lazy">
        ${slot ? `<span class="champ-slot">${slot}</span>` : ""}
      </button>`;
    }).join("");
    return `
    <input class="hextech-input" type="search" data-search="auto_pick_champion_id"
           value="${String(query || "").replace(/"/g, "&quot;")}"
           placeholder="Search champions...">
    <div class="champ-grid${compact ? " champ-grid-sm" : ""}">${cells || '<p class="check-help">No champions match.</p>'}</div>`;
  }
  function renderAutoPick(settings, { disabled, list, allList, query }) {
    const pickIds = autoPickOrder(settings);
    const names = allList || list;
    return `
    <h2 class="screen-title">Auto Pick</h2>
    <p class="screen-sub">Chooses your champion when your turn comes round. If the first is banned or taken, the second is used.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: "auto_pick",
      label: "Pick a champion automatically",
      checked: !!settings.auto_pick,
      disabled
    })}

    ${renderCheckRow({
      id: "insta_lock",
      label: "Insta Lock",
      help: "Locks the champion in the instant the pick opens, instead of only hovering it. Nobody can take it from you, and you cannot change your mind.",
      checked: !!settings.insta_lock,
      disabled: disabled || !settings.auto_pick
    })}

    <div class="field ${settings.auto_pick ? "" : "field-off"}">
      <div class="field-head">
        <span class="field-label">Champions</span>
        <span class="field-value">${pickIds.length ? `${pickIds.length} selected` : "none chosen"}</span>
      </div>
      ${renderPickOrderSummary(names, pickIds)}
      ${renderOrderedChampionPicker({ list, query, pickIds, compact: true })}
    </div>`;
  }
  function renderAutoBan(settings, { disabled, list, query }) {
    return `
    <h2 class="screen-title">Auto Ban</h2>
    <p class="screen-sub">Bans a champion for you when the ban phase reaches your turn.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: "auto_ban",
      label: "Ban a champion automatically",
      help: "A ban is always locked in \u2014 hovering a ban bans nothing.",
      checked: !!settings.auto_ban,
      disabled
    })}

    <div class="field ${settings.auto_ban ? "" : "field-off"}">
      <div class="field-head">
        <span class="field-label">Champion</span>
        <span class="field-value">${championName(list, settings.auto_ban_champion_id)}</span>
      </div>
      ${renderChampionPicker({
      id: "auto_ban_champion_id",
      list,
      query,
      selectedId: settings.auto_ban_champion_id
    })}
    </div>`;
  }
  function renderStatus(text) {
    const safe = String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
    <h2 class="screen-title">Status Message</h2>
    <p class="screen-sub">
      Your chat presence. Line breaks work here \u2014 the client's own field is a
      single-line input and cannot hold them.
    </p>
    <div class="rule"></div>

    <textarea class="status-box" id="status-text" spellcheck="false"
              placeholder="Type or paste your status. ASCII art welcome.">${safe}</textarea>

    <div class="status-actions">
      <span class="status-count" id="status-count"></span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-muted" id="status-clear">Clear</button>
      <button class="hextech-btn" id="status-save">Save</button>
    </div>`;
  }
  function describeStatus(text) {
    const t = String(text ?? "");
    const lines = t === "" ? 0 : t.split("\n").length;
    return `${t.length} chars \xB7 ${lines} line${lines === 1 ? "" : "s"}`;
  }
  var PROFILE_TABS = [
    { id: "rank", label: "Rank" },
    { id: "banner", label: "Banner" },
    { id: "riot-id", label: "Riot ID" }
  ];
  function renderSelect(id, list, selected) {
    const opts = list.map((o) => {
      const value = o.id ?? o;
      const label = o.label ?? o;
      return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
    }).join("");
    return `
    <span class="select-wrap">
      <select class="select-field" id="${id}">${opts}</select>
      <span class="select-arrows" aria-hidden="true">
        <span>\u25B2</span><span>\u25BC</span>
      </span>
    </span>`;
  }
  function renderRankTab(lol) {
    const tier = lol.rankedLeagueTier || "";
    const tiles = TIERS.map(
      (t) => `
    <button class="rank ${t === tier ? "rank-on" : ""}" data-tier="${t}">
      <img src="${RANK_ICONS[t] || RANK_ICONS.UNRANKED}" alt="">
      <span>${t.charAt(0) + t.slice(1).toLowerCase()}</span>
    </button>`
    ).join("");
    return `
    <div class="rank-grid">${tiles}</div>

    <div class="row">
      <span class="field-label" style="min-width:72px">Division</span>
      ${renderSelect("rank-div", DIVISIONS, lol.rankedLeagueDivision || "I")}
    </div>
    <div class="row">
      <span class="field-label" style="min-width:72px">Queue</span>
      ${renderSelect("rank-queue", QUEUES, lol.rankedLeagueQueue || QUEUES[0].id)}
    </div>

    <div class="rule"></div>

    <div class="row">
      <span class="field-label" style="min-width:72px">Crystal</span>
      ${renderSelect("crystal", CRYSTALS, lol.challengeCrystalLevel || "IRON")}
    </div>

    <div class="status-actions">
      <span class="status-count">Shown next to your name in chat. Your real rank is unchanged.</span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-muted" id="rank-clear">Reset</button>
      <button class="hextech-btn" id="rank-save">Apply</button>
    </div>

    <div class="rule"></div>
    <div class="field-head">
      <span class="field-label">Challenge badges</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      The three tokens on your profile. Clone copies the first into all three slots.
    </p>
    <div class="status-actions">
      <button class="hextech-btn hextech-btn-muted" id="badges-remove">Remove badges</button>
      <button class="hextech-btn" id="badges-clone">Clone first to all 3</button>
    </div>`;
  }
  var SKIN_TILE = { perRow: 5, rowHeight: 92, viewportHeight: 300 };
  function renderSkinCells(skins, selectedId, win) {
    return skins.slice(win.start, win.end).map(
      (s) => `
      <button class="skin ${s.id === selectedId ? "skin-on" : ""}" data-skin="${s.id}" title="${escapeHtml(s.name)}">
        <img src="${s.tile}" alt="" loading="lazy">
        <span>${escapeHtml(s.name)}</span>
      </button>`
    ).join("");
  }
  function skinWindow(total, scrollTop) {
    return visibleWindow({
      total,
      perRow: SKIN_TILE.perRow,
      rowHeight: SKIN_TILE.rowHeight,
      viewportHeight: SKIN_TILE.viewportHeight,
      scrollTop: scrollTop || 0
    });
  }
  function renderBannerTab({ skins, query, selectedId, scrollTop }) {
    const win = skinWindow(skins.length, scrollTop);
    const body = skins.length ? `<div class="skin-spacer" id="skin-spacer" style="height:${win.totalHeight}px">
         <div class="skin-grid" id="skin-grid" style="transform:translateY(${win.offsetY}px)">
           ${renderSkinCells(skins, selectedId, win)}
         </div>
       </div>` : '<p class="check-help">No skins match.</p>';
    return `
    <input class="hextech-input" type="search" data-search="skins"
           value="${String(query || "").replace(/"/g, "&quot;")}"
           placeholder="Search ${skins.length} skins...">
    <div class="skin-viewport" id="skin-viewport">${body}</div>`;
  }
  function renderRiotIdTab() {
    return `
    <p class="check-help" style="margin:0 0 12px">
      Renaming is rate-limited by Riot, not by Drake. If it refuses, that is
      their cooldown talking.
    </p>
    <div class="split-input">
      <input class="split-name" id="riot-name" placeholder="Name" spellcheck="false">
      <img class="split-hash" src="${HASHTAG}" alt="#">
      <input class="split-tag" id="riot-tag" placeholder="TAG" maxlength="5" spellcheck="false">
    </div>
    <div class="status-actions">
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn" id="riot-id-save">Save ID</button>
    </div>`;
  }
  function renderProfile({ tab, lol, skins, skinQuery, backgroundId, skinScroll }) {
    const tabs = PROFILE_TABS.map(
      (t) => `<button class="pill" data-ptab="${t.id}" aria-selected="${t.id === tab}">${t.label}</button>`
    ).join("");
    const body = tab === "banner" ? renderBannerTab({ skins, query: skinQuery, selectedId: backgroundId, scrollTop: skinScroll }) : tab === "riot-id" ? renderRiotIdTab() : renderRankTab(lol);
    return `
    <h2 class="screen-title">Profile</h2>
    <p class="screen-sub">What other players see. None of this changes your account.</p>
    <div class="pill-row">${tabs}</div>
    <div class="rule"></div>
    ${body}`;
  }
  function renderFriends(list) {
    if (list.length === 0) {
      return `
      <h2 class="screen-title">Friends</h2>
      <p class="screen-sub">Nobody on the list, or the client has not shared it yet.</p>`;
    }
    const rows = list.map(
      (f) => `
      <div class="friend">
        <span class="dot ${f.online ? "dot-on" : ""}"></span>
        <span class="friend-name">${escapeHtml(f.riotId)}</span>
        <span class="friend-note">${escapeHtml(f.note || f.statusMessage || "")}</span>
      </div>`
    ).join("");
    const online = list.filter((f) => f.online).length;
    return `
    <h2 class="screen-title">Friends</h2>
    <p class="screen-sub">${online} online of ${list.length}. Notes are the ones you set in the client.</p>
    <div class="rule"></div>
    <div class="friend-list">${rows}</div>
    <div class="status-actions">
      <span class="status-count">Removing everyone cannot be undone from Drake.</span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-danger" id="friends-remove-all">Remove all</button>
    </div>`;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderSettings(settings, { disabled, version, update }) {
    const u = update || { phase: "idle" };
    const checking = u.phase === "checking";
    const checkLabel = checking ? "Checking\u2026" : "Check for updates";
    let updateNote = "";
    if (u.phase === "current") {
      updateNote = '<p class="check-help">Drake is up to date.</p>';
    } else if (u.phase === "available") {
      updateNote = `
      <p class="check-help">${escapeHtml(u.version)} is available.</p>
      <div class="status-actions">
        <button class="hextech-btn" id="install-update" ${disabled || checking ? "disabled" : ""}>Install now</button>
      </div>`;
    } else if (u.phase === "no_installer") {
      updateNote = `<p class="check-help">${escapeHtml(u.version)} is on GitHub but has no Windows installer yet.</p>`;
    } else if (u.phase === "error") {
      updateNote = `<p class="check-help">${escapeHtml(u.message || "Could not check for updates.")}</p>`;
    }
    return `
    <h2 class="screen-title">Settings</h2>
    <p class="screen-sub">How Drake itself behaves.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: "run_at_startup",
      label: "Start Drake with Windows",
      help: "Keeps the client injected before it launches, so this panel is always available.",
      checked: !!settings.run_at_startup,
      disabled
    })}

    <div class="rule"></div>

    ${renderCheckRow({
      id: "auto_reload_on_open",
      label: "Reload the client when Drake starts",
      help: "Only used when Drake finds the client already running without Drake loaded.",
      checked: !!settings.auto_reload_on_open,
      disabled
    })}

    <div class="rule"></div>

    ${renderCheckRow({
      id: "auto_update",
      label: "Install updates automatically",
      help: "Downloads the latest GitHub release and runs the installer. Windows will ask for permission because Drake lives in Program Files.",
      checked: settings.auto_update !== false,
      disabled
    })}

    <div class="field-head">
      <span class="field-label">Updates</span>
      <span class="field-value">v${escapeHtml(version || "?")}</span>
    </div>
    <div class="status-actions">
      <button class="hextech-btn" id="check-updates" ${disabled || checking ? "disabled" : ""}>${checkLabel}</button>
    </div>
    ${updateNote}

    <div class="rule"></div>

    ${renderCheckRow({
      id: "unlock_status_message",
      label: "Unlock the status message field",
      help: "Removes the client's 25-character cap on your own status message and gives the field room to breathe. Takes effect on the next client reload.",
      checked: !!settings.unlock_status_message,
      disabled
    })}

    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Client</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Reloads the League client UI. Use this when Drake injected while the
      client was already open, or after a change that only applies on a reload.
    </p>
    <div class="status-actions">
      <button class="hextech-btn" id="restart-client">Restart client</button>
    </div>`;
  }

  // src/features/status.js
  var STATUS_ROUTE = "/lol-chat/v1/me";
  function normalise(text) {
    const folded = String(text ?? "").replace(/\r\n/g, "\n");
    return folded.trim() === "" ? "" : folded;
  }
  function makeStatus({ lcu: lcu2 }) {
    return {
      async read() {
        try {
          const me = await lcu2.get(STATUS_ROUTE);
          return me && me.statusMessage || "";
        } catch {
          return "";
        }
      },
      async write(text) {
        const statusMessage = normalise(text);
        let res;
        try {
          res = await lcu2.put(STATUS_ROUTE, { statusMessage });
        } catch (e) {
          return { ok: false, reason: `could not reach the client (${e.message})` };
        }
        if (res && res.ok === false) {
          return { ok: false, reason: `the client rejected it (${res.status})` };
        }
        return { ok: true };
      }
    };
  }

  // src/features/restartUx.js
  var RESTART_UX_ROUTE = "/riotclient/kill-and-restart-ux";
  function makeRestartUx({ lcu: lcu2 }) {
    return {
      async restart() {
        try {
          const res = await lcu2.post(RESTART_UX_ROUTE);
          if (res && res.ok === false) {
            return { ok: false, reason: `the client refused (${res.status})` };
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: `could not reach the client (${e.message})` };
        }
      }
    };
  }

  // src/features/openUrl.js
  function makeOpener({ port, token, fetchImpl = fetch }) {
    return {
      async open(url) {
        try {
          const res = await fetchImpl(`http://127.0.0.1:${port}/open-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, url })
          });
          if (res.ok) return { ok: true };
          if (res.status === 403) return { ok: false, reason: "the tray refused that address" };
          return { ok: false, reason: `the tray could not open it (${res.status})` };
        } catch {
          return { ok: false, reason: "the Drake tray is not running" };
        }
      }
    };
  }

  // src/features/challenges.js
  var CHALLENGE_PREFS_ROUTE = "/lol-challenges/v1/update-player-preferences";
  var CHALLENGE_CLIENT_STATE_ROUTE = "/lol-challenges/v1/client-state";
  var CHALLENGE_SUMMARY_ROUTE = "/lol-challenges/v1/summary-player-data/local-player";
  var READ_ROUTES = [CHALLENGE_CLIENT_STATE_ROUTE, CHAT_ME, CHALLENGE_SUMMARY_ROUTE];
  function readChallengeIdSlots(payload) {
    if (!payload) return [];
    const lol = payload?.lol ?? (payload?.challengeTokensSelected !== void 0 ? payload : null);
    const tokenStr = (typeof lol === "object" && lol ? lol.challengeTokensSelected : void 0) ?? payload?.challengeTokensSelected;
    if (typeof tokenStr === "string" && tokenStr.trim()) {
      return tokenStr.split(",").map((part) => Number(part.trim()) || 0);
    }
    const ids = payload?.preferences?.challengeIds ?? payload?.playerPreferences?.challengeIds ?? payload?.challengeIds ?? [];
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => {
      const num = Number(id);
      return Number.isFinite(num) ? num : 0;
    });
  }
  function readFirstSlotChallengeId(payload) {
    const first = readChallengeIdSlots(payload)[0];
    return first > 0 ? first : 0;
  }
  function accepted2(res) {
    return !res || res.ok !== false;
  }
  function makeChallenges({ lcu: lcu2 }) {
    async function writeIds(ids) {
      try {
        const res = await lcu2.post(CHALLENGE_PREFS_ROUTE, { challengeIds: ids });
        if (!accepted2(res)) {
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    }
    async function readFirstBadgeId() {
      for (const route of READ_ROUTES) {
        try {
          const raw = await lcu2.get(route);
          const payload = route === CHAT_ME ? readLol(raw) : raw;
          const first = readFirstSlotChallengeId(payload);
          if (first) return first;
        } catch {
        }
      }
      return 0;
    }
    return {
      removeBadges() {
        return writeIds([]);
      },
      async cloneFirstBadge() {
        try {
          const first = await readFirstBadgeId();
          if (!first) return { ok: false, reason: "no badge equipped in the first slot" };
          return writeIds([first, first, first]);
        } catch (e) {
          return { ok: false, reason: `could not read your badges (${e.message})` };
        }
      }
    };
  }

  // src/features/profileRank.js
  function readProfileRank(settings) {
    return {
      tier: String(settings?.profile_rank_tier || "").trim(),
      division: settings?.profile_rank_division || "I",
      queue: settings?.profile_rank_queue || "RANKED_SOLO_5x5",
      crystal: settings?.profile_rank_crystal || "IRON"
    };
  }
  function profileRankPatch({ tier, division, queue, crystal }) {
    return {
      profile_rank_tier: tier,
      profile_rank_division: division,
      profile_rank_queue: queue,
      profile_rank_crystal: crystal
    };
  }
  function rankNeedsRefresh(lol, cfg) {
    if (!cfg.tier) return false;
    return lol.rankedLeagueTier !== cfg.tier || lol.rankedLeagueDivision !== cfg.division || lol.rankedLeagueQueue !== cfg.queue || lol.challengeCrystalLevel !== cfg.crystal;
  }
  async function applyProfileRank(presence2, cfg) {
    if (!cfg.tier) return { ok: true };
    const rank = await presence2.setRank({
      tier: cfg.tier,
      division: cfg.division,
      queue: cfg.queue
    });
    if (!rank.ok) return rank;
    return presence2.setBadges({ crystal: cfg.crystal });
  }
  function startProfileRankRefresh({ subscribe: subscribe2, getSettings, presence: presence2, lcu: lcu2 }) {
    let refreshing = false;
    async function refreshIfNeeded() {
      if (refreshing) return;
      const cfg = readProfileRank(getSettings());
      if (!cfg.tier) return;
      let lol;
      try {
        lol = readLol(await lcu2.get(CHAT_ME));
      } catch {
        return;
      }
      if (!rankNeedsRefresh(lol, cfg)) return;
      refreshing = true;
      try {
        await applyProfileRank(presence2, cfg);
      } finally {
        refreshing = false;
      }
    }
    void refreshIfNeeded();
    return subscribe2(GAMEFLOW_PHASE_ROUTE, (payload) => {
      const phase = readGameflowPhase2(payload);
      if (!phase || isInGamePhase(phase)) return;
      void refreshIfNeeded();
    });
  }

  // src/features/profile.js
  var SAVE_ALIAS = "/lol-summoner/v1/save-alias";
  var FRIENDS_ROUTE = "/lol-chat/v1/friends";
  function splitRiotId(raw) {
    const text = String(raw ?? "").trim();
    const at = text.lastIndexOf("#");
    if (at <= 0) return null;
    const gameName = text.slice(0, at).trim();
    const tagLine = text.slice(at + 1).trim();
    if (!gameName || !tagLine) return null;
    return { gameName, tagLine };
  }
  function makeRiotId({ lcu: lcu2 }) {
    return {
      async save(raw) {
        const parts = splitRiotId(raw);
        if (!parts) {
          return { ok: false, reason: "enter it as name#tag" };
        }
        try {
          const res = await lcu2.post(SAVE_ALIAS, parts);
          if (res && res.ok === false) {
            return { ok: false, reason: `the client refused it (${res.status})` };
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: `could not reach the client (${e.message})` };
        }
      }
    };
  }
  var OFFLINE = /* @__PURE__ */ new Set(["offline", "mobile"]);
  function normaliseFriends(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => {
      const name = f.gameName || f.name || "";
      const tag = f.gameTag || "";
      return {
        id: f.id || f.puuid || name,
        name,
        riotId: tag ? `${name}#${tag}` : name,
        availability: f.availability || "offline",
        online: !OFFLINE.has(f.availability),
        note: f.note || "",
        statusMessage: f.statusMessage || "",
        group: f.groupName || ""
      };
    }).filter((f) => f.name).sort((a, b) => a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1);
  }
  async function removeAllFriends({ lcu: lcu2, friends }) {
    let removed = 0;
    let failed = 0;
    for (const f of friends || []) {
      try {
        const res = await lcu2.delete(`${FRIENDS_ROUTE}/${f.id}`);
        if (res && res.ok === false) failed += 1;
        else removed += 1;
      } catch {
        failed += 1;
      }
    }
    return { removed, failed };
  }
  async function loadFriends(lcu2) {
    try {
      return normaliseFriends(await lcu2.get(FRIENDS_ROUTE));
    } catch {
      return [];
    }
  }

  // src/features/skins.js
  var SKINS_ROUTE = "/lol-game-data/assets/v1/skins.json";
  var PROFILE_ROUTE = "/lol-summoner/v1/current-summoner/summoner-profile";
  function fold2(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normaliseSkins(raw) {
    if (!raw || typeof raw !== "object") return [];
    return Object.values(raw).filter((s) => s && s.id && s.name && s.tilePath).map((s) => ({ id: s.id, name: s.name, tile: s.tilePath })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function searchSkins(list, query) {
    const q = fold2(query).trim();
    if (!q) return list;
    return list.filter((s) => fold2(s.name).includes(q));
  }
  async function loadSkins(lcu2) {
    try {
      return normaliseSkins(await lcu2.get(SKINS_ROUTE));
    } catch {
      return [];
    }
  }
  function makeBackground({ lcu: lcu2 }) {
    return {
      async set(skinId) {
        try {
          const res = await lcu2.post(PROFILE_ROUTE, {
            key: "backgroundSkinId",
            value: Number(skinId)
          });
          if (res && res.ok === false) {
            return { ok: false, reason: `the client refused it (${res.status})` };
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: `could not reach the client (${e.message})` };
        }
      }
    };
  }

  // src/ui/autoSize.js
  function fittedHeight({ scrollHeight, min, max }) {
    return Math.min(Math.max(scrollHeight, min), max);
  }
  function autoSize(el, { min, max }) {
    if (!el) return;
    if (el.dataset && el.dataset[MANUAL]) return;
    el.style.height = "auto";
    el.style.height = `${fittedHeight({ scrollHeight: el.scrollHeight, min, max })}px`;
  }
  var MANUAL = "manualHeight";
  function markManual(el) {
    if (!el || !el.dataset) return;
    el.dataset[MANUAL] = "1";
  }

  // src/ui/sfx.js
  var BASE = "/fe/lol-static-assets/sounds";
  function soundUrl(name) {
    return `${BASE}/${name}.ogg`;
  }
  var SFX = {
    click: "sfx-uikit-button-gold-click",
    goldHover: "sfx-uikit-button-gold-hover",
    hover: "sfx-uikit-button-generic-hover",
    secondary: "sfx-uikit-button-generic-click",
    close: "sfx-uikit-button-circlex-click",
    tab: "sfx-uikit-button-text-click",
    radio: "sfx-uikit-button-circlegold-click",
    radioHover: "sfx-uikit-button-circlegold-hover",
    check: "sfx-uikit-generic-click-small",
    select: "sfx-uikit-button-flyout-open-click",
    card: "sfx-uikit-grid-big-click",
    cardHover: "sfx-uikit-grid-big-hover",
    tile: "sfx-uikit-grid-click",
    tileHover: "sfx-uikit-grid-hover"
  };
  var KNOWN = new Set(Object.values(SFX));
  function sfxFor(el) {
    const has = (c) => !!el?.classList?.contains(c);
    if (has("close")) return { click: SFX.close, hover: SFX.hover };
    if (has("check-row")) return { click: SFX.check, hover: SFX.hover };
    if (has("select-field")) return { click: SFX.select, hover: SFX.hover };
    if (has("pill")) return { click: SFX.radio, hover: SFX.radioHover };
    if (has("navitem")) return { click: SFX.tab, hover: SFX.hover };
    if (has("champ") || has("skin")) return { click: SFX.card, hover: SFX.cardHover };
    if (has("rank")) return { click: SFX.tile, hover: SFX.tileHover };
    if (has("slider")) return { click: SFX.check, hover: null };
    if (has("hextech-btn-muted") || has("hextech-btn-danger")) {
      return { click: SFX.secondary, hover: SFX.hover };
    }
    if (has("hextech-btn")) return { click: SFX.click, hover: SFX.goldHover };
    return { click: SFX.click, hover: SFX.hover };
  }
  function makeSfx({ AudioImpl = typeof Audio !== "undefined" ? Audio : null, enabled = true, volume = 0.35 } = {}) {
    const players = /* @__PURE__ */ new Map();
    let on = enabled;
    return {
      setEnabled(next) {
        on = !!next;
      },
      play(name) {
        if (!on || !AudioImpl || !KNOWN.has(name)) return;
        let audio = players.get(name);
        if (!audio) {
          audio = new AudioImpl(soundUrl(name));
          audio.volume = volume;
          players.set(name, audio);
        } else {
          audio.pause();
          audio.currentTime = 0;
        }
        const played = audio.play();
        if (played && typeof played.catch === "function") played.catch(() => {
        });
      }
    };
  }

  // src/ui/settingsClient.js
  var TRAY_DOWN = "the Drake tray is not running";
  function makeSettingsClient({ port, token, fetchImpl = fetch, reloadConfig }) {
    let currentToken = token;
    async function post(settings) {
      return fetchImpl(`http://127.0.0.1:${port}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken, settings })
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
      }
    };
  }

  // src/features/update.js
  var TRAY_DOWN2 = "the Drake tray is not running";
  function makeUpdater({ port, token, fetchImpl = fetch, reloadConfig }) {
    let currentToken = token;
    async function post(path) {
      return fetchImpl(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: currentToken })
      });
    }
    async function withRetry(run) {
      let res;
      try {
        res = await run();
      } catch {
        return { ok: false, reason: TRAY_DOWN2 };
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
        return { ok: false, reason: TRAY_DOWN2 };
      }
    }
    return {
      async check() {
        const out = await withRetry(() => post("/update/check"));
        if (out.ok === false) return out;
        const { res } = out;
        if (res.status === 409) {
          return { ok: false, reason: "an update is already in progress" };
        }
        if (!res.ok) {
          return { ok: false, reason: `could not check for updates (${res.status})` };
        }
        const body = await res.json();
        return { ok: true, ...body };
      },
      async apply() {
        const out = await withRetry(() => post("/update/apply"));
        if (out.ok === false) return out;
        const { res } = out;
        if (res.status === 409) {
          return { ok: false, reason: "an update is already in progress" };
        }
        if (res.status === 204 || res.ok) {
          return { ok: true, installing: true };
        }
        return { ok: false, reason: `could not install the update (${res.status})` };
      }
    };
  }

  // src/ui/dodgeDock.js
  var ROSE_BUTTON_SELECTOR = ".rose-custom-wheel-button";
  var DOCK_GAP_PX = 8;
  function inChampSelect(session) {
    return session != null;
  }
  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function findAnchor(doc) {
    const rose = doc.querySelector(ROSE_BUTTON_SELECTOR);
    if (isVisible(rose)) return rose;
    return null;
  }
  function layoutKey(dockEl, anchor, win) {
    if (!anchor) return "fallback";
    const rect = anchor.getBoundingClientRect();
    return `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${win.innerHeight}`;
  }
  function layoutDock(dockEl, anchor, win) {
    if (!dockEl) return false;
    const key = layoutKey(dockEl, anchor, win);
    if (dockEl.dataset.layoutKey === key) return true;
    dockEl.dataset.layoutKey = key;
    if (!anchor) {
      dockEl.style.left = "auto";
      dockEl.style.right = "20px";
      dockEl.style.bottom = "70px";
      dockEl.style.transform = "none";
      return true;
    }
    const rect = anchor.getBoundingClientRect();
    dockEl.style.right = "auto";
    dockEl.style.left = `${rect.left + rect.width / 2}px`;
    dockEl.style.bottom = `${win.innerHeight - rect.top + DOCK_GAP_PX}px`;
    dockEl.style.transform = "translateX(-50%)";
    return true;
  }
  function watchAnchor(doc, win, cb) {
    let frame = 0;
    let intervalId = 0;
    const tick = () => {
      if (frame) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        cb();
      });
    };
    win.addEventListener("resize", tick);
    const mo = new MutationObserver(tick);
    mo.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "data-hidden"]
    });
    intervalId = win.setInterval(tick, 1500);
    tick();
    return () => {
      if (frame) win.cancelAnimationFrame(frame);
      win.clearInterval(intervalId);
      win.removeEventListener("resize", tick);
      mo.disconnect();
    };
  }

  // assets/drake-spritesheet.png
  var drake_spritesheet_default = "data:image/png;base64,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";

  // src/ui/socialToggle.js
  var SOCIAL_BAR_SELECTOR = ".lol-social-version-bar";
  var TOGGLE_SELECTOR = "button[data-drake-toggle]";
  var STYLE_ID = "drake-social-toggle-style";
  var BUG_BTN_SELECTOR = 'button[data-dd-action-name="button.social.report_bug"], button.bug-report-button:not([data-drake-toggle])';
  function socialToggleCss() {
    return `
button.bug-report-button[data-drake-toggle] {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  min-height: 34px !important;
  margin: 0 0 0 4px;
  padding: 0 !important;
  border: none !important;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 0 !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  background-color: transparent !important;
  background-image: url("${drake_spritesheet_default}") !important;
  background-repeat: no-repeat !important;
  background-size: 100% 400% !important;
  background-position: 0 0 !important;
}
button.bug-report-button[data-drake-toggle]:hover,
button.bug-report-button[data-drake-toggle][aria-pressed="true"] {
  background-position: 0 33.333% !important;
}
button.bug-report-button[data-drake-toggle]:active {
  background-position: 0 66.666% !important;
}
button.bug-report-button[data-drake-toggle]:disabled {
  background-position: 0 100% !important;
}`;
  }
  function isVisible2(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? el : null;
  }
  function searchSocialBar(root) {
    if (!root?.querySelector) return null;
    const bar = isVisible2(root.querySelector(SOCIAL_BAR_SELECTOR));
    if (bar) return bar;
    const bug = root.querySelector(BUG_BTN_SELECTOR);
    if (bug?.parentElement) return isVisible2(bug.parentElement);
    return null;
  }
  function searchIframes(doc) {
    if (typeof doc.querySelectorAll !== "function") return null;
    for (const iframe of doc.querySelectorAll("iframe")) {
      try {
        const found = searchSocialBar(iframe.contentDocument);
        if (found) return found;
      } catch {
      }
    }
    return null;
  }
  function findSocialBar(doc) {
    return searchSocialBar(doc) || searchIframes(doc);
  }
  function injectSocialToggleStyles(doc) {
    if (!doc?.createElement) return;
    if (typeof doc.getElementById === "function" && doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = socialToggleCss();
    (doc.head || doc.documentElement)?.appendChild(style);
  }
  function syncSocialToggle(doc, open) {
    const bar = findSocialBar(doc);
    const btn = bar?.querySelector?.("[data-drake-toggle]") || doc.querySelector?.(TOGGLE_SELECTOR);
    if (!btn) return;
    btn.setAttribute("aria-label", open ? "Close Drake" : "Open Drake");
    btn.setAttribute("aria-pressed", String(open));
  }
  function mountSocialToggle(doc, { onToggle, isOpen }) {
    const bar = findSocialBar(doc);
    if (!bar) return false;
    const owner = bar.ownerDocument || doc;
    injectSocialToggleStyles(owner);
    let btn = bar.querySelector("[data-drake-toggle]");
    if (btn && btn.parentNode !== bar) {
      bar.appendChild(btn);
    }
    if (!btn) {
      btn = owner.createElement("button");
      btn.type = "button";
      btn.className = "bug-report-button";
      btn.innerHTML = "";
      btn.setAttribute("data-drake-toggle", "true");
      btn.setAttribute("data-dd-action-name", "button.social.drake");
      btn.setAttribute("title", "Drake");
      btn.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        },
        true
      );
      const bugBtn = bar.querySelector(BUG_BTN_SELECTOR);
      if (bugBtn?.nextSibling) bar.insertBefore(btn, bugBtn.nextSibling);
      else bar.appendChild(btn);
    }
    syncSocialToggle(doc, isOpen());
    if (!mountSocialToggle.logged) {
      mountSocialToggle.logged = true;
      console.log("[Drake] social toggle mounted in", bar.className || SOCIAL_BAR_SELECTOR);
    }
    return true;
  }
  function watchSocialToggle(doc, win, cb) {
    injectSocialToggleStyles(doc);
    return watchAnchor(doc, win, cb);
  }

  // src/features/sgpMatchHistory.js
  var ENTITLEMENTS_ROUTE = "/entitlements/v1/token";
  var CHAT_ME_ROUTE = "/lol-chat/v1/me";
  var SGP_SERVERS = {
    TW2: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    SG2: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    PH2: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    VN2: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    TH2: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    JP1: { matchHistory: "https://apne1-red.pp.sgp.pvp.net" },
    KR: { matchHistory: "https://apne1-red.pp.sgp.pvp.net" },
    NA1: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    BR1: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    LA1: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    LA2: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    OC1: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    EUW: { matchHistory: "https://euc1-red.pp.sgp.pvp.net" },
    EUN1: { matchHistory: "https://euc1-red.pp.sgp.pvp.net" },
    TR1: { matchHistory: "https://euc1-red.pp.sgp.pvp.net" },
    RU: { matchHistory: "https://euc1-red.pp.sgp.pvp.net" },
    PBE: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    EUC1: { matchHistory: "https://euc1-red.pp.sgp.pvp.net" },
    USW2: { matchHistory: "https://usw2-red.pp.sgp.pvp.net" },
    APSE1: { matchHistory: "https://apse1-red.pp.sgp.pvp.net" },
    APNE1: { matchHistory: "https://apne1-red.pp.sgp.pvp.net" },
    TENCENT_HN1: { matchHistory: "https://hn1-k8s-sgp.lol.qq.com:21019" },
    TENCENT_HN10: { matchHistory: "https://hn10-k8s-sgp.lol.qq.com:21019" },
    TENCENT_TJ100: { matchHistory: "https://tj100-sgp.lol.qq.com:21019" },
    TENCENT_TJ101: { matchHistory: "https://tj101-sgp.lol.qq.com:21019" },
    TENCENT_NJ100: { matchHistory: "https://nj100-sgp.lol.qq.com:21019" },
    TENCENT_GZ100: { matchHistory: "https://gz100-sgp.lol.qq.com:21019" },
    TENCENT_CQ100: { matchHistory: "https://cq100-sgp.lol.qq.com:21019" },
    TENCENT_BGP2: { matchHistory: "https://bgp2-k8s-sgp.lol.qq.com:21019" },
    TENCENT_PBE: { matchHistory: "https://pbe-sgp.lol.qq.com:21019" },
    TENCENT_PREPBE: { matchHistory: "https://prepbe-sgp.lol.qq.com:21019" }
  };
  var PLATFORM_ID_TO_SGP_KEY = {
    EUW1: "EUW",
    EUN: "EUN1",
    EUNE: "EUN1",
    EUN1: "EUN1",
    RU1: "RU",
    NA: "NA1",
    OCE: "OC1",
    BR1: "BR1",
    JP1: "JP1",
    KR: "KR",
    LA1: "LA1",
    LA2: "LA2",
    OC1: "OC1",
    TR1: "TR1",
    TW2: "TW2",
    SG2: "SG2",
    PH2: "PH2",
    VN2: "VN2",
    TH2: "TH2",
    PBE: "PBE"
  };
  var TENCENT_PLATFORM_IDS = /* @__PURE__ */ new Set([
    "HN1",
    "HN2",
    "HN3",
    "HN4",
    "HN5",
    "HN6",
    "HN7",
    "HN8",
    "HN9",
    "HN10",
    "HN11",
    "HN12",
    "HN13",
    "HN14",
    "HN15",
    "HN16",
    "HN17",
    "HN18",
    "HN19",
    "WT1",
    "WT2",
    "WT3",
    "WT4",
    "WT5",
    "WT6",
    "WT7",
    "EDU1",
    "BGP1",
    "BGP2",
    "NJ100",
    "GZ100",
    "CQ100",
    "TJ100",
    "TJ101",
    "PBE",
    "PREPBE"
  ]);
  function queueIdToTag(queueId) {
    const id = Number(queueId) || 0;
    return id > 0 ? `q_${id}` : "";
  }
  function normalizeSgpServerKey(rawCode) {
    const code = String(rawCode || "").toUpperCase();
    const mapped = PLATFORM_ID_TO_SGP_KEY[code] || code;
    return SGP_SERVERS[mapped] ? mapped : "";
  }
  function serverIdFromPlatformId(platformId) {
    const id = String(platformId || "").toUpperCase();
    if (!id) return "";
    if (TENCENT_PLATFORM_IDS.has(id)) return normalizeSgpServerKey(`TENCENT_${id}`);
    return normalizeSgpServerKey(id);
  }
  function serverIdFromIssuer(issuer) {
    const value = String(issuer || "");
    const tencentMatch = value.match(/https?:\/\/([a-z0-9]+)(?:-[a-z0-9]+)*\.lol\.qq\.com/i);
    if (tencentMatch) return normalizeSgpServerKey(`TENCENT_${tencentMatch[1].toUpperCase()}`);
    const externalMatch = value.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.lol\.sgp\.pvp\.net/i) || value.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.(?:lol\.)?sgp\.pvp\.net/i) || value.match(/https?:\/\/([a-z0-9]+)-/i);
    if (externalMatch) return normalizeSgpServerKey(externalMatch[1].toUpperCase());
    return "";
  }
  function resolveSgpServerId(chatMe, token) {
    return serverIdFromPlatformId(chatMe?.platformId) || serverIdFromIssuer(token?.issuer) || "";
  }
  function sgpMatchHistoryUrl(serverId, puuid, { startIndex = 0, count = 100, tag = "" } = {}) {
    const base = SGP_SERVERS[serverId]?.matchHistory;
    if (!base || !puuid) return "";
    const params = new URLSearchParams();
    params.set("startIndex", String(startIndex));
    params.set("count", String(count));
    if (tag) params.set("tag", tag);
    return `${base}/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?${params}`;
  }
  function readPuuid(entry) {
    return entry?.puuid || entry?.playerPuuid || entry?.summoner?.puuid || "";
  }
  function slimParticipant(participant) {
    if (!participant) return null;
    const stats = participant.stats && typeof participant.stats === "object" ? participant.stats : {};
    const win = participant.win ?? stats.win;
    const kills = participant.kills ?? stats.kills;
    const deaths = participant.deaths ?? stats.deaths;
    const assists = participant.assists ?? stats.assists;
    return {
      puuid: readPuuid(participant),
      participantId: participant.participantId,
      championId: participant.championId || participant.champion?.id || 0,
      win,
      kills,
      deaths,
      assists,
      stats: { win, kills, deaths, assists }
    };
  }
  function slimIdentity(identity) {
    const player = identity?.player || {};
    return {
      participantId: identity.participantId,
      player: { puuid: readPuuid(player) }
    };
  }
  function participantMatches(participant, puuid) {
    return Boolean(puuid) && readPuuid(participant) === puuid;
  }
  function identityMatches(identity, puuid) {
    return Boolean(puuid) && readPuuid(identity?.player || {}) === puuid;
  }
  function slimMatchGame(entry, focusPuuid = "") {
    if (!entry) return null;
    const json = entry.json && typeof entry.json === "object" ? entry.json : entry;
    let participants = Array.isArray(json.participants) ? json.participants : [];
    let identities = Array.isArray(json.participantIdentities) ? json.participantIdentities : [];
    if (focusPuuid) {
      const focused = participants.filter((participant) => participantMatches(participant, focusPuuid));
      if (focused.length) {
        participants = focused;
        const keepIds = new Set(focused.map((participant) => Number(participant.participantId)).filter(Boolean));
        identities = identities.filter(
          (identity) => identityMatches(identity, focusPuuid) || keepIds.has(Number(identity.participantId))
        );
      }
    }
    return {
      queueId: json.queueId ?? json.gameQueueConfigId ?? json.queue?.id,
      seasonId: json.seasonId ?? json.gameSeasonId ?? json.season?.id ?? json.season?.seasonId,
      gameCreation: json.gameCreation,
      gameCreationDate: json.gameCreationDate,
      gameEndTimestamp: json.gameEndTimestamp,
      gameStartTime: json.gameStartTime,
      championId: json.championId,
      win: json.win,
      participants: participants.map(slimParticipant).filter(Boolean),
      participantIdentities: identities.map(slimIdentity)
    };
  }
  function normalizeMatchGames(payload, focusPuuid = "") {
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.games?.games) ? payload.games.games : Array.isArray(payload?.games) ? payload.games : [];
    return list.map((entry) => slimMatchGame(entry, focusPuuid)).filter(Boolean);
  }
  async function createSgpContext(lcu2) {
    if (!lcu2?.get) return null;
    try {
      const token = await lcu2.get(ENTITLEMENTS_ROUTE);
      if (!token?.accessToken) return null;
      let chatMe = null;
      try {
        chatMe = await lcu2.get(CHAT_ME_ROUTE);
      } catch {
      }
      const serverId = resolveSgpServerId(chatMe, token);
      if (!sgpMatchHistoryUrl(serverId, "x")) return null;
      return { accessToken: token.accessToken, serverId };
    } catch {
      return null;
    }
  }
  async function fetchQueueMatchHistory({
    lcu: lcu2,
    fetchImpl = fetch,
    puuid,
    queueId,
    count,
    sgp = null,
    signal
  }) {
    if (!puuid || signal?.aborted) return [];
    try {
      const ctx = sgp === void 0 ? await createSgpContext(lcu2) : sgp;
      if (!ctx?.accessToken || !ctx.serverId || signal?.aborted) return [];
      const url = sgpMatchHistoryUrl(ctx.serverId, puuid, {
        startIndex: 0,
        count,
        tag: queueIdToTag(queueId)
      });
      if (!url) return [];
      const resp = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${ctx.accessToken}` },
        signal
      });
      if (!resp?.ok) return [];
      return normalizeMatchGames(await resp.json(), puuid);
    } catch {
      return [];
    }
  }

  // src/features/teamRevealStats.js
  var TEAM_REVEAL_SAMPLE_SIZE = 20;
  var TEAM_REVEAL_SEASON_SAMPLE_SIZE = 100;
  var TEAM_REVEAL_SEASON_MAX = 300;
  var TEAM_REVEAL_NATIVE_HISTORY_MAX = 100;
  var TEAM_REVEAL_FETCH_CONCURRENCY = 1;
  var TEAM_REVEAL_RECENT_GAMES = 5;
  var LAST_12H_MS = 12 * 60 * 60 * 1e3;
  var RANKED_QUEUE_BY_ID = {
    420: "RANKED_SOLO_5x5",
    440: "RANKED_FLEX_SR"
  };
  var RANKED_SOLO = "RANKED_SOLO_5x5";
  var RANKED_FLEX = "RANKED_FLEX_SR";
  function readAssignedPosition(player) {
    const raw = String(player?.assignedPosition ?? player?.position ?? "").trim().toUpperCase();
    if (!raw || raw === "UNSELECTED") return "";
    return raw;
  }
  function readLobbyKey(session) {
    if (!session) return "";
    const gameId = session.gameId ?? session.gameData?.gameId;
    if (gameId != null && Number(gameId) !== 0) return `game:${gameId}`;
    const chat = session.chatDetails?.chatRoomName ?? session.chatDetails?.multiUserChatId ?? session.chatDetails?.mucJwtDto?.channelClaim;
    if (chat) return `chat:${chat}`;
    if (session.counter != null && session.counter >= 0) return `counter:${session.counter}`;
    return "";
  }
  function matchHistoryRoute(puuid, sampleSize = TEAM_REVEAL_SAMPLE_SIZE) {
    return `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=${sampleSize}`;
  }
  function rankedStatsRoute(puuid) {
    return `/lol-ranked/v1/ranked-stats/${puuid}`;
  }
  function currentSeasonRoute() {
    return "/lol-seasons/v1/season/product/LOL";
  }
  function readCurrentSeasonId(payload) {
    if (!payload) return 0;
    if (typeof payload.seasonId === "number") return payload.seasonId;
    const seasons = Array.isArray(payload) ? payload : payload.seasons || payload.currentSplitSeasons || payload.splitSeasons || [];
    for (const season of seasons) {
      if (season?.isActive || season?.active) {
        return readNumber(season.id ?? season.seasonId);
      }
    }
    if (!seasons.length) return 0;
    const sorted = [...seasons].sort(
      (a, b) => readNumber(b.id ?? b.seasonId) - readNumber(a.id ?? a.seasonId)
    );
    return readNumber(sorted[0]?.id ?? sorted[0]?.seasonId);
  }
  function readGameSeasonId(game) {
    return readNumber(game?.seasonId ?? game?.gameSeasonId ?? game?.season?.id ?? game?.season?.seasonId);
  }
  function formatWl(wins, losses, winRate) {
    const w = wins ?? 0;
    const l = losses ?? 0;
    const total = w + l;
    const rate = winRate ?? (total ? Math.round(w / total * 100) : 0);
    return `${w}W/${l}L \xB7 ${rate}%`;
  }
  function formatWlPair(wins, losses) {
    return `${wins ?? 0}W/${losses ?? 0}L`;
  }
  function readRankedQueueType(queueId) {
    return RANKED_QUEUE_BY_ID[Number(queueId)] || "";
  }
  function readQueueId(session) {
    const fromQueue = session?.gameData?.queue;
    return Number(fromQueue?.id ?? fromQueue?.queueId ?? session?.gameData?.queueId ?? 0) || 0;
  }
  function readGames(payload, puuid = "") {
    return normalizeMatchGames(payload, puuid);
  }
  function seasonHistoryCount(rank, fallback = TEAM_REVEAL_SEASON_SAMPLE_SIZE) {
    const wins = rank?.wins || 0;
    const losses = rank?.losses || 0;
    const total = wins + losses;
    if (wins > 0 && losses === 0) {
      return Math.min(Math.max(Math.ceil(wins / 0.55), fallback), TEAM_REVEAL_SEASON_MAX);
    }
    if (total <= 0) return fallback;
    return Math.min(Math.max(total, fallback), TEAM_REVEAL_SEASON_MAX);
  }
  function readGameQueueId(game) {
    return Number(game?.queueId ?? game?.gameQueueConfigId ?? game?.queue?.id ?? 0) || 0;
  }
  function pickParticipant(game, puuid) {
    const participants = Array.isArray(game?.participants) ? game.participants : [];
    return participants.find((p) => p?.puuid === puuid || p?.playerPuuid === puuid || p?.summoner?.puuid === puuid) || null;
  }
  function readWin(game, participant) {
    const raw = participant?.stats?.win ?? participant?.win ?? game?.win;
    if (raw === true || raw === 1) return true;
    if (raw === false || raw === 0) return false;
    if (typeof raw === "string") return raw.toLowerCase() === "win" || raw.toLowerCase() === "true";
    return false;
  }
  function readNumber(value) {
    return Number(value) || 0;
  }
  function readChampionId(game, participant) {
    return readNumber(participant?.championId ?? participant?.champion?.id ?? game?.championId);
  }
  function readTimestamp(game) {
    return readNumber(game?.gameCreation) || readNumber(game?.gameCreationDate) || readNumber(game?.gameEndTimestamp) || readNumber(game?.gameStartTime) || 0;
  }
  function round2(value) {
    return Math.round(value * 100) / 100;
  }
  function readCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  function rankEntryScore(entry) {
    if (!entry) return -1;
    return readCount(entry.losses) * 100 + readCount(entry.games);
  }
  function listRankedQueueEntries(payload) {
    const out = [];
    const queueMap = payload?.queueMap && typeof payload.queueMap === "object" ? payload.queueMap : {};
    for (const [key, entry] of Object.entries(queueMap)) {
      if (!entry || typeof entry !== "object") continue;
      out.push({ ...entry, queueType: entry.queueType || key });
    }
    for (const entry of Array.isArray(payload?.queues) ? payload.queues : []) {
      if (!entry || typeof entry !== "object") continue;
      out.push(entry);
    }
    return out;
  }
  function pickQueueEntry(payload, queueType) {
    const matched = listRankedQueueEntries(payload).filter(
      (entry) => String(entry.queueType || "") === queueType
    );
    if (!matched.length) return payload?.queueMap?.[queueType] || null;
    matched.sort((a, b) => rankEntryScore(b) - rankEntryScore(a));
    return matched[0];
  }
  function readQueueRank(entry) {
    if (!entry) {
      return {
        tier: "",
        division: "",
        lp: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        hasRank: false
      };
    }
    const wins = readCount(entry.wins ?? entry.currentSeasonWinsForRewards);
    const games = readCount(entry.games);
    const parsedLosses = entry.losses != null && entry.losses !== "" ? readCount(entry.losses) : entry.loss != null && entry.loss !== "" ? readCount(entry.loss) : null;
    const losses = parsedLosses != null && !(parsedLosses === 0 && games > wins) ? parsedLosses : games >= wins && games > 0 ? games - wins : parsedLosses ?? 0;
    const total = wins + losses;
    const tier = String(entry.tier || "").trim();
    const division = String(entry.division || entry.rank || "").trim();
    return {
      tier,
      division,
      lp: readCount(entry.leaguePoints),
      wins,
      losses,
      winRate: total ? Math.round(wins / total * 100) : 0,
      hasRank: Boolean(tier && tier !== "NONE" && tier !== "UNRANKED") || total > 0
    };
  }
  function readRankedQueues(rankedPayload) {
    return {
      solo: readQueueRank(pickQueueEntry(rankedPayload, RANKED_SOLO)),
      flex: readQueueRank(pickQueueEntry(rankedPayload, RANKED_FLEX))
    };
  }
  function emptyPlayerStats() {
    return {
      wins: 0,
      losses: 0,
      winRate: 0,
      kda: 0,
      last12hWins: 0,
      last12hLosses: 0,
      mostPlayedChampionId: 0,
      mostPlayedCount: 0,
      matchesUsed: 0,
      queueScopedMatches: 0,
      recentGames: []
    };
  }
  function emptySeasonMain() {
    return {
      seasonMostPlayedChampionId: 0,
      seasonMostPlayedCount: 0,
      seasonMostPlayedWins: 0,
      seasonMostPlayedLosses: 0,
      seasonMostPlayedWinRate: 0
    };
  }
  function makeRevealRow({
    cellId,
    puuid,
    riotId,
    isLocalPlayer,
    rankedQueueType,
    ranks,
    assignedPosition = "",
    stats = emptyPlayerStats(),
    seasonMain = emptySeasonMain(),
    season
  }) {
    return {
      cellId,
      puuid,
      riotId,
      isLocalPlayer,
      rankedQueueType,
      assignedPosition,
      soloRank: ranks.solo,
      flexRank: ranks.flex,
      ...stats,
      ...seasonMain,
      ...season
    };
  }
  function yieldUi() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  async function mapPool(items, limit, mapper) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await mapper(items[index], index);
      }
    }
    const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () => worker());
    if (workers.length) await Promise.all(workers);
    return results;
  }
  function readSeasonStats(ranks, queueType) {
    const empty = {
      seasonWins: 0,
      seasonLosses: 0,
      seasonWinRate: 0,
      seasonTier: "",
      seasonDivision: "",
      seasonLp: 0,
      hasSeason: false
    };
    if (!queueType) return empty;
    const rank = queueType === RANKED_FLEX ? ranks.flex : queueType === RANKED_SOLO ? ranks.solo : null;
    if (!rank) return empty;
    return {
      seasonWins: rank.wins,
      seasonLosses: rank.losses,
      seasonWinRate: rank.winRate,
      seasonTier: rank.tier,
      seasonDivision: rank.division,
      seasonLp: rank.lp,
      hasSeason: rank.hasRank
    };
  }
  function resolveParticipantByIdentity(game, puuid) {
    const identities = Array.isArray(game?.participantIdentities) ? game.participantIdentities : [];
    const participants = Array.isArray(game?.participants) ? game.participants : [];
    const identity = identities.find((entry) => {
      const player = entry?.player || {};
      const idPuuid = player?.puuid || player?.playerPuuid || player?.summoner?.puuid;
      return idPuuid === puuid;
    });
    if (!identity?.participantId) return null;
    return participants.find((entry) => Number(entry?.participantId) === Number(identity.participantId)) || null;
  }
  function resolveParticipant(game, puuid) {
    return pickParticipant(game, puuid) || resolveParticipantByIdentity(game, puuid);
  }
  function buildPlayerStats(games, puuid, queueId, now) {
    const entries = [];
    for (const game of games) {
      const participant = resolveParticipant(game, puuid);
      if (!participant) continue;
      entries.push({
        game,
        participant,
        queueId: readGameQueueId(game)
      });
    }
    const queueScoped = queueId ? entries.filter((entry) => !entry.queueId || entry.queueId === queueId) : entries;
    const selected = queueScoped.length > 0 ? queueScoped : entries;
    let wins = 0;
    let losses = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let last12hWins = 0;
    let last12hLosses = 0;
    const championCounts = /* @__PURE__ */ new Map();
    const windowStart = now - LAST_12H_MS;
    for (const entry of selected) {
      const game = entry.game;
      const participant = entry.participant;
      const didWin = readWin(game, participant);
      if (didWin) wins += 1;
      else losses += 1;
      kills += readNumber(participant?.stats?.kills ?? participant?.kills);
      deaths += readNumber(participant?.stats?.deaths ?? participant?.deaths);
      assists += readNumber(participant?.stats?.assists ?? participant?.assists);
      const playedAt = readTimestamp(game);
      if (playedAt >= windowStart && playedAt <= now) {
        if (didWin) last12hWins += 1;
        else last12hLosses += 1;
      }
      const championId = readChampionId(game, participant);
      if (championId) {
        championCounts.set(championId, (championCounts.get(championId) || 0) + 1);
      }
    }
    const total = wins + losses;
    let mostPlayedChampionId = 0;
    let mostPlayedCount = 0;
    for (const [championId, count] of championCounts.entries()) {
      const bestCount = championCounts.get(mostPlayedChampionId) || 0;
      if (!mostPlayedChampionId || count > bestCount || count === bestCount && championId < mostPlayedChampionId) {
        mostPlayedChampionId = championId;
        mostPlayedCount = count;
      }
    }
    return {
      wins,
      losses,
      winRate: total ? Math.round(wins / total * 100) : 0,
      kda: deaths ? round2((kills + assists) / deaths) : round2(kills + assists),
      last12hWins,
      last12hLosses,
      mostPlayedChampionId,
      mostPlayedCount,
      matchesUsed: selected.length,
      queueScopedMatches: queueScoped.length,
      recentGames: listRecentGames(selected)
    };
  }
  function listRecentGames(entries, limit = TEAM_REVEAL_RECENT_GAMES) {
    const ordered = [...entries].sort((a, b) => readTimestamp(b.game) - readTimestamp(a.game));
    return ordered.slice(0, limit).map((entry) => ({
      championId: readChampionId(entry.game, entry.participant),
      win: readWin(entry.game, entry.participant),
      kills: readNumber(entry.participant?.stats?.kills ?? entry.participant?.kills),
      deaths: readNumber(entry.participant?.stats?.deaths ?? entry.participant?.deaths),
      assists: readNumber(entry.participant?.stats?.assists ?? entry.participant?.assists)
    }));
  }
  function pickMostPlayedChampion(championStats) {
    let championId = 0;
    let games = 0;
    for (const [id, stat] of championStats.entries()) {
      const count = stat.wins + stat.losses;
      if (!championId || count > games || count === games && id < championId) {
        championId = id;
        games = count;
      }
    }
    return { championId, games };
  }
  function listScopedEntries(games, puuid, queueId) {
    const entries = [];
    for (const game of games) {
      const participant = resolveParticipant(game, puuid);
      if (!participant) continue;
      entries.push({
        game,
        participant,
        queueId: readGameQueueId(game)
      });
    }
    const queueScoped = queueId ? entries.filter((entry) => !entry.queueId || entry.queueId === queueId) : entries;
    return queueScoped.length > 0 ? queueScoped : entries;
  }
  function buildSeasonChampionStats(games, puuid, queueId, seasonId) {
    const empty = {
      seasonMostPlayedChampionId: 0,
      seasonMostPlayedCount: 0,
      seasonMostPlayedWins: 0,
      seasonMostPlayedLosses: 0,
      seasonMostPlayedWinRate: 0
    };
    if (!puuid) return empty;
    const scoped = listScopedEntries(games, puuid, queueId);
    const hasSeasonOnGames = scoped.some((entry) => readGameSeasonId(entry.game) > 0);
    const seasonScoped = hasSeasonOnGames && seasonId ? scoped.filter((entry) => readGameSeasonId(entry.game) === seasonId) : scoped;
    const selected = seasonScoped.length > 0 ? seasonScoped : scoped;
    const championStats = /* @__PURE__ */ new Map();
    for (const entry of selected) {
      const championId2 = readChampionId(entry.game, entry.participant);
      if (!championId2) continue;
      const stat = championStats.get(championId2) || { wins: 0, losses: 0 };
      if (readWin(entry.game, entry.participant)) stat.wins += 1;
      else stat.losses += 1;
      championStats.set(championId2, stat);
    }
    const { championId, games: gamesPlayed } = pickMostPlayedChampion(championStats);
    if (!championId) return empty;
    const best = championStats.get(championId);
    const wins = best.wins;
    const losses = best.losses;
    return {
      seasonMostPlayedChampionId: championId,
      seasonMostPlayedCount: gamesPlayed,
      seasonMostPlayedWins: wins,
      seasonMostPlayedLosses: losses,
      seasonMostPlayedWinRate: gamesPlayed ? Math.round(wins / gamesPlayed * 100) : 0
    };
  }
  async function resolveIdentity(player, lcu2) {
    const direct = formatRiotId(player);
    if (direct && player?.puuid) return { riotId: direct, puuid: player.puuid };
    const resolvedPuuid = resolveChampSelectPuuid(player);
    if (direct && resolvedPuuid) return { riotId: direct, puuid: resolvedPuuid };
    if (direct) return { riotId: direct, puuid: "" };
    if (resolvedPuuid) {
      try {
        const resolved = await lcu2.get(SUMMONER_BY_PUUID_ROUTE(resolvedPuuid));
        return {
          riotId: formatRiotId(resolved),
          puuid: resolved?.puuid || resolvedPuuid
        };
      } catch {
        return { riotId: "", puuid: resolvedPuuid };
      }
    }
    if (!player?.summonerId) return { riotId: "", puuid: "" };
    try {
      const resolved = await lcu2.get(SUMMONER_BY_ID_ROUTE(player.summonerId));
      return {
        riotId: formatRiotId(resolved),
        puuid: resolved?.puuid || ""
      };
    } catch {
      return { riotId: "", puuid: "" };
    }
  }
  async function getSafe(lcu2, route) {
    try {
      return await lcu2.get(route);
    } catch {
      return null;
    }
  }
  async function buildTeamRevealSnapshot({
    session,
    lcu: lcu2,
    fetchImpl = fetch,
    sampleSize = TEAM_REVEAL_SAMPLE_SIZE,
    seasonSampleSize = TEAM_REVEAL_SEASON_SAMPLE_SIZE,
    now = Date.now(),
    onProgress,
    signal
  }) {
    if (signal?.aborted) return [];
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    const localCellId = Number(session?.localPlayerCellId ?? -1);
    const queueId = readQueueId(session);
    const rankedQueueType = readRankedQueueType(queueId);
    const [seasonPayload, sgp] = await Promise.all([
      getSafe(lcu2, currentSeasonRoute()),
      createSgpContext(lcu2)
    ]);
    const currentSeasonId = readCurrentSeasonId(seasonPayload);
    if (signal?.aborted) return [];
    const shells = await mapPool(team, TEAM_REVEAL_FETCH_CONCURRENCY, async (player, index) => {
      const cellId = Number(player?.cellId ?? index);
      const identity = await resolveIdentity(player, lcu2);
      const puuid = identity.puuid;
      const riotId = identity.riotId;
      let rankedPayload = null;
      if (puuid) {
        try {
          rankedPayload = await lcu2.get(rankedStatsRoute(puuid));
        } catch {
        }
      }
      const ranks = readRankedQueues(rankedPayload);
      await yieldUi();
      return makeRevealRow({
        cellId,
        puuid,
        riotId,
        isLocalPlayer: cellId === localCellId,
        rankedQueueType,
        assignedPosition: readAssignedPosition(player),
        ranks,
        season: readSeasonStats(ranks, rankedQueueType)
      });
    });
    shells.sort((a, b) => a.cellId - b.cellId);
    if (signal?.aborted) return [];
    if (typeof onProgress === "function") onProgress(shells);
    if (signal?.aborted) return [];
    const rows = await mapPool(shells, TEAM_REVEAL_FETCH_CONCURRENCY, async (shell) => {
      if (signal?.aborted) return shell;
      await yieldUi();
      if (signal?.aborted) return shell;
      const puuid = shell.puuid;
      let games = [];
      const rankedForQueue = queueId === 440 ? shell.flexRank : shell.soloRank;
      const historyCount = Math.max(sampleSize, seasonHistoryCount(rankedForQueue, seasonSampleSize));
      if (puuid) {
        games = await fetchQueueMatchHistory({
          lcu: lcu2,
          fetchImpl,
          puuid,
          queueId,
          count: historyCount,
          sgp,
          signal
        });
        if (!games.length) {
          try {
            games = readGames(
              await lcu2.get(matchHistoryRoute(puuid, Math.min(historyCount, TEAM_REVEAL_NATIVE_HISTORY_MAX))),
              puuid
            );
          } catch {
          }
        }
      }
      const ranks = { solo: shell.soloRank, flex: shell.flexRank };
      const recentGames = games.slice(0, sampleSize);
      const stats = puuid ? buildPlayerStats(recentGames, puuid, queueId, now) : emptyPlayerStats();
      const seasonMain = puuid ? buildSeasonChampionStats(games, puuid, queueId, currentSeasonId) : emptySeasonMain();
      await yieldUi();
      return makeRevealRow({
        cellId: shell.cellId,
        puuid,
        riotId: shell.riotId,
        isLocalPlayer: shell.isLocalPlayer,
        rankedQueueType,
        assignedPosition: shell.assignedPosition,
        ranks,
        stats,
        seasonMain,
        season: readSeasonStats(ranks, rankedQueueType)
      });
    });
    if (signal?.aborted) return [];
    return rows;
  }

  // src/ui/roleIcons.js
  var ROLE_ICONS = {
    TOP: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20opacity%3D%220.5%22%20fill%3D%22%23785a28%22%20fill-rule%3D%22evenodd%22%20d%3D%22M21%2C14H14v7h7V14Zm5-3V26L11.014%2C26l-4%2C4H30V7.016Z%22%2F%3E%3Cpolygon%20fill%3D%22%23c8aa6e%22%20points%3D%224%204%204.003%2028.045%209%2023%209%209%2023%209%2028.045%204.003%204%204%22%2F%3E%3C%2Fsvg%3E",
    JUNGLE: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20fill%3D%22%23c8aa6e%22%20fill-rule%3D%22evenodd%22%20d%3D%22M25%2C3c-2.128%2C3.3-5.147%2C6.851-6.966%2C11.469A42.373%2C42.373%2C0%2C0%2C1%2C20%2C20a27.7%2C27.7%2C0%2C0%2C1%2C1-3C21%2C12.023%2C22.856%2C8.277%2C25%2C3ZM13%2C20c-1.488-4.487-4.76-6.966-9-9%2C3.868%2C3.136%2C4.422%2C7.52%2C5%2C12l3.743%2C3.312C14.215%2C27.917%2C16.527%2C30.451%2C17%2C31c4.555-9.445-3.366-20.8-8-28C11.67%2C9.573%2C13.717%2C13.342%2C13%2C20Zm8%2C5a15.271%2C15.271%2C0%2C0%2C1%2C0%2C2l4-4c0.578-4.48%2C1.132-8.864%2C5-12C24.712%2C13.537%2C22.134%2C18.854%2C21%2C25Z%22%2F%3E%3C%2Fsvg%3E",
    MIDDLE: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20opacity%3D%220.5%22%20fill%3D%22%23785a28%22%20fill-rule%3D%22evenodd%22%20d%3D%22M30%2C12.968l-4.008%2C4L26%2C26H17l-4%2C4H30ZM16.979%2C8L21%2C4H4V20.977L8%2C17%2C8%2C8h8.981Z%22%2F%3E%3Cpolygon%20fill%3D%22%23c8aa6e%22%20points%3D%2225%204%204%2025%204%2030%209%2030%2030%209%2030%204%2025%204%22%2F%3E%3C%2Fsvg%3E",
    BOTTOM: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20opacity%3D%220.5%22%20fill%3D%22%23785a28%22%20fill-rule%3D%22evenodd%22%20d%3D%22M13%2C20h7V13H13v7ZM4%2C4V26.984l3.955-4L8%2C8%2C22.986%2C8l4-4H4Z%22%2F%3E%3Cpolygon%20fill%3D%22%23c8aa6e%22%20points%3D%2229.997%205.955%2025%2011%2025%2025%2011%2025%205.955%2029.997%2030%2030%2029.997%205.955%22%2F%3E%3C%2Fsvg%3E",
    UTILITY: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20fill%3D%22%23c8aa6e%22%20fill-rule%3D%22evenodd%22%20d%3D%22M26%2C13c3.535%2C0%2C8-4%2C8-4H23l-3%2C3%2C2%2C7%2C5-2-3-4h2ZM22%2C5L20.827%2C3H13.062L12%2C5l5%2C6Zm-5%2C9-1-1L13%2C28l4%2C3%2C4-3L18%2C13ZM11%2C9H0s4.465%2C4%2C8%2C4h2L7%2C17l5%2C2%2C2-7Z%22%2F%3E%3C%2Fsvg%3E",
    FILL: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2234%22%20height%3D%2234%22%20viewBox%3D%220%200%2034%2034%22%3E%3Cpath%20opacity%3D%220.5%22%20fill%3D%22%23785a28%22%20fill-rule%3D%22evenodd%22%20d%3D%22M13%2C20h7V13H13v7ZM4%2C4V26.984l3.955-4L8%2C8%2C22.986%2C8l4-4H4Z%22%2F%3E%3Cpolygon%20fill%3D%22%23c8aa6e%22%20points%3D%2229.997%205.955%2025%2011%2025%2025%2011%2025%205.955%2029.997%2030%2030%2029.997%205.955%22%2F%3E%3C%2Fsvg%3E"
  };
  function roleIconUrl(position) {
    const key = String(position || "").trim().toUpperCase();
    return ROLE_ICONS[key] || "";
  }
  function roleLabel(position) {
    const key = String(position || "").trim().toUpperCase();
    if (key === "UTILITY") return "Support";
    if (key === "MIDDLE") return "Mid";
    if (key === "FILL") return "Fill";
    if (!key) return "";
    return key.charAt(0) + key.slice(1).toLowerCase();
  }

  // src/ui/teamRevealDom.js
  var ORIGINAL_NAME_KEY = "drakeTeamRevealOriginal";
  var APPLIED_KEY = "drakeTeamRevealApplied";
  var ORIGINAL_HTML_KEY = "drakeTeamRevealOriginalHtml";
  var ORIGINAL_STYLE_KEY = "drakeTeamRevealOriginalStyle";
  var ROOT_KEY = "drakeRevealRoot";
  var SPINNER_SVG = `<svg class="team-reveal-spinner-svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="8"/></svg>`;
  var STATUS_READY_MS = 8e3;
  function toLabelNode(row) {
    if (!row?.querySelector) return null;
    return row.querySelector("[data-drake-summoner-name]") || row.querySelector(".summoner-name") || row.querySelector('[data-testid="summoner-name"]') || row.querySelector('[data-testid*="summoner-name"]') || row.querySelector('[class*="summoner-name"]') || row.querySelector('[class*="summonerName"]');
  }
  function readCellId(row) {
    return Number(row?.dataset?.cellId ?? row?.getAttribute?.("data-cell-id") ?? -1);
  }
  function readRowWl(row) {
    return {
      wins: row.wins,
      losses: row.losses,
      winRate: row.winRate
    };
  }
  function hasMatchWl(row) {
    return Number(row?.matchesUsed) > 0 || Number(row?.wins) + Number(row?.losses) > 0;
  }
  function isLiveRevealSession(session) {
    return Boolean(session && Array.isArray(session.myTeam) && session.myTeam.length);
  }
  function formatRankLabel(rank) {
    if (!rank?.hasRank) return "Unranked";
    const tier = String(rank.tier || "").trim();
    if (!tier || tier === "NONE") return "Unranked";
    const label = tier.charAt(0) + tier.slice(1).toLowerCase();
    const apex = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER";
    const division = apex ? "" : ` ${rank.division || ""}`.trimEnd();
    const lp = rank.lp ? ` \xB7 ${rank.lp} LP` : "";
    return `${label}${division}${lp}`;
  }
  function rankIconSrc(tier) {
    const key = String(tier || "").trim().toUpperCase();
    if (!key || key === "NONE") return RANK_ICONS.UNRANKED;
    return RANK_ICONS[key] || RANK_ICONS.UNRANKED;
  }
  function formatWlHtml(wins, losses, winRate) {
    const w = wins ?? 0;
    const l = losses ?? 0;
    const total = w + l;
    const rate = winRate ?? (total ? Math.round(w / total * 100) : 0);
    return `<span class="wl-win">${w}W</span>/<span class="wl-loss">${l}L</span> \xB7 ${rate}%`;
  }
  function formatRowName(_maskedName, snapshot) {
    if (!hasMatchWl(snapshot)) return snapshot.riotId || "";
    const wl = readRowWl(snapshot);
    return `${snapshot.riotId} (${formatWl(wl.wins, wl.losses, wl.winRate)})`;
  }
  function formatCardRow(label, value) {
    return `<div class="team-reveal-card-row"><span class="team-reveal-card-label">${label}</span><span class="team-reveal-card-value">${value}</span></div>`;
  }
  function renderRoleIcon(position) {
    const src = roleIconUrl(position);
    if (!src) return "";
    const label = roleLabel(position);
    return `<img class="team-reveal-role-icon" src="${src}" alt="" title="${label}">`;
  }
  function renderRankBlock(label, rank) {
    const icon = rankIconSrc(rank?.tier);
    const rankText = formatRankLabel(rank);
    return `<div class="team-reveal-rank-block">
    <div class="team-reveal-rank-head">
      <img class="team-reveal-rank-icon" src="${icon}" alt="">
      <div class="team-reveal-rank-meta">
        <span class="team-reveal-rank-queue">${label}</span>
        <span class="team-reveal-rank-tier">${rankText}</span>
      </div>
    </div>
  </div>`;
  }
  function renderSeasonMain(row, getChampName) {
    const id = Number(row?.seasonMostPlayedChampionId) || 0;
    if (!id) return "\u2014";
    const name = getChampName(id) || "Unknown";
    const count = row.seasonMostPlayedCount ? ` \xB7 ${row.seasonMostPlayedCount}g` : "";
    const wl = row.seasonMostPlayedCount ? ` \xB7 ${formatWlPair(row.seasonMostPlayedWins, row.seasonMostPlayedLosses)} \xB7 ${row.seasonMostPlayedWinRate}%` : "";
    return `<span class="team-reveal-champ">
    <img class="team-reveal-champ-icon" src="${iconUrl(id)}" alt="">
    <span>${name}${count}${wl}</span>
  </span>`;
  }
  function cardsContentSig(snapshot) {
    return JSON.stringify(
      snapshot.map((row) => ({
        cellId: row.cellId,
        riotId: row.riotId,
        assignedPosition: row.assignedPosition,
        isLocalPlayer: row.isLocalPlayer,
        wins: row.wins,
        losses: row.losses,
        kda: row.kda,
        soloRank: row.soloRank,
        flexRank: row.flexRank,
        seasonMostPlayedChampionId: row.seasonMostPlayedChampionId,
        seasonMostPlayedCount: row.seasonMostPlayedCount,
        seasonMostPlayedWinRate: row.seasonMostPlayedWinRate,
        recentGames: row.recentGames
      }))
    );
  }
  function renderRecentGames(row, getChampName) {
    const games = Array.isArray(row?.recentGames) ? row.recentGames : [];
    if (!games.length) return '<span class="team-reveal-recent-empty">\u2014</span>';
    return `<div class="team-reveal-recent-games">${games.map((game) => {
      const id = Number(game?.championId) || 0;
      const name = getChampName(id) || "Unknown";
      const result = game.win ? "is-win" : "is-loss";
      const kda = `${game.kills ?? 0}/${game.deaths ?? 0}/${game.assists ?? 0}`;
      return `<div class="team-reveal-recent-game ${result}" title="${name} ${kda}">
        <img class="team-reveal-champ-icon" src="${iconUrl(id)}" alt="${name}">
        <span class="team-reveal-recent-kda">${kda}</span>
      </div>`;
    }).join("")}</div>`;
  }
  function makeRenderCards(getChampName) {
    return function renderCards(snapshot) {
      const cards = snapshot.map((row) => {
        const riotId = row.riotId || "Unknown";
        const youTag = row.isLocalPlayer ? ' <span class="team-reveal-you">(You)</span>' : "";
        const recentWl = formatWlHtml(row.wins, row.losses, row.winRate);
        const kda = row.kda ?? "\u2014";
        const last12h = formatWlPair(row.last12hWins, row.last12hLosses);
        const recentNote = row.matchesUsed ? ` \xB7 last ${row.matchesUsed} games` : "";
        const cardClass = row.isLocalPlayer ? "team-reveal-card is-you" : "team-reveal-card";
        const roleIcon = renderRoleIcon(row.assignedPosition);
        return `<section class="${cardClass}">
          <div class="team-reveal-card-head">
            <div class="team-reveal-card-title-row">
              ${roleIcon}
              <div class="team-reveal-card-title">${riotId}${youTag}</div>
            </div>
          </div>
          <div class="team-reveal-ranks">
            ${renderRankBlock("Solo/Duo", row.soloRank)}
            ${renderRankBlock("Flex", row.flexRank)}
          </div>
          <div class="team-reveal-card-section">
            ${formatCardRow(`Recent W/L${recentNote}`, recentWl)}
            ${formatCardRow("Recent KDA", kda)}
            ${formatCardRow("Last 12h", last12h)}
            ${formatCardRow("Season Main", renderSeasonMain(row, getChampName))}
            ${formatCardRow("Last 5", renderRecentGames(row, getChampName))}
          </div>
        </section>`;
      }).join("");
      return `<div class="team-reveal-shell" data-team-reveal-panel="1">
      <button class="team-reveal-close" type="button" data-team-reveal-close="1" aria-label="Close">Close</button>
      <div class="team-reveal-panel">${cards}</div>
    </div>`;
    };
  }
  function readLabelNodes(doc) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    const selectors = [
      '[data-testid="summoner-name"]',
      '[data-testid*="summoner-name"]',
      ".summoner-name",
      '[class*="summoner-name"]',
      '[class*="champ-select"] [class*="name"]'
    ];
    for (const selector of selectors) {
      for (const node of doc.querySelectorAll(selector)) {
        if (seen.has(node)) continue;
        seen.add(node);
        out.push(node);
      }
    }
    return out;
  }
  function findLabelsByCurrentNames(doc, snapshot) {
    const pool = readLabelNodes(doc).filter((node) => {
      if (node?.dataset?.[APPLIED_KEY]) return false;
      const text = String(node?.textContent || "").trim();
      return Boolean(text) && text.length <= 48;
    });
    const matched = [];
    const used = /* @__PURE__ */ new Set();
    for (const row of snapshot) {
      const riotId = String(row?.riotId || "").trim().toLowerCase();
      const nameOnly = riotId.split("#")[0] || "";
      if (!riotId && !nameOnly) continue;
      const node = pool.find((entry) => {
        if (used.has(entry)) return false;
        const text = String(entry?.textContent || "").trim().toLowerCase();
        return text === riotId || text === nameOnly;
      });
      if (!node) continue;
      used.add(node);
      matched.push(node);
    }
    return matched;
  }
  var LABEL_SIG_KEY = "drakeRevealSig";
  function applyLabel(label, info) {
    if (!label.dataset) label.dataset = {};
    const wl = readRowWl(info);
    const showWl = hasMatchWl(info);
    const sig = `${info.riotId}|${showWl ? `${wl.wins}|${wl.losses}|${wl.winRate}` : "pending"}`;
    if (label.dataset[APPLIED_KEY] === "1" && label.dataset[LABEL_SIG_KEY] === sig) return;
    label.setAttribute?.("data-drake-reveal-root", "1");
    label.dataset[ROOT_KEY] = "1";
    if (!label.dataset[ORIGINAL_NAME_KEY]) {
      label.dataset[ORIGINAL_NAME_KEY] = label.textContent || "";
    }
    if (!label.dataset[ORIGINAL_HTML_KEY]) {
      label.dataset[ORIGINAL_HTML_KEY] = typeof label.innerHTML === "string" ? label.innerHTML : "";
    }
    if (!label.dataset[ORIGINAL_STYLE_KEY]) {
      label.dataset[ORIGINAL_STYLE_KEY] = label.style?.cssText || "";
    }
    if (typeof label.innerHTML === "string") {
      const stats = showWl ? `<span class="drake-reveal-stats">${formatWlHtml(wl.wins, wl.losses, wl.winRate)}</span>` : "";
      label.innerHTML = `<span class="drake-reveal-name">${info.riotId}</span>${stats}`;
      if (label.style) {
        label.style.cssText = `${label.dataset[ORIGINAL_STYLE_KEY]};display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.1;max-height:none;height:auto;`;
      }
      const parent = label.parentElement;
      if (parent?.style) {
        parent.style.overflow = "visible";
        parent.style.maxHeight = "none";
        parent.style.height = "auto";
      }
    } else {
      label.textContent = formatRowName("", info);
    }
    label.dataset[APPLIED_KEY] = "1";
    label.dataset[LABEL_SIG_KEY] = sig;
  }
  function makeTeamRevealDom({
    doc,
    subscribe: subscribe2,
    loadSnapshot,
    overlayRoot,
    getChampName = () => "",
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    statusReadyMs = STATUS_READY_MS
  }) {
    const renderCards = makeRenderCards((id) => getChampName(Number(id)));
    let enabled = false;
    let stopSession = null;
    let snapshot = [];
    let overlay = null;
    let statusNode = null;
    let statusSpinner = null;
    let statusText = null;
    let statusOpenBtn = null;
    let statusBar = null;
    let readyDismissTimer = null;
    let open = false;
    let boundLabels = /* @__PURE__ */ new Map();
    let lastSessionSig = "";
    let lastLobbyKey = "";
    let lastTeam = [];
    let lastCardsRenderSig = "";
    let statusPhase = "hidden";
    let loadGen = 0;
    let loadAbort = null;
    let stopPhase = null;
    function stopRevealLoad() {
      loadGen += 1;
      if (loadAbort) {
        loadAbort.abort();
        loadAbort = null;
      }
    }
    function clearReveal() {
      stopRevealLoad();
      restoreRows();
      snapshot = [];
      lastSessionSig = "";
      lastLobbyKey = "";
      lastTeam = [];
      lastCardsRenderSig = "";
      open = false;
      renderVisibility();
      setStatus("hidden");
    }
    function handlePhase(payload) {
      if (!enabled) return;
      const phase = readGameflowPhase2(payload);
      if (phase !== "ChampSelect") clearReveal();
    }
    function needsReapply() {
      if (!snapshot.length) return false;
      if (boundLabels.size === 0) return true;
      for (const label of boundLabels.values()) {
        if (label.isConnected === false) return true;
      }
      return false;
    }
    function mergePositionsFromSession(session) {
      if (!snapshot.length) return false;
      const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
      const byCell = new Map(team.map((player) => [Number(player?.cellId), readAssignedPosition(player)]));
      let changed = false;
      snapshot = snapshot.map((row) => {
        const next = byCell.has(Number(row.cellId)) ? byCell.get(Number(row.cellId)) : row.assignedPosition || "";
        if (next === (row.assignedPosition || "")) return row;
        changed = true;
        return { ...row, assignedPosition: next };
      });
      if (changed) lastCardsRenderSig = "";
      return changed;
    }
    function teamFingerprint(session) {
      const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
      return team.map((player) => ({
        cellId: Number(player?.cellId),
        summonerId: Number(player?.summonerId) || 0,
        puuid: String(player?.puuid || ""),
        obf: String(player?.obfuscatedPuuid || "")
      })).sort((a, b) => a.cellId - b.cellId);
    }
    function sameTeamIdentity(prev, next) {
      if (!prev.length || prev.length !== next.length) return false;
      return prev.every((left, index) => {
        const right = next[index];
        if (left.cellId !== right.cellId) return false;
        if (left.summonerId && right.summonerId && left.summonerId !== right.summonerId) return false;
        if (left.puuid && right.puuid && left.puuid !== right.puuid) return false;
        if (left.obf && right.obf && left.obf !== right.obf) return false;
        return true;
      });
    }
    function sessionSignature(session) {
      return JSON.stringify(teamFingerprint(session));
    }
    function ensureOverlay() {
      if (overlay) return overlay;
      const existing = overlayRoot?.querySelector?.(".team-reveal-overlay");
      if (existing) {
        overlay = existing;
        wireOverlayEvents(overlay);
        return overlay;
      }
      const owner = overlayRoot?.ownerDocument || doc;
      const node = owner?.createElement?.("div");
      if (!node) return null;
      node.className = "team-reveal-overlay";
      node.hidden = true;
      if (node.style) node.style.display = "none";
      overlayRoot?.appendChild?.(node);
      overlay = node;
      wireOverlayEvents(overlay);
      return overlay;
    }
    function wireOverlayEvents(node) {
      if (!node?.addEventListener || node.dataset?.drakeRevealWired === "1") return;
      if (node.dataset) node.dataset.drakeRevealWired = "1";
      node.addEventListener("click", (event) => {
        const target = event.target;
        if (target?.closest?.('[data-team-reveal-close="1"]')) {
          event.stopPropagation?.();
          closeCards();
          return;
        }
        if (target === node) {
          closeCards();
          return;
        }
        if (target?.closest && !target.closest('[data-team-reveal-panel="1"]')) {
          closeCards();
        }
      });
    }
    function ensureStatusBar(node, owner) {
      if (statusBar) return statusBar;
      statusBar = node.querySelector?.(".team-reveal-status-bar");
      if (statusBar) return statusBar;
      if (!owner?.createElement) return null;
      const bar = owner.createElement("div");
      bar.className = "team-reveal-status-bar";
      bar.hidden = true;
      if (bar.style) bar.style.display = "none";
      node.appendChild(bar);
      statusBar = bar;
      return statusBar;
    }
    function stopReadyDismiss() {
      if (readyDismissTimer != null) {
        clearTimeoutImpl(readyDismissTimer);
        readyDismissTimer = null;
      }
      if (statusBar) {
        statusBar.hidden = true;
        if (statusBar.style) {
          statusBar.style.display = "none";
          statusBar.style.animation = "none";
        }
      }
    }
    function startReadyDismiss() {
      stopReadyDismiss();
      const bar = statusBar || ensureStatusBar(statusNode, overlayRoot?.ownerDocument || doc);
      if (!bar) return;
      bar.hidden = false;
      if (bar.style) {
        bar.style.display = "block";
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = `team-reveal-status-shrink ${statusReadyMs}ms linear forwards`;
      }
      readyDismissTimer = setTimeoutImpl(() => {
        readyDismissTimer = null;
        setStatus("hidden");
      }, statusReadyMs);
    }
    function ensureStatus() {
      if (statusNode) return statusNode;
      const existing = overlayRoot?.querySelector?.(".team-reveal-status");
      if (existing) {
        statusNode = existing;
        statusSpinner = existing.querySelector?.(".team-reveal-status-spinner");
        statusText = existing.querySelector?.(".team-reveal-status-text");
        statusOpenBtn = existing.querySelector?.(".team-reveal-status-open");
        wireStatusOpen(statusOpenBtn);
        ensureStatusBar(existing, overlayRoot?.ownerDocument || doc);
        return statusNode;
      }
      const owner = overlayRoot?.ownerDocument || doc;
      const node = owner?.createElement?.("div");
      if (!node) return null;
      node.className = "team-reveal-status";
      node.hidden = true;
      if (node.style) node.style.display = "none";
      const spinner = owner.createElement("span");
      spinner.className = "team-reveal-status-spinner";
      spinner.innerHTML = SPINNER_SVG;
      spinner.hidden = true;
      const text = owner.createElement("span");
      text.className = "team-reveal-status-text";
      const openBtn = owner.createElement("button");
      openBtn.className = "team-reveal-status-open";
      openBtn.type = "button";
      openBtn.textContent = "View";
      openBtn.hidden = true;
      wireStatusOpen(openBtn);
      node.appendChild(spinner);
      node.appendChild(text);
      node.appendChild(openBtn);
      overlayRoot?.appendChild?.(node);
      statusNode = node;
      statusSpinner = spinner;
      statusText = text;
      statusOpenBtn = openBtn;
      ensureStatusBar(node, owner);
      return statusNode;
    }
    function wireStatusOpen(btn) {
      if (!btn?.addEventListener || btn.dataset?.drakeRevealWired === "1") return;
      if (btn.dataset) btn.dataset.drakeRevealWired = "1";
      btn.addEventListener("click", (event) => {
        event.stopPropagation?.();
        event.preventDefault?.();
        openCards();
      });
    }
    function setStatus(phase) {
      statusPhase = phase;
      const node = ensureStatus();
      if (!node) return;
      const visible = enabled && (phase === "loading" || phase === "ready") && !open;
      node.hidden = !visible;
      if (node.style) node.style.display = visible ? "flex" : "none";
      const loading = phase === "loading";
      if (statusSpinner) {
        statusSpinner.hidden = !loading || !visible;
        if (statusSpinner.style) statusSpinner.style.display = loading && visible ? "inline-flex" : "none";
      }
      if (statusOpenBtn) {
        statusOpenBtn.hidden = loading || !visible;
        if (statusOpenBtn.style) statusOpenBtn.style.display = !loading && visible ? "inline-flex" : "none";
      }
      if (statusText) {
        statusText.textContent = loading ? "Revealing lobby" : "Session revealed. Press Ctrl+Shift+D to view it.";
      }
      if (visible && phase === "ready") startReadyDismiss();
      else stopReadyDismiss();
    }
    function renderVisibility() {
      if (!overlay) return;
      if (open && snapshot.length > 0) {
        const sig = cardsContentSig(snapshot);
        if (sig !== lastCardsRenderSig) {
          overlay.innerHTML = renderCards(snapshot);
          lastCardsRenderSig = sig;
        }
        overlay.hidden = false;
        if (overlay.style) overlay.style.display = "flex";
      } else {
        overlay.hidden = true;
        if (overlay.style) overlay.style.display = "none";
        open = false;
        lastCardsRenderSig = "";
      }
    }
    function restoreRows() {
      const seen = /* @__PURE__ */ new Set();
      const restore = (label) => {
        if (!label || seen.has(label)) return;
        seen.add(label);
        if (label.dataset?.[ORIGINAL_NAME_KEY] || label.dataset?.[APPLIED_KEY]) restoreLabel(label);
      };
      for (const label of doc.querySelectorAll?.("[data-drake-reveal-root]") || []) restore(label);
      for (const row of doc.querySelectorAll("[data-cell-id]")) restore(toLabelNode(row));
      for (const label of readLabelNodes(doc)) restore(label);
      boundLabels = /* @__PURE__ */ new Map();
    }
    function restoreLabel(label) {
      if (typeof label.innerHTML === "string") {
        label.innerHTML = label.dataset[ORIGINAL_HTML_KEY] || label.dataset[ORIGINAL_NAME_KEY] || "";
      } else {
        label.textContent = label.dataset[ORIGINAL_NAME_KEY];
      }
      if (label.style) {
        label.style.cssText = label.dataset[ORIGINAL_STYLE_KEY] || "";
      }
      delete label.dataset[ORIGINAL_NAME_KEY];
      delete label.dataset[ORIGINAL_HTML_KEY];
      delete label.dataset[ORIGINAL_STYLE_KEY];
      delete label.dataset[ROOT_KEY];
      label.removeAttribute?.("data-drake-reveal-root");
      delete label.dataset[APPLIED_KEY];
      delete label.dataset[LABEL_SIG_KEY];
    }
    function applyRows(rows) {
      const byCell = new Map(rows.map((row) => [Number(row.cellId), row]));
      const used = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const key = Number(row?.cellId);
        const bound = boundLabels.get(key);
        if (!bound || bound.isConnected === false) continue;
        applyLabel(bound, row);
        used.add(row);
      }
      for (const row of doc.querySelectorAll("[data-cell-id]")) {
        const label = toLabelNode(row);
        if (!label) continue;
        if (!label.dataset) label.dataset = {};
        const cellId = readCellId(row);
        const info = byCell.get(cellId);
        if (!info?.riotId) continue;
        if (used.has(info)) continue;
        applyLabel(label, info);
        boundLabels.set(cellId, label);
        used.add(info);
      }
      const remaining = rows.filter((row) => !used.has(row) && row?.riotId);
      const labels = readLabelNodes(doc).filter((label) => {
        if (!label?.dataset) label.dataset = {};
        return !label.dataset[APPLIED_KEY];
      });
      const count = Math.min(remaining.length, labels.length);
      for (let index = 0; index < count; index += 1) {
        const label = labels[index];
        const info = remaining[index];
        applyLabel(label, info);
        boundLabels.set(Number(info.cellId), label);
      }
      if (count === 0 && remaining.length > 0) {
        const matched = findLabelsByCurrentNames(doc, remaining);
        const limit = Math.min(matched.length, remaining.length);
        for (let index = 0; index < limit; index += 1) {
          const info = remaining[index];
          const label = matched[index];
          applyLabel(label, info);
          boundLabels.set(Number(info.cellId), label);
        }
      }
    }
    function closeCards() {
      open = false;
      renderVisibility();
      setStatus(statusPhase === "loading" ? "loading" : snapshot.length ? "ready" : "hidden");
    }
    function openCards() {
      if (!enabled || !snapshot.length) return;
      ensureOverlay();
      open = true;
      if (needsReapply()) applyRows(snapshot);
      renderVisibility();
      setStatus("ready");
    }
    async function handleSession(session) {
      if (!enabled) return;
      if (!isLiveRevealSession(session)) {
        clearReveal();
        return;
      }
      const lobbyKey = readLobbyKey(session);
      const team = teamFingerprint(session);
      const newLobby = Boolean(lobbyKey && lastLobbyKey && lobbyKey !== lastLobbyKey);
      if (newLobby) clearReveal();
      else if (lastSessionSig && sameTeamIdentity(lastTeam, team)) {
        mergePositionsFromSession(session);
        if (snapshot.length && needsReapply()) applyRows(snapshot);
        if (open) renderVisibility();
        if (lobbyKey) lastLobbyKey = lobbyKey;
        lastTeam = team;
        return;
      }
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      const sig = sessionSignature(session);
      if (sig && sig === lastSessionSig) {
        mergePositionsFromSession(session);
        if (snapshot.length && needsReapply()) applyRows(snapshot);
        if (open) renderVisibility();
        return;
      }
      stopRevealLoad();
      lastSessionSig = sig;
      const gen = loadGen;
      loadAbort = typeof AbortController === "function" ? new AbortController() : null;
      try {
        setStatus("loading");
        const next = await loadSnapshot(session, {
          signal: loadAbort?.signal,
          onProgress(rows) {
            if (gen !== loadGen) return;
            snapshot = Array.isArray(rows) ? rows : [];
            applyRows(snapshot);
            if (open) renderVisibility();
          }
        });
        if (gen !== loadGen) return;
        snapshot = Array.isArray(next) ? next : [];
        setStatus(snapshot.length ? "ready" : "hidden");
        if (snapshot.length) applyRows(snapshot);
        if (open) renderVisibility();
      } catch {
        if (gen !== loadGen) return;
        setStatus(snapshot.length ? "ready" : "hidden");
      }
    }
    function setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      if (enabled) {
        if (!stopPhase) {
          stopPhase = subscribe2(GAMEFLOW_PHASE_ROUTE, (phase) => {
            handlePhase(phase);
          });
        }
        return;
      }
      if (stopSession) {
        stopSession();
        stopSession = null;
      }
      if (stopPhase) {
        stopPhase();
        stopPhase = null;
      }
      clearReveal();
    }
    function toggleCards() {
      if (!enabled) return;
      if (open) {
        closeCards();
        return;
      }
      openCards();
    }
    function teardown() {
      setEnabled(false);
      if (overlay?.remove) overlay.remove();
      if (statusNode?.remove) statusNode.remove();
      overlay = null;
      statusNode = null;
      statusSpinner = null;
      statusText = null;
      statusOpenBtn = null;
      stopReadyDismiss();
      statusBar = null;
    }
    return {
      setEnabled,
      handleSession,
      toggleCards,
      closeCards,
      openCards,
      teardown
    };
  }

  // src/ui/index.js
  var TAG = "[Drake]";
  var MAX_DELAY_MS = 8e3;
  function startUI({ cfg, onSettingsChanged, lcu: lcu2 }) {
    let settings = { ...cfg.settings };
    let appVersion = cfg.version || "0.0.0";
    let updateUi = { phase: "idle" };
    let trayDown = false;
    let screen = "auto-accept";
    let shadowRoot = null;
    let stopDodgeReposition = null;
    let stopSocialToggle = null;
    let dodgeBusy = false;
    let champSelectActive = false;
    let champSelectSession = null;
    let statusText = "";
    let provider = "porofessor";
    let champions = [];
    let teamRevealChamps = [];
    let teamRevealChampsLoading = null;
    let teamRevealDom = null;
    let inGameIdle = false;
    const queries = {
      auto_pick_champion_id: "",
      auto_ban_champion_id: "",
      skins: ""
    };
    const status = makeStatus({ lcu: lcu2 });
    let dodgeStatus = (detail) => console.log(TAG, "dodge", detail);
    let say = (text, good) => console.log(TAG, text, good ? "ok" : "err");
    const dodger = makeDodge({
      onStatus: (detail) => dodgeStatus(detail)
    });
    const restarter = makeRestartUx({ lcu: lcu2 });
    const opener = makeOpener({ port: cfg.port, token: cfg.token });
    const presence2 = makePresence({ lcu: lcu2 });
    const challenges = makeChallenges({ lcu: lcu2 });
    const riotId = makeRiotId({ lcu: lcu2 });
    let lol = {};
    let friends = [];
    let profileTab = "rank";
    let skins = [];
    let backgroundId = 0;
    let skinFrame = 0;
    const background = makeBackground({ lcu: lcu2 });
    const sfx = makeSfx();
    const steps = { "rank-div": "I", "rank-queue": QUEUES[0].id, crystal: "IRON" };
    let pickedTier = "";
    function syncRankUiFromSettings() {
      const saved = readProfileRank(settings);
      if (!saved.tier) return;
      pickedTier = saved.tier;
      steps["rank-div"] = saved.division;
      steps["rank-queue"] = saved.queue;
      steps.crystal = saved.crystal;
    }
    syncRankUiFromSettings();
    const client = makeSettingsClient({
      port: cfg.port,
      token: cfg.token,
      reloadConfig: loadConfig
    });
    const updater = makeUpdater({
      port: cfg.port,
      token: cfg.token,
      reloadConfig: loadConfig
    });
    const ui2 = mountUI({
      doc: document,
      win: window,
      render: renderShell,
      isIdle: () => inGameIdle,
      onOpenChange: (open) => {
        if (!shadowRoot) return;
        shadowRoot.getElementById("scrim").style.display = open ? "grid" : "none";
        syncSocialToggle(document, open);
      },
      onTeamRevealCardsToggle: () => {
        if (teamRevealDom) teamRevealDom.toggleCards();
      },
      onMount: wire
    });
    function setReadyCheck(payload) {
      if (inGameIdle || !shadowRoot) return;
      shadowRoot.getElementById("cancel-dock").hidden = !canCancel(payload);
    }
    function resetDodgeUi({ keepLabel = false } = {}) {
      dodgeBusy = false;
      if (!shadowRoot) return;
      for (const id of ["dodge-champ-select", "dodge"]) {
        const el = shadowRoot.getElementById(id);
        if (!el) continue;
        el.disabled = false;
        if (!keepLabel) el.textContent = "Dodge";
      }
    }
    function startDodgeReposition() {
      if (!shadowRoot || !champSelectActive) return;
      const dock = shadowRoot.getElementById("dodge-dock");
      const reposition = () => {
        if (dodgeBusy) return;
        layoutDock(dock, findAnchor(document), window);
      };
      reposition();
      stopDodgeReposition = watchAnchor(document, window, reposition);
    }
    function startSocialWatch(api) {
      const panel = api || ui2;
      if (stopSocialToggle || !shadowRoot || !panel) return;
      stopSocialToggle = watchSocialToggle(document, window, () => {
        mountSocialToggle(document, {
          onToggle: () => panel.toggle(),
          isOpen: () => panel.isOpen()
        });
      });
      mountSocialToggle(document, {
        onToggle: () => panel.toggle(),
        isOpen: () => panel.isOpen()
      });
    }
    function stopSocialWatch() {
      if (!stopSocialToggle) return;
      stopSocialToggle();
      stopSocialToggle = null;
    }
    function setIdle(next) {
      if (next === inGameIdle) return;
      inGameIdle = next;
      if (inGameIdle) {
        ui2.close();
        stopSocialWatch();
        if (stopDodgeReposition) {
          stopDodgeReposition();
          stopDodgeReposition = null;
        }
        champSelectActive = false;
        champSelectSession = null;
        if (teamRevealDom) {
          void teamRevealDom.handleSession(null);
          teamRevealDom.setEnabled(false);
        }
        if (shadowRoot) {
          const dodge = shadowRoot.getElementById("dodge-dock");
          if (dodge) dodge.hidden = true;
          const cancel = shadowRoot.getElementById("cancel-dock");
          if (cancel) cancel.hidden = true;
        }
        return;
      }
      startSocialWatch();
      if (teamRevealDom) teamRevealDom.setEnabled(!!settings.queue_team_reveal_in_client);
    }
    function setChampSelect(session) {
      if (inGameIdle) return;
      champSelectSession = session;
      if (!shadowRoot) return;
      const dock = shadowRoot.getElementById("dodge-dock");
      champSelectActive = inChampSelect(session);
      if (teamRevealDom) void teamRevealDom.handleSession(session);
      dock.hidden = !champSelectActive;
      if (stopDodgeReposition) {
        stopDodgeReposition();
        stopDodgeReposition = null;
      }
      if (!champSelectActive) {
        resetDodgeUi();
        return;
      }
      resetDodgeUi();
      startDodgeReposition();
    }
    async function runDodge(btn) {
      if (!btn || dodgeBusy || btn.disabled) {
        console.log(TAG, "dodge ignored", { btn: btn?.id, dodgeBusy, disabled: btn?.disabled });
        return;
      }
      dodgeBusy = true;
      btn.disabled = true;
      btn.textContent = "Dodging\u2026";
      say("Dodging\u2026", true);
      console.log(TAG, "dodge click", btn.id);
      if (stopDodgeReposition) {
        stopDodgeReposition();
        stopDodgeReposition = null;
      }
      try {
        const result = await dodger.dodge();
        console.log(TAG, "dodge result", result);
        const msg = result.ok ? `Dodged champ select${result.detail ? ` (${result.detail})` : ""}` : result.reason;
        say(msg, result.ok);
        btn.textContent = result.ok ? "Dodged!" : "Failed";
      } finally {
        resetDodgeUi({ keepLabel: true });
        if (champSelectActive) startDodgeReposition();
        window.setTimeout(() => resetDodgeUi(), 2500);
      }
    }
    function wire(shadow, api) {
      shadowRoot = shadow;
      const content = shadow.getElementById("content");
      const statusEl = shadow.getElementById("status");
      function sayUi(text, good) {
        statusEl.textContent = text;
        statusEl.className = good ? "status-good" : "status-bad";
      }
      say = sayUi;
      dodgeStatus = (detail) => {
        sayUi(detail, true);
        console.log(TAG, "dodge", detail);
      };
      shadow.getElementById("scrim").style.display = "none";
      startSocialWatch(api);
      shadow.getElementById("host-label").textContent = typeof Pengu !== "undefined" && Pengu.version ? `loader ${Pengu.version}` : "in client";
      teamRevealDom = makeTeamRevealDom({
        doc: document,
        subscribe,
        overlayRoot: shadow,
        getChampName: (id) => teamRevealChamps.find((c) => c.id === id)?.name || "",
        loadSnapshot: async (session, hooks) => {
          if (!teamRevealChamps.length) {
            if (!teamRevealChampsLoading) {
              teamRevealChampsLoading = loadChampions(lcu2).then((list) => {
                teamRevealChamps = list;
                teamRevealChampsLoading = null;
                return list;
              });
            }
            await teamRevealChampsLoading;
          }
          return buildTeamRevealSnapshot({
            session,
            lcu: lcu2,
            onProgress: hooks?.onProgress,
            signal: hooks?.signal
          });
        }
      });
      teamRevealDom.setEnabled(!!settings.queue_team_reveal_in_client);
      if (champSelectSession) void teamRevealDom.handleSession(champSelectSession);
      function paint() {
        if (screen === "settings") {
          content.innerHTML = renderSettings(settings, {
            disabled: trayDown,
            version: appVersion,
            update: updateUi
          });
        } else if (screen === "auto-pick") {
          content.innerHTML = renderAutoPick(settings, {
            disabled: trayDown,
            list: searchChampions(champions, queries.auto_pick_champion_id),
            allList: champions,
            query: queries.auto_pick_champion_id
          });
        } else if (screen === "auto-ban") {
          content.innerHTML = renderAutoBan(settings, {
            disabled: trayDown,
            list: searchChampions(champions, queries.auto_ban_champion_id),
            query: queries.auto_ban_champion_id
          });
        } else if (screen === "profile") {
          content.innerHTML = renderProfile({
            tab: profileTab,
            lol: {
              ...lol,
              rankedLeagueTier: pickedTier || lol.rankedLeagueTier,
              rankedLeagueDivision: steps["rank-div"],
              rankedLeagueQueue: steps["rank-queue"],
              challengeCrystalLevel: steps.crystal
            },
            skins: searchSkins(skins, queries.skins),
            skinQuery: queries.skins,
            backgroundId,
            skinScroll: 0
          });
        } else if (screen === "friends") {
          content.innerHTML = renderFriends(friends);
        } else if (screen === "queue") {
          content.innerHTML = renderQueue({ provider, settings, disabled: trayDown });
        } else if (screen === "status") {
          content.innerHTML = renderStatus(statusText);
          updateCount();
        } else {
          content.innerHTML = renderAutoAccept(settings, {
            disabled: trayDown,
            maxDelayMs: MAX_DELAY_MS
          });
        }
        statusEl.textContent = trayDown ? "Drake tray is not running" : "Connected to the tray";
        statusEl.className = trayDown ? "status-bad" : "status-good";
        for (const item of shadow.querySelectorAll("[data-screen]")) {
          item.setAttribute("aria-selected", String(item.dataset.screen === screen));
        }
      }
      function applyUpdateStatus(body) {
        if (body.status === "current") updateUi = { phase: "current" };
        else if (body.status === "available") {
          updateUi = { phase: "available", version: body.version };
        } else if (body.status === "no_installer") {
          updateUi = { phase: "no_installer", version: body.version };
        }
      }
      async function runUpdateCheck() {
        updateUi = { phase: "checking" };
        paint();
        const result = await updater.check();
        if (!result.ok) {
          trayDown = result.reason.includes("not running");
          updateUi = { phase: "error", message: result.reason };
        } else {
          applyUpdateStatus(result);
        }
        paint();
      }
      async function commit(patch, revert) {
        const result = await client.save(patch);
        if (result.ok) {
          trayDown = false;
          settings = { ...settings, ...patch };
          if (onSettingsChanged) onSettingsChanged(settings);
          return { ok: true };
        }
        revert();
        trayDown = result.reason.includes("not running");
        paint();
        statusEl.textContent = result.reason;
        statusEl.className = "status-bad";
        console.log(TAG, "could not save -", result.reason);
        return { ok: false, reason: result.reason };
      }
      const BOX = { min: 120, max: Math.round(window.innerHeight * 0.46) };
      const GRIP = 16;
      function updateCount() {
        const el = shadow.getElementById("status-count");
        if (el) el.textContent = describeStatus(statusText);
        autoSize(shadow.getElementById("status-text"), BOX);
      }
      shadow.querySelector(".nav").addEventListener("click", async (e) => {
        const item = e.target.closest("[data-screen]");
        if (!item) return;
        screen = item.dataset.screen;
        if (screen === "status") statusText = await status.read();
        if ((screen === "auto-pick" || screen === "auto-ban") && champions.length === 0) {
          champions = await loadChampions(lcu2);
        }
        if (screen === "profile") {
          if (settings.profile_rank_tier) {
            syncRankUiFromSettings();
          } else {
            try {
              lol = readLol(await lcu2.get(CHAT_ME));
            } catch {
              lol = {};
            }
            pickedTier = lol.rankedLeagueTier || "";
            if (lol.rankedLeagueDivision) steps["rank-div"] = lol.rankedLeagueDivision;
            if (lol.rankedLeagueQueue) steps["rank-queue"] = lol.rankedLeagueQueue;
            if (lol.challengeCrystalLevel) steps.crystal = lol.challengeCrystalLevel;
          }
          if (profileTab === "banner" && skins.length === 0) skins = await loadSkins(lcu2);
        }
        if (screen === "friends") friends = await loadFriends(lcu2);
        if (screen === "settings" && updateUi.phase === "idle") runUpdateCheck();
        paint();
      });
      content.addEventListener("input", (e) => {
        if (e.target.id !== "status-text") return;
        statusText = e.target.value;
        updateCount();
      });
      content.addEventListener("mousedown", (e) => {
        const box = e.target;
        if (box.id !== "status-text") return;
        const inGrip = e.offsetX > box.clientWidth - GRIP && e.offsetY > box.clientHeight - GRIP;
        if (inGrip) markManual(box);
      });
      function updateSkinGrid() {
        const viewport = shadow.getElementById("skin-viewport");
        const gridEl = shadow.getElementById("skin-grid");
        if (!viewport || !gridEl) return;
        const list = searchSkins(skins, queries.skins);
        const win = skinWindow(list.length, viewport.scrollTop);
        gridEl.style.transform = `translateY(${win.offsetY}px)`;
        gridEl.innerHTML = renderSkinCells(list, backgroundId, win);
      }
      content.addEventListener(
        "scroll",
        (e) => {
          if (e.target.id !== "skin-viewport") return;
          if (skinFrame) return;
          skinFrame = requestAnimationFrame(() => {
            skinFrame = 0;
            updateSkinGrid();
          });
        },
        true
      );
      content.addEventListener("change", (e) => {
        if (e.target.id in steps) {
          steps[e.target.id] = e.target.value;
        }
      });
      content.addEventListener("input", (e) => {
        const key = e.target.dataset && e.target.dataset.search;
        if (!key) return;
        queries[key] = e.target.value;
        paint();
        const again = shadow.querySelector(`[data-search="${key}"]`);
        if (again) {
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }
      });
      content.addEventListener("click", async (e) => {
        const applyPickToggle = (id) => {
          const previous = {
            auto_pick_champion_id: settings.auto_pick_champion_id,
            auto_pick_champion_id_2: settings.auto_pick_champion_id_2
          };
          settings = toggleAutoPickChampion(settings, id);
          paint();
          commit(
            {
              auto_pick_champion_id: settings.auto_pick_champion_id,
              auto_pick_champion_id_2: settings.auto_pick_champion_id_2
            },
            () => {
              settings = { ...settings, ...previous };
            }
          );
        };
        const removePick = e.target.closest("[data-remove-pick]");
        if (removePick) {
          applyPickToggle(Number(removePick.dataset.removePick));
          return;
        }
        const champ = e.target.closest("[data-champ]");
        if (champ) {
          const key = champ.dataset.for;
          const id = Number(champ.dataset.champ);
          if (key === "auto_pick") {
            applyPickToggle(id);
            return;
          }
          const previous = settings[key];
          settings = { ...settings, [key]: previous === id ? 0 : id };
          paint();
          commit({ [key]: settings[key] }, () => {
            settings = { ...settings, [key]: previous };
          });
          return;
        }
        const pill = e.target.closest("[data-provider]");
        if (pill) {
          provider = pill.dataset.provider;
          paint();
          return;
        }
        if (e.target.id === "reveal") {
          const btn2 = e.target;
          btn2.disabled = true;
          let region = "";
          try {
            region = (await lcu2.get("/riotclient/region-locale")).region || "";
          } catch {
          }
          const reveal = makeReveal({
            lcu: lcu2,
            region,
            open: (url) => opener.open(url).then((r) => {
              if (!r.ok) say(r.reason, false);
            })
          });
          const result2 = await reveal.reveal(provider);
          btn2.disabled = false;
          say(result2.ok ? `Looking up ${result2.count} summoners` : result2.reason, result2.ok);
          return;
        }
        const dodgeBtn = e.target.closest("#dodge");
        if (dodgeBtn) {
          e.stopPropagation();
          void runDodge(dodgeBtn);
          return;
        }
        if (e.target.id === "restart-client") {
          const btn2 = e.target;
          btn2.disabled = true;
          const result2 = await restarter.restart();
          btn2.disabled = false;
          say(result2.ok ? "Restarting the client\u2026" : result2.reason, result2.ok);
          return;
        }
        if (e.target.id === "check-updates") {
          await runUpdateCheck();
          return;
        }
        if (e.target.id === "install-update") {
          const btn2 = e.target;
          btn2.disabled = true;
          say("Downloading and installing the update\u2026", true);
          const result2 = await updater.apply();
          if (result2.ok && result2.installing) {
            say("Installing update\u2026", true);
            return;
          }
          btn2.disabled = false;
          if (!result2.ok) {
            trayDown = result2.reason.includes("not running");
            updateUi = { phase: "error", message: result2.reason };
            paint();
          }
          say(result2.ok ? "Drake is already up to date" : result2.reason, result2.ok);
          return;
        }
        const ptab = e.target.closest("[data-ptab]");
        if (ptab) {
          profileTab = ptab.dataset.ptab;
          if (profileTab === "banner" && skins.length === 0) skins = await loadSkins(lcu2);
          paint();
          return;
        }
        const tierTile = e.target.closest("[data-tier]");
        if (tierTile) {
          pickedTier = tierTile.dataset.tier;
          paint();
          return;
        }
        const skinTile = e.target.closest("[data-skin]");
        if (skinTile) {
          const id = Number(skinTile.dataset.skin);
          backgroundId = id;
          paint();
          const result2 = await background.set(id);
          say(result2.ok ? "Profile background set" : result2.reason, result2.ok);
          return;
        }
        if (e.target.id === "friends-remove-all") {
          const btn2 = e.target;
          if (btn2.dataset.armed !== "1") {
            btn2.dataset.armed = "1";
            btn2.textContent = `Remove all ${friends.length}? Click again`;
            return;
          }
          btn2.disabled = true;
          const result2 = await removeAllFriends({ lcu: lcu2, friends });
          friends = await loadFriends(lcu2);
          paint();
          say(
            result2.failed ? `Removed ${result2.removed}, ${result2.failed} failed` : `Removed ${result2.removed} friends`,
            !result2.failed
          );
          return;
        }
        const profileAction = {
          "rank-save": async () => {
            const tier = pickedTier || lol.rankedLeagueTier || "GOLD";
            const patch = profileRankPatch({
              tier,
              division: steps["rank-div"],
              queue: steps["rank-queue"],
              crystal: steps.crystal
            });
            const previous = {
              profile_rank_tier: settings.profile_rank_tier,
              profile_rank_division: settings.profile_rank_division,
              profile_rank_queue: settings.profile_rank_queue,
              profile_rank_crystal: settings.profile_rank_crystal
            };
            settings = { ...settings, ...patch };
            const saved = await commit(patch, () => {
              settings = { ...settings, ...previous };
            });
            if (!saved.ok) return saved;
            return applyProfileRank(presence2, readProfileRank(settings));
          },
          "rank-clear": async () => {
            const patch = profileRankPatch({
              tier: "",
              division: "I",
              queue: QUEUES[0].id,
              crystal: "IRON"
            });
            const previous = {
              profile_rank_tier: settings.profile_rank_tier,
              profile_rank_division: settings.profile_rank_division,
              profile_rank_queue: settings.profile_rank_queue,
              profile_rank_crystal: settings.profile_rank_crystal
            };
            settings = { ...settings, ...patch };
            pickedTier = "";
            steps["rank-div"] = "I";
            steps["rank-queue"] = QUEUES[0].id;
            steps.crystal = "IRON";
            const saved = await commit(patch, () => {
              settings = { ...settings, ...previous };
            });
            if (!saved.ok) return saved;
            return presence2.clearRank();
          },
          "badges-remove": () => challenges.removeBadges(),
          "badges-clone": () => challenges.cloneFirstBadge(),
          "riot-id-save": () => riotId.save(
            `${shadow.getElementById("riot-name").value}#${shadow.getElementById("riot-tag").value}`
          )
        }[e.target.id];
        if (profileAction) {
          const btn2 = e.target;
          const actionId = btn2.id;
          btn2.disabled = true;
          const result2 = await profileAction();
          try {
            lol = readLol(await lcu2.get(CHAT_ME));
          } catch {
          }
          paint();
          const okCopy = {
            "badges-remove": "Badges removed",
            "badges-clone": "Cloned first badge to all 3"
          }[actionId] || "Applied";
          say(result2.ok ? okCopy : result2.reason, result2.ok);
          return;
        }
        if (e.target.id === "status-clear") {
          statusText = "";
          paint();
          return;
        }
        if (e.target.id !== "status-save") return;
        const btn = e.target;
        btn.disabled = true;
        const result = await status.write(statusText);
        btn.disabled = false;
        say(
          result.ok ? `Status saved \xB7 ${describeStatus(statusText)}` : `Could not save: ${result.reason}`,
          result.ok
        );
      });
      content.addEventListener("click", (e) => {
        const row = e.target.closest("[data-setting]");
        if (!row || row.disabled) return;
        const key = row.dataset.setting;
        const previous = settings[key];
        settings = { ...settings, [key]: !previous };
        if (key === "queue_team_reveal_in_client" && teamRevealDom) {
          teamRevealDom.setEnabled(!!settings.queue_team_reveal_in_client);
        }
        paint();
        commit({ [key]: settings[key] }, () => {
          settings = { ...settings, [key]: previous };
          if (key === "queue_team_reveal_in_client" && teamRevealDom) {
            teamRevealDom.setEnabled(!!settings.queue_team_reveal_in_client);
          }
        });
      });
      content.addEventListener("input", (e) => {
        if (e.target.id !== "delay") return;
        shadow.getElementById("delay-value").textContent = formatDelay(Number(e.target.value));
      });
      content.addEventListener("change", (e) => {
        if (e.target.id !== "delay") return;
        const previous = settings.auto_accept_delay_ms;
        settings = { ...settings, auto_accept_delay_ms: Number(e.target.value) };
        commit({ auto_accept_delay_ms: settings.auto_accept_delay_ms }, () => {
          settings = { ...settings, auto_accept_delay_ms: previous };
        });
      });
      shadow.getElementById("cancel-queue").addEventListener("click", async () => {
        const dock = shadow.getElementById("cancel-dock");
        dock.hidden = true;
        try {
          await lcu2.post(DECLINE_ROUTE);
        } catch {
          console.log(TAG, "could not cancel the queue");
        }
      });
      shadow.getElementById("dodge-champ-select").addEventListener("click", (e) => {
        e.stopPropagation();
        void runDodge(e.currentTarget);
      });
      const INTERACTIVE = ".navitem, .pill, .hextech-btn, .check-row, .champ, .skin, .rank, .close, .select-field, .slider";
      shadow.addEventListener(
        "mouseover",
        (e) => {
          const el = e.target.closest(INTERACTIVE);
          if (!el || el.disabled) return;
          if (e.relatedTarget && el.contains(e.relatedTarget)) return;
          const hover = sfxFor(el).hover;
          if (hover) sfx.play(hover);
        },
        true
      );
      shadow.addEventListener(
        "click",
        (e) => {
          const el = e.target.closest(INTERACTIVE);
          if (!el || el.disabled) return;
          if (el.classList.contains("slider")) return;
          sfx.play(sfxFor(el).click);
        },
        true
      );
      shadow.addEventListener(
        "input",
        (e) => {
          const el = e.target.closest(".slider");
          if (!el || el.disabled) return;
          sfx.play(sfxFor(el).click);
        },
        true
      );
      shadow.getElementById("close").addEventListener("click", () => api.close());
      shadow.getElementById("scrim").addEventListener("click", (e) => {
        if (e.target.id === "scrim") api.close();
      });
      paint();
    }
    return { ...ui2, setReadyCheck, setChampSelect, setIdle };
  }

  // src/features/unlockFields.js
  var UNLOCKS = {
    statusMessage: {
      selector: "input.social-status-change-input",
      measuredMaxLength: 25,
      height: null
    }
  };
  var MARK = "drakeUnlocked";
  function isUnlockTarget(el) {
    return el.matches(UNLOCKS.statusMessage.selector);
  }
  function unlockIn(root) {
    let fields;
    try {
      fields = root.querySelectorAll("input, textarea");
    } catch {
      return 0;
    }
    let count = 0;
    for (const f of fields) {
      if (!isUnlockTarget(f)) continue;
      if (f.dataset[MARK]) continue;
      f.dataset[MARK] = "1";
      f.removeAttribute("maxlength");
      if (UNLOCKS.statusMessage.height) f.style.height = UNLOCKS.statusMessage.height;
      count += 1;
    }
    return count;
  }

  // src/features/startUnlocks.js
  function startUnlocks({
    enabled,
    root = document,
    observe = true,
    onFirstUnlock
  } = {}) {
    if (!enabled) return () => {
    };
    let announced = false;
    const scan = () => {
      const n = unlockIn(root);
      if (n > 0 && !announced) {
        announced = true;
        if (onFirstUnlock) onFirstUnlock(n);
      }
    };
    scan();
    if (!observe || typeof MutationObserver === "undefined") return () => {
    };
    const observer = new MutationObserver(scan);
    observer.observe(root.documentElement || root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  // src/features/autoPick.js
  var CHAMP_SELECT_POLL_MS = 500;
  function pickCandidates(settings) {
    const ids = [];
    for (const id of [settings.auto_pick_champion_id, settings.auto_pick_champion_id_2]) {
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }
  function choosePickChampion(session, settings, skipped) {
    const taken = unavailableChampionIds(session);
    for (const id of pickCandidates(settings)) {
      if (taken.has(id) || skipped.has(id)) continue;
      return id;
    }
    return 0;
  }
  function decideAction(session, settings, skipped = /* @__PURE__ */ new Set()) {
    const ban = findMyAction(session, "ban");
    if (ban && settings.auto_ban && settings.auto_ban_champion_id) {
      return {
        actionId: ban.id,
        championId: settings.auto_ban_champion_id,
        completed: true,
        kind: "ban"
      };
    }
    const livePick = findMyAction(session, "pick");
    const queuedPick = isPlanningPhase(session) ? findMyQueuedAction(session, "pick") : null;
    const pick = livePick || queuedPick;
    const championId = choosePickChampion(session, settings, skipped);
    if (pick && settings.auto_pick && championId) {
      return {
        actionId: pick.id,
        championId,
        completed: !!(settings.insta_lock && livePick),
        kind: "pick"
      };
    }
    return null;
  }
  function decisionKey(decision) {
    return `${decision.kind}:${decision.actionId}:${decision.championId}:${decision.completed ? "lock" : "hover"}`;
  }
  function startChampSelectAutomation({
    getSettings,
    champSelect,
    subscribe: subscribe2,
    onResult,
    onSession,
    getSession,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  }) {
    let pending = null;
    let echoed = false;
    let lastSession = null;
    let skipped = /* @__PURE__ */ new Set();
    let pollId = 0;
    let applying = false;
    let inChampSelect2 = false;
    let stopPhase = null;
    let stopSession = null;
    function armSession(active) {
      if (active === inChampSelect2) return;
      inChampSelect2 = active;
      if (active) {
        if (!stopSession) stopSession = subscribe2(SESSION_ROUTE, apply);
        return;
      }
      if (stopSession) {
        stopSession();
        stopSession = null;
      }
      void apply(null);
    }
    function stopPoll() {
      if (pollId) {
        clearTimeoutImpl(pollId);
        pollId = 0;
      }
    }
    function schedulePoll() {
      stopPoll();
      if (typeof getSession !== "function") return;
      pollId = setTimeoutImpl(async () => {
        pollId = 0;
        if (!lastSession) return;
        try {
          const session = await getSession();
          await apply(session || lastSession);
        } catch {
          await apply(lastSession);
        }
      }, CHAMP_SELECT_POLL_MS);
    }
    const apply = async (session) => {
      lastSession = session;
      if (onSession) onSession(session);
      if (!session) {
        pending = null;
        echoed = false;
        skipped = /* @__PURE__ */ new Set();
        stopPoll();
        return;
      }
      if (applying) {
        schedulePoll();
        return;
      }
      applying = true;
      try {
        for (; ; ) {
          const decision = decideAction(session, getSettings(), skipped);
          if (!decision) {
            pending = null;
            echoed = false;
            schedulePoll();
            return;
          }
          const mine = decision.kind === "pick" && !decision.completed ? findMyQueuedAction(session, "pick") || findMyAction(session, "pick") : findMyAction(session, decision.kind);
          if (!mine) {
            pending = null;
            echoed = false;
            schedulePoll();
            return;
          }
          const key = decisionKey(decision);
          const already = mine.championId === decision.championId && (!decision.completed || mine.completed);
          if (already) {
            pending = key;
            echoed = true;
            schedulePoll();
            return;
          }
          if (pending === key && echoed && mine.championId === 0) {
            pending = null;
            echoed = false;
          }
          const needsConfirm = decision.completed && mine.championId === decision.championId && !mine.completed;
          if (pending === key && !needsConfirm) {
            schedulePoll();
            return;
          }
          pending = key;
          const result = await champSelect.commit(
            mine.id,
            decision.championId,
            decision.completed,
            decision.kind
          );
          if (result.ok) {
            if (onResult) onResult(decision, result);
            schedulePoll();
            return;
          }
          pending = null;
          if (onResult) onResult(decision, result);
          if (decision.kind !== "pick") {
            schedulePoll();
            return;
          }
          const nextSkipped = new Set(skipped);
          nextSkipped.add(decision.championId);
          if (!decideAction(session, getSettings(), nextSkipped)) {
            schedulePoll();
            return;
          }
          skipped = nextSkipped;
        }
      } finally {
        applying = false;
      }
    };
    stopPhase = subscribe2(GAMEFLOW_PHASE_ROUTE, (payload) => {
      const phase = readGameflowPhase2(payload);
      if (!phase) return;
      armSession(isChampSelectPhase(phase));
    });
    return {
      refresh: () => {
        if (inChampSelect2) apply(lastSession);
      },
      stop: () => {
        pending = null;
        echoed = false;
        lastSession = null;
        skipped = /* @__PURE__ */ new Set();
        stopPoll();
        if (stopSession) {
          stopSession();
          stopSession = null;
        }
        if (stopPhase) {
          stopPhase();
          stopPhase = null;
        }
        inChampSelect2 = false;
      }
    };
  }

  // src/index.js
  var TAG2 = "[Drake]";
  var lcu = makeLcu();
  var presence = makePresence({ lcu });
  var stopFeatures = () => {
  };
  var stopProfileRank = () => {
  };
  var champSelectCtl = null;
  var ui = null;
  var currentSettings = {};
  var idleInGame = false;
  function sleepPlugin() {
    stopFeatures();
    if (champSelectCtl) {
      champSelectCtl.stop();
      champSelectCtl = null;
    }
    if (ui) ui.setIdle(true);
  }
  function wakePlugin() {
    if (ui) ui.setIdle(false);
    wireFeatures(currentSettings);
  }
  function wireFeatures(settings) {
    currentSettings = settings;
    stopFeatures();
    stopProfileRank();
    if (idleInGame) return;
    const stopAutoAccept = startAutoAccept({
      enabled: !!settings.auto_accept,
      delayMs: settings.auto_accept_delay_ms || 0,
      lcu,
      subscribe,
      onState: (payload) => ui && ui.setReadyCheck(payload)
    });
    if (!champSelectCtl) {
      champSelectCtl = startChampSelectAutomation({
        getSettings: () => currentSettings,
        champSelect: makeChampSelect({ lcu }),
        subscribe,
        getSession: () => lcu.get("/lol-champ-select/v1/session"),
        onResult: (d, r) => console.log(TAG2, d.kind, d.championId, r.ok ? "ok" : "failed: " + r.reason),
        onSession: (session) => ui && ui.setChampSelect(session)
      });
    } else {
      champSelectCtl.refresh();
    }
    const stopUnlocks = startUnlocks({
      enabled: !!settings.unlock_status_message,
      onFirstUnlock: (n) => console.log(TAG2, "unlocked the status message input", n > 1 ? n : "")
    });
    stopProfileRank = startProfileRankRefresh({
      subscribe,
      getSettings: () => currentSettings,
      presence,
      lcu
    });
    stopFeatures = () => {
      stopProfileRank();
      if (typeof stopAutoAccept === "function") stopAutoAccept();
      stopUnlocks();
    };
  }
  async function start() {
    const cfg = await loadConfig();
    if (!cfg) {
      console.log(TAG2, "no config.json found; the tray app may not be running");
      ui = startUI({ cfg: { port: 0, token: "", settings: {} }, lcu });
      return;
    }
    const transport = makeTransport({
      port: cfg.port,
      token: cfg.token,
      dataStore: typeof DataStore !== "undefined" ? DataStore : null,
      reloadConfig: loadConfig,
      pluginBuild: PLUGIN_BUILD
    });
    const host = typeof Pengu !== "undefined" && Pengu.version ? `pengu ${Pengu.version}` : "unknown";
    const ok = await startHeartbeat({ checkIn: transport.checkIn, host });
    console.log(TAG2, "check-in", ok ? "ok" : "failed", "| settings", JSON.stringify(cfg.settings));
    ui = startUI({ cfg, onSettingsChanged: wireFeatures, lcu });
    wireFeatures(cfg.settings);
    startInGameIdle({
      subscribe,
      onChange(idle) {
        idleInGame = idle;
        console.log(TAG2, idle ? "idle in game" : "active in client");
        if (idle) sleepPlugin();
        else wakePlugin();
      }
    });
    console.log(TAG2, "UI ready \u2014 press Ctrl+D");
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
