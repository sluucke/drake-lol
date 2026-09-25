import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { SOCIAL_BAR_SELECTOR } from '../../../src/ui/socialToggle.js';
import { clearIntervalsAfterEach } from './intervals.js';

function fakeLcu() {
  const reply = async () => null;
  return { get: reply, post: reply, put: reply, patch: reply, delete: reply };
}

function makeBar() {
  const bar = document.createElement('div');
  bar.className = SOCIAL_BAR_SELECTOR.slice(1);
  bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 40 });
  const bug = document.createElement('button');
  bug.className = 'bug-report-button';
  bar.appendChild(bug);
  document.body.appendChild(bar);
  return bar;
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function boot(cfgExtra, { failFonts = false } = {}) {
  vi.resetModules();
  delete window.__drakeUIMounted;
  document.getElementById('drake-ui-host')?.remove();
  const posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (String(url).includes('/fe/fonts/')) {
      return new Response(new Uint8Array([7, 7, 7]), { status: 200, headers: { 'content-type': 'font/woff2' } });
    }
    posts.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (failFonts && String(url).endsWith('/overlay/fonts')) return new Response(null, { status: 500 });
    return new Response(null, { status: 204 });
  }));
  const { startUI } = await import('../../../src/ui/index.js');
  const cfg = { token: 't', port: 48151, version: '0.4.0', settings: { onboarding_done: true, whats_new_seen_version: '0.4.0' }, ...cfgExtra };
  const ui = startUI({ cfg, lcu: fakeLcu(), reloadConfig: async () => ({ ...cfg }) });
  return { ui, posts };
}

clearIntervalsAfterEach();

describe('client host', () => {
  it('opens the panel from the social bar button when streaming is off', async () => {
    const bar = makeBar();
    const { ui } = await boot({ streaming_effective: 'in-client' });
    const btn = await waitFor(() => {
      const found = bar.querySelector('button[data-drake-toggle]');
      expect(found).not.toBeNull();
      return found;
    });
    act(() => btn.click());
    expect(ui.isOpen()).toBe(true);
    bar.remove();
  }, 60000);

  it('forwards Ctrl+D to the tray when the streaming overlay is active', async () => {
    const { ui, posts } = await boot({ streaming_effective: 'overlay' });
    expect(ui.host().style.visibility).toBe('hidden');
    await waitFor(() =>
      expect(posts.some((p) => p.url.endsWith('/overlay/plugin') && 'ready_check' in (p.body || {}))).toBe(true),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    });
    expect(ui.isOpen()).toBe(false);
    await waitFor(() =>
      expect(posts.some((p) => p.url.endsWith('/overlay/plugin') && p.body?.toggle_panel === true)).toBe(true),
    );
  }, 60000);

  it('forwards the scouting and build hotkeys to the overlay while streaming', async () => {
    const { posts } = await boot({ streaming_effective: 'overlay' });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    });
    await waitFor(() => {
      const views = posts.filter((p) => p.url.endsWith('/overlay/plugin') && p.body?.open_view).map((p) => p.body.open_view);
      expect(views[0]).toBe('scouting');
      expect(views).toContain('build');
    });
  }, 60000);

  it('hands the League fonts to the overlay once while streaming', async () => {
    const style = document.createElement('style');
    style.textContent = '@font-face { font-family: "LoL Display"; src: url("/fe/fonts/display.woff2"); font-weight: 700; }';
    document.head.appendChild(style);
    const { posts } = await boot({ streaming_effective: 'overlay' });
    await waitFor(() => {
      const uploads = posts.filter((p) => p.url.endsWith('/overlay/fonts'));
      expect(uploads).toHaveLength(1);
      expect(uploads[0].body.fonts).toEqual([
        { family: 'LoL Display', weight: '700', style: 'normal', mime: 'font/woff2', data: 'BwcH' },
      ]);
    });
    await new Promise((r) => setTimeout(r, 1600));
    expect(posts.filter((p) => p.url.endsWith('/overlay/fonts'))).toHaveLength(1);
    style.remove();
  }, 60000);

  it('gives up on sharing fonts after a few failed uploads', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] });
    try {
      const style = document.createElement('style');
      style.textContent = '@font-face { font-family: "LoL Display"; src: url("/fe/fonts/display.woff2"); }';
      document.head.appendChild(style);
      const { posts } = await boot({ streaming_effective: 'overlay' }, { failFonts: true });
      for (let i = 0; i < 12; i += 1) {
        await vi.advanceTimersByTimeAsync(15000);
      }
      expect(posts.filter((p) => p.url.endsWith('/overlay/fonts'))).toHaveLength(3);
      style.remove();
    } finally {
      vi.useRealTimers();
    }
  }, 60000);
});

