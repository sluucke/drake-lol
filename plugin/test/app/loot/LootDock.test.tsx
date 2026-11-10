import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore';
import { LootDock } from '../../../src/app/overlays/loot/LootDock';
import { LOOT_POLL_MS, LOOT_SCREEN_SELECTOR, findLootScreen, lootAnchor } from '../../../src/app/overlays/loot/useLootScreen';
import { startApp } from '../../../src/app/main';
import type { AppActions } from '../../../src/app/AppProviders';
import { lootItems } from './lootFixtures';

function makeLootRoot({ visible = true } = {}) {
  const root = document.createElement('div');
  root.className = 'screen-root';
  root.setAttribute('data-screen-name', 'rcp-fe-lol-loot');
  const inventory = document.createElement('div');
  inventory.className = 'loot-inventory';
  root.appendChild(inventory);
  const rect = { left: 0, top: 80, right: 1200, bottom: 720, width: 1200, height: 640, x: 0, y: 80 } as DOMRect;
  root.getBoundingClientRect = () => rect;
  const state = { visible };
  root.getClientRects = () => (state.visible ? [rect] : []) as unknown as DOMRectList;
  document.body.appendChild(root);
  return { root, show: () => (state.visible = true) };
}

function setup() {
  const store = createDrakeStore();
  const actions = { loadLoot: vi.fn(async () => lootItems()) };
  const utils = renderWithProviders(<LootDock />, { store, actions });
  const button = () => within(utils.portalTarget).queryByRole('button', { name: 'Bulk disenchant' });
  return { ...utils, store, actions, button };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loot screen detection', () => {
  it('finds the loot screen only while it is visible', () => {
    expect(findLootScreen(document)).toBeNull();
    const { show } = makeLootRoot({ visible: false });
    expect(document.querySelector(LOOT_SCREEN_SELECTOR)).not.toBeNull();
    expect(findLootScreen(document)).toBeNull();
    show();
    expect(findLootScreen(document)).not.toBeNull();
  });

  it('anchors near the top right of the loot screen', () => {
    const { root } = makeLootRoot();
    const win = { innerWidth: 1280 } as Window;
    expect(lootAnchor(root, win)).toEqual({ top: 94, right: 104 });
    expect(lootAnchor(null, win)).toBeNull();
  });
});

describe('LootDock', () => {
  it('renders nothing when the loot screen is not open', () => {
    const { button } = setup();
    expect(button()).toBeNull();
  });

  it('renders nothing when the loot screen root is hidden', () => {
    makeLootRoot({ visible: false });
    const { button } = setup();
    expect(button()).toBeNull();
  });

  it('shows the button on the visible loot screen and opens the modal', async () => {
    makeLootRoot();
    const { button, portalTarget, actions } = setup();
    const btn = button();
    expect(btn).not.toBeNull();
    const dock = portalTarget.querySelector<HTMLElement>('.drk-dock--loot');
    expect(dock?.style.top).toBe('94px');
    fireEvent.click(btn as HTMLElement);
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Bulk disenchant' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Ahri' })).toBeTruthy());
    expect(actions.loadLoot).toHaveBeenCalledTimes(1);
  });

  it('appears once the loot screen becomes visible', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { show } = makeLootRoot({ visible: false });
    const { button } = setup();
    expect(button()).toBeNull();
    show();
    act(() => {
      vi.advanceTimersByTime(LOOT_POLL_MS);
    });
    expect(button()).not.toBeNull();
  });

  it('stays out of game, the streaming overlay and the overlay host', async () => {
    makeLootRoot();
    const { button, store } = setup();
    expect(button()).not.toBeNull();
    act(() => store.getState().setSession({ idle: true }));
    await waitFor(() => expect(button()).toBeNull());
    act(() => store.getState().setSession({ idle: false, streaming: { host: 'client', effective: 'overlay' } }));
    await waitFor(() => expect(button()).toBeNull());
    act(() => store.getState().setSession({ streaming: { host: 'overlay', effective: 'overlay' } }));
    await waitFor(() => expect(button()).toBeNull());
    act(() => store.getState().setSession({ streaming: { host: 'client', effective: 'in-client' } }));
    await waitFor(() => expect(button()).not.toBeNull());
  });

  it('is hidden by the mandatory update block', async () => {
    makeLootRoot();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const store = createDrakeStore();
    const actions: Partial<AppActions> = { loadLoot: async () => [] };
    const app = startApp(shadow, { store, actions: actions as AppActions });
    const find = () => shadow.querySelector('[data-drake-loot="true"]');
    await waitFor(() => expect(find()).not.toBeNull());
    act(() => store.getState().setSession({ updateRequired: { version: 'v9', phase: 'required' } }));
    await waitFor(() => expect(find()).toBeNull());
    app.unmount();
  });
});
