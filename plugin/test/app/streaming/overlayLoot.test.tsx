import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { clearIntervalsAfterEach } from './intervals';

const LOOT = [
  { lootId: 'CHAMPION_RENTAL_103', type: 'CHAMPION_RENTAL', itemDesc: 'Ahri', count: 2, disenchantValue: 1260, disenchantLootName: 'CURRENCY_champion', itemStatus: 'OWNED', storeItemId: 103 },
];

function fakeTray() {
  const state = {
    modal_open: false,
    loot: { top: 166, right: 104 } as { top: number; right: number } | null,
    lcu: [] as { method: string; route: string }[],
  };
  const snapshot = () => ({
    version: '0.4.0',
    settings: { onboarding_done: true, whats_new_seen_version: '0.4.0' },
    panel_open: false,
    ready_check: false,
    dodge: false,
    client: { x: 0, y: 0, width: 1280, height: 720 },
    chrome: { x: 0, y: 0, width: 1280, height: 720 },
    views: [],
    effective: true,
    loot: state.loot,
  });
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = (init.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
    if (path === '/overlay/snapshot') return new Response(JSON.stringify(snapshot()), { status: 200 });
    if (path === '/overlay/ui') {
      if ('modal_open' in body) state.modal_open = body.modal_open as boolean;
      return new Response('', { status: 204 });
    }
    if (path === '/overlay/lcu') {
      const route = String(body.route);
      state.lcu.push({ method: String(body.method), route });
      const reply = route === '/lol-loot/v1/player-loot' ? LOOT : null;
      return new Response(JSON.stringify({ ok: true, status: 200, body: reply }), { status: 200 });
    }
    return new Response('', { status: 204 });
  });
  return { state, fetchImpl };
}

afterEach(() => {
  vi.restoreAllMocks();
});

clearIntervalsAfterEach();

describe('overlay loot', () => {
  it('shows the loot button from the snapshot and runs the modal through the overlay LCU proxy', async () => {
    const tray = fakeTray();
    vi.stubGlobal('fetch', tray.fetchImpl);
    window.history.replaceState({}, '', '/overlay/?token=t&port=48151');
    document.body.innerHTML = '<div id="root" class="root"></div>';
    await import('../../../src/overlayMain');
    await waitFor(() => expect(document.getElementById('drake-overlay-ui-host')).not.toBeNull());
    const shadow = document.getElementById('drake-overlay-ui-host')?.shadowRoot as ShadowRoot;
    const view = within(shadow as unknown as HTMLElement);
    const button = await waitFor(() => {
      const found = shadow.querySelector<HTMLElement>('[data-drake-loot="true"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    }, { timeout: 3000 });
    act(() => fireEvent.click(button));
    await waitFor(() => expect(tray.state.modal_open).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(view.getByRole('button', { name: 'Ahri' })).toBeTruthy(), { timeout: 3000 });
    expect(tray.state.lcu.some((c) => c.method === 'GET' && c.route === '/lol-loot/v1/player-loot')).toBe(true);
    act(() => fireEvent.keyDown(window, { key: 'Escape' }));
    await waitFor(() => expect(tray.state.modal_open).toBe(false), { timeout: 3000 });
    tray.state.loot = null;
    await waitFor(() => expect(shadow.querySelector('[data-drake-loot="true"]')).toBeNull(), { timeout: 3000 });
  }, 60000);
});
