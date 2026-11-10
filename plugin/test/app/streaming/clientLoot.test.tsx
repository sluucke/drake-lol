import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { clearIntervalsAfterEach } from './intervals';
import type { Lcu } from '../../../src/lcu';
import type { PluginConfig } from '../../../src/settings';
import type { MountWindow } from '../../../src/ui/mount';

function fakeLcu() {
  const reply = async () => null;
  return { get: reply, post: reply, put: reply, patch: reply, delete: reply } as unknown as Lcu;
}

function makeLootRoot() {
  const root = document.createElement('div');
  root.className = 'screen-root';
  root.setAttribute('data-screen-name', 'rcp-fe-lol-loot');
  const rect = { left: 0, top: 80, right: 1000, bottom: 720, width: 1000, height: 640, x: 0, y: 80 } as DOMRect;
  root.getBoundingClientRect = () => rect;
  const state = { visible: true };
  root.getClientRects = () => (state.visible ? [rect] : []) as unknown as DOMRectList;
  document.body.appendChild(root);
  return { hide: () => (state.visible = false) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

clearIntervalsAfterEach();

describe('client loot anchor push', () => {
  it('pushes the loot anchor while streaming and null once the loot screen closes, only on change', async () => {
    vi.resetModules();
    delete (window as MountWindow).__drakeUIMounted;
    document.getElementById('drake-ui-host')?.remove();
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (String(url).endsWith('/overlay/plugin') && init.body) posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response('{}', { status: 200 });
      }),
    );
    const loot = makeLootRoot();
    const { startUI } = await import('../../../src/ui/index');
    const cfg: PluginConfig = {
      token: 't',
      port: 48151,
      version: '0.4.0',
      settings: { onboarding_done: true, whats_new_seen_version: '0.4.0' },
      streaming_effective: 'overlay',
    };
    startUI({ cfg, lcu: fakeLcu(), reloadConfig: async () => ({ ...cfg }) });
    const lootPosts = () => posts.filter((body) => 'loot' in body).map((body) => body.loot);
    const right = Math.max(0, window.innerWidth - 1000) + 24;
    await waitFor(() => expect(lootPosts()[0]).toEqual({ top: 80 + 120 + 14, right }), { timeout: 3000 });
    const pushes = posts.filter((body) => 'ready_check' in body).length;
    await waitFor(() => expect(posts.filter((body) => 'ready_check' in body).length).toBeGreaterThan(pushes + 1), { timeout: 4000 });
    expect(lootPosts()).toHaveLength(1);
    loot.hide();
    await waitFor(() => expect(lootPosts()).toEqual([{ top: 214, right }, null]), { timeout: 3000 });
  }, 60000);
});
