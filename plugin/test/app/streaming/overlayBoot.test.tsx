import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { clearIntervalsAfterEach } from './intervals';
import type { SettingsValues } from '../../../src/settings';

function fakeTray(settings: SettingsValues = { queue_dodge_in_client: true }) {
  const state = {
    panel_open: false,
    modal_open: false,
    views: [] as string[],
    posts: [] as { path: string; body: Record<string, unknown> }[],
  };
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
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = (init.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    state.posts.push({ path, body });
    if (path === '/overlay/snapshot') return new Response(JSON.stringify(snapshot()), { status: 200 });
    if (path === '/overlay/ui') {
      if ('panel_open' in body) state.panel_open = body.panel_open as boolean;
      if ('modal_open' in body) state.modal_open = body.modal_open as boolean;
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

describe('overlay boot', () => {
  it('mounts the app and opens the panel from Ctrl+D', async () => {
    const tray = fakeTray();
    vi.stubGlobal('fetch', tray.fetchImpl);
    window.history.replaceState({}, '', '/overlay/?token=t&port=48151');
    document.body.innerHTML = '<div id="root" class="root"></div>';
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (!text.includes('not wrapped in act') && !text.includes('wrapped into act')) errors.push(text);
    });

    await import('../../../src/overlayMain');
    await waitFor(() => expect(document.getElementById('drake-overlay-ui-host')).not.toBeNull());
    expect(errors).toEqual([]);

    const shadow = document.getElementById('drake-overlay-ui-host')?.shadowRoot as ShadowRoot;
    await waitFor(() => expect(shadow.querySelector('.drk-overlay-fab')).not.toBeNull());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    });
    await waitFor(() => expect(tray.state.panel_open).toBe(true));
    await waitFor(() => expect(shadow.querySelector<HTMLElement>('.drk-panel')?.dataset.open).toBe('true'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(shadow.querySelector<HTMLElement>('.drk-panel')?.dataset.open).toBe('true');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => expect(tray.state.panel_open).toBe(false));
    await waitFor(() => expect(shadow.querySelector('.drk-overlay-fab')).not.toBeNull());
    act(() => shadow.querySelector<HTMLElement>('.drk-overlay-fab')?.click());
    await waitFor(() => expect(tray.state.panel_open).toBe(true));
    await new Promise((r) => setTimeout(r, 1500));
    expect(shadow.querySelector<HTMLElement>('.drk-panel')?.dataset.open).toBe('true');
    const win = shadow.querySelector('.drk-panel__window') as Element;
    expect(getComputedStyle(win).display).not.toBe('none');
  }, 60000);
});
