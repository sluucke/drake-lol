import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { SOCIAL_BAR_SELECTOR } from '../../../src/ui/socialToggle.js';

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

async function boot(cfgExtra) {
  vi.resetModules();
  delete window.__drakeUIMounted;
  document.getElementById('drake-ui-host')?.remove();
  const posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    posts.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    return new Response('', { status: 204 });
  }));
  const { startUI } = await import('../../../src/ui/index.js');
  const cfg = { token: 't', port: 48151, version: '0.4.0', settings: { onboarding_done: true, whats_new_seen_version: '0.4.0' }, ...cfgExtra };
  const ui = startUI({ cfg, lcu: fakeLcu(), reloadConfig: async () => ({ ...cfg }) });
  return { ui, posts };
}

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
});

