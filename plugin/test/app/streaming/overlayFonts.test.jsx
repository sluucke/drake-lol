import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { clearIntervalsAfterEach } from './intervals.js';

function fakeTray(settings = { queue_dodge_in_client: true }) {
  const state = { panel_open: false, modal_open: false, views: [], posts: [], fonts: [] };
  const snapshot = () => ({
    version: '0.4.0',
    settings,
    panel_open: state.panel_open,
    ready_check: false,
    dodge: false,
    client: { x: 0, y: 0, width: 1280, height: 720 },
    chrome: { x: 0, y: 0, width: 1280, height: 720 },
    views: state.views.splice(0),
    effective: true,
    fonts: state.fonts,
  });
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    state.posts.push({ path, body });
    if (path === '/overlay/snapshot') return new Response(JSON.stringify(snapshot()), { status: 200 });
    if (path === '/overlay/ui') {
      if ('panel_open' in body) state.panel_open = body.panel_open;
      if ('modal_open' in body) state.modal_open = body.modal_open;
      return new Response('', { status: 204 });
    }
    if (path === '/overlay/lcu') return new Response(JSON.stringify({ ok: true, status: 200, body: null }), { status: 200 });
    return new Response('', { status: 204 });
  });
  return { state, fetchImpl };
}

afterEach(() => {
  vi.restoreAllMocks();
});

clearIntervalsAfterEach();

describe('overlay fonts', () => {
  it('registers the League fonts the tray serves', async () => {
    const tray = fakeTray();
    tray.state.fonts = [{ family: 'LoL Display', weight: '700', style: 'normal', url: '/overlay/font/0?token=t' }];
    vi.stubGlobal('fetch', tray.fetchImpl);
    const added = [];
    vi.stubGlobal(
      'FontFace',
      class {
        constructor(family, source) {
          Object.assign(this, { family, source });
        }
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: (face) => added.push(face) } });
    window.history.replaceState({}, '', '/overlay/?token=t&port=48151');
    document.body.innerHTML = '<div id="root" class="root"></div>';
    await import('../../../src/overlayMain.jsx');
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0].source).toBe('url("http://127.0.0.1:48151/overlay/font/0?token=t")');
    await new Promise((r) => setTimeout(r, 900));
    expect(added).toHaveLength(1);
  }, 60000);
});
