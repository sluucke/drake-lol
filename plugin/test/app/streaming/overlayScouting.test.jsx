import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';

function fakeTray(settings = { queue_dodge_in_client: true }) {
  const state = { panel_open: false, modal_open: false, views: [], posts: [] };
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

describe('overlay scouting', () => {
  it('opens team scouting when the client forwards Ctrl+Shift+D', async () => {
    const tray = fakeTray({ queue_team_reveal_in_client: true });
    vi.stubGlobal('fetch', tray.fetchImpl);
    window.history.replaceState({}, '', '/overlay/?token=t&port=48151');
    document.body.innerHTML = '<div id="root" class="root"></div>';
    await import('../../../src/overlayMain.jsx');
    await waitFor(() => expect(document.getElementById('drake-overlay-ui-host')).not.toBeNull());

    tray.state.views.push('scouting');
    await waitFor(() => expect(tray.state.modal_open).toBe(true), { timeout: 3000 });
    const shadow = document.getElementById('drake-overlay-ui-host').shadowRoot;
    expect(shadow.querySelector('.drk-scout-toast')).toBeNull();
    expect(shadow.querySelector('.drk-scout-modal, [role="dialog"]')).not.toBeNull();
  }, 60000);
});
