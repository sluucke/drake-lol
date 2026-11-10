import { makeLcu } from './lcu';
import { startUI } from './ui/index';
import { createPanelSync } from './features/panelSync';
import { SESSION_ROUTE } from './features/champSelect';
import { subscribe } from './subscribe';
import { installErrorReporter, sendToTray } from './errorReporter';
import type { FetchLike } from './lcu';
import type { PluginConfig, SettingsValues } from './settings';
import type { SubscribeFn, Unsubscribe } from './subscribe';
import type { OverlayRect } from './app/store/sessionSlice';
import type { LegacyActions } from './app/shell/LegacyActions';

export interface OverlaySnapshot {
  version?: string;
  settings?: SettingsValues;
  effective?: unknown;
  views?: string[];
  client?: OverlayRect | null;
  chrome?: OverlayRect | null;
  ready_check?: unknown;
  dodge?: unknown;
  panel_open?: unknown;
}

interface OverlayLcuReply {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

const SNAPSHOT_MS = 400;
const DODGE_FEEDBACK_MS = 2500;

function readParams() {
  const q = new URLSearchParams(location.search);
  return {
    token: q.get('token') || '',
    port: Number(q.get('port') || location.port || 48151),
  };
}

function baseUrl(port: number | string): string {
  return `http://127.0.0.1:${port}`;
}

export function makeOverlayFetch(port: number | string, token: string): FetchLike {
  return async (input: string | { url?: string }, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : String(input?.url || input);
    let route = raw;
    try {
      if (raw.startsWith('http')) {
        const u = new URL(raw);
        route = `${u.pathname}${u.search}`;
      }
    } catch {
      route = raw;
    }
    const method = String(init.method || 'GET').toUpperCase();
    let body: unknown;
    if (init.body != null && init.body !== '') {
      try {
        body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      } catch {
        body = init.body;
      }
    }
    const res = await fetch(`${baseUrl(port)}/overlay/lcu`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, method, route, body }),
    });
    const data = (await res.json().catch(() => ({ ok: false, status: 502, body: null }))) as OverlayLcuReply;
    return new Response(JSON.stringify(data.body ?? null), {
      status: data.status || (data.ok ? 200 : 502),
      headers: { 'content-type': 'application/json' },
    });
  };
}

async function postJson(port: number | string, token: string, path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${baseUrl(port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as unknown;
}

function snapshotConfig(snap: OverlaySnapshot, token: string, port: number): PluginConfig {
  return {
    token,
    port,
    version: snap.version || '0.0.0',
    settings: snap.settings || {},
    streaming_effective: 'overlay',
    streaming_tool_running: false,
  };
}

async function boot() {
  const { token, port } = readParams();
  installErrorReporter({ send: sendToTray({ port, token }), source: 'overlay' });
  globalThis.__DRAKE_ASSET_PROXY__ = `${baseUrl(port)}/overlay/asset?token=${encodeURIComponent(token)}&path=`;
  const post = (path: string, body?: Record<string, unknown>) => postJson(port, token, path, body);
  const snapshot = () => post('/overlay/snapshot', {}) as Promise<OverlaySnapshot>;
  const sync = createPanelSync();
  let applyingRemote = false;

  const snap0 = await snapshot();
  let lastSettingsJson = JSON.stringify(snap0.settings || {});

  const overlayFetch = makeOverlayFetch(port, token);
  const subscribeImpl: SubscribeFn = (route, handler) => subscribe(route, handler, { fetchImpl: overlayFetch });
  const ui = startUI({
    cfg: snapshotConfig(snap0, token, port),
    lcu: makeLcu(overlayFetch),
    subscribeImpl,
    host: 'overlay',
    mountParent: document.getElementById('root'),
    reloadConfig: async () => snapshotConfig(await snapshot(), token, port),
    onPanelChange: (open) => {
      document.body.classList.toggle('panel-open', open);
      if (applyingRemote) return;
      sync.localChange(open);
      void post('/overlay/ui', { panel_open: open }).catch(() => {});
    },
  });
  const { store } = ui;

  Object.assign(ui.actions, {
    togglePanel: () => ui.toggle(),
    setOverlayDragging: (dragging: boolean) => {
      void post('/overlay/ui', { dragging: !!dragging }).catch(() => {});
    },
    cancelQueue: async () => {
      store.getState().patchChampSelect({ cancelable: false });
      await post('/overlay/action', { action: 'cancel' }).catch(() => {});
    },
    dodge: async () => {
      store.getState().patchChampSelect({ dodge: 'busy' });
      const sent = await post('/overlay/action', { action: 'dodge' }).then(
        () => true,
        () => false,
      );
      window.setTimeout(() => store.getState().patchChampSelect({ dodge: 'idle' }), DODGE_FEEDBACK_MS);
      return sent ? { ok: true } : { ok: false, reason: 'Drake tray is not running' };
    },
  } satisfies Partial<LegacyActions>);

  let stopSession: Unsubscribe | null = null;
  function syncSession(active: boolean) {
    if (active && !stopSession) {
      stopSession = subscribeImpl(SESSION_ROUTE, (session) => ui.setChampSelect(session));
    } else if (!active && stopSession) {
      stopSession();
      stopSession = null;
      ui.setChampSelect(null);
    }
  }

  store.subscribe((state, prev) => {
    if (state.teamReveal.open !== prev.teamReveal.open) {
      void post('/overlay/ui', { modal_open: !!state.teamReveal.open }).catch(() => {});
    }
  });

  function applySnapshot(snap: OverlaySnapshot) {
    syncSession(!!snap.effective);
    for (const view of snap.views || []) ui.toggleView(view);
    const state = store.getState();
    state.setSession({ overlayGeometry: { client: snap.client || null, chrome: snap.chrome || null } });
    state.patchChampSelect({
      cancelable: !!snap.ready_check,
      active: !!snap.dodge,
    });
    const settingsJson = JSON.stringify(snap.settings || {});
    if (snap.settings && settingsJson !== lastSettingsJson) {
      lastSettingsJson = settingsJson;
      ui.replaceSettings(snap.settings);
    }
    const decision = sync.remote(!!snap.panel_open, ui.isOpen());
    if (decision === 'reject') {
      void post('/overlay/ui', { panel_open: false }).catch(() => {});
    } else if (decision === 'apply') {
      applyingRemote = true;
      try {
        if (snap.panel_open) ui.open();
        else ui.close();
      } finally {
        applyingRemote = false;
      }
    }
  }

  applySnapshot(snap0);
  window.setInterval(() => {
    void snapshot().then(applySnapshot).catch(() => {});
  }, SNAPSHOT_MS);
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
  boot().catch((err) => console.error('[Drake overlay]', err));
}
