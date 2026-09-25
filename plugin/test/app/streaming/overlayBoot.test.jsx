import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';

function fakeTray() {
  const state = { panel_open: false, posts: [] };
  const snapshot = () => ({
    version: '0.4.0',
    settings: { queue_dodge_in_client: true },
    panel_open: state.panel_open,
    ready_check: false,
    dodge: false,
    client: { x: 0, y: 0, width: 1280, height: 720 },
    chrome: { x: 0, y: 0, width: 1280, height: 720 },
  });
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    state.posts.push({ path, body });
    if (path === '/overlay/snapshot') return new Response(JSON.stringify(snapshot()), { status: 200 });
    if (path === '/overlay/ui') {
      state.panel_open = body.panel_open;
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

describe('overlay boot', () => {
  it('mounts the app and opens the panel from Ctrl+D', async () => {
    const tray = fakeTray();
    vi.stubGlobal('fetch', tray.fetchImpl);
    window.history.replaceState({}, '', '/overlay/?token=t&port=48151');
    document.body.innerHTML = '<div id="root" class="root"></div>';
    const errors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      const text = args.map(String).join(' ');
      if (!text.includes('not wrapped in act') && !text.includes('wrapped into act')) errors.push(text);
    });

    await import('../../../src/overlayMain.jsx');
    await waitFor(() => expect(document.getElementById('drake-overlay-ui-host')).not.toBeNull());
    expect(errors).toEqual([]);

    const shadow = document.getElementById('drake-overlay-ui-host').shadowRoot;
    await waitFor(() => expect(shadow.querySelector('.drk-overlay-fab')).not.toBeNull());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    });
    await waitFor(() => expect(tray.state.panel_open).toBe(true));
    await waitFor(() => expect(shadow.querySelector('.drk-panel').dataset.open).toBe('true'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(shadow.querySelector('.drk-panel').dataset.open).toBe('true');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => expect(tray.state.panel_open).toBe(false));
    await waitFor(() => expect(shadow.querySelector('.drk-overlay-fab')).not.toBeNull());
    act(() => shadow.querySelector('.drk-overlay-fab').click());
    await waitFor(() => expect(tray.state.panel_open).toBe(true));
    await new Promise((r) => setTimeout(r, 1500));
    expect(shadow.querySelector('.drk-panel').dataset.open).toBe('true');
    const win = shadow.querySelector('.drk-panel__window');
    expect(getComputedStyle(win).display).not.toBe('none');
  }, 60000);
});
