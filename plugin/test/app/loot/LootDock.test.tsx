import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore';
import { LootDock } from '../../../src/app/overlays/loot/LootDock';
import { LOOT_POLL_MS, LOOT_SCREEN_SELECTOR, findLootScreen, lootAnchor } from '../../../src/app/overlays/loot/useLootScreen';
import { startApp } from '../../../src/app/main';
import type { AppActions } from '../../../src/app/AppProviders';
import { lootItems } from './lootFixtures';

function makeLootRoot({ visible = true, inventoryTop = 152 }: { visible?: boolean; inventoryTop?: number | null } = {}) {
  const root = document.createElement('div');
  root.className = 'screen-root';
  root.setAttribute('data-screen-name', 'rcp-fe-lol-loot');
  const inventory = document.createElement('div');
  inventory.className = 'loot-inventory';
  root.appendChild(inventory);
  if (inventoryTop !== null) {
    const inventoryRect = { left: 0, top: inventoryTop, right: 410, bottom: 720, width: 410, height: 720 - inventoryTop, x: 0, y: inventoryTop } as DOMRect;
    inventory.getBoundingClientRect = () => inventoryRect;
    inventory.getClientRects = () => [inventoryRect] as unknown as DOMRectList;
  }
  const rect = { left: 0, top: 0, right: 1200, bottom: 720, width: 1200, height: 720, x: 0, y: 0 } as DOMRect;
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

  it('anchors at the bottom left of the loot screen, above the client help button', () => {
    const { root } = makeLootRoot();
    const win = { innerWidth: 1280 } as Window;
    expect(lootAnchor(root, win)).toEqual({ top: 720 - 64 - 40, right: 1280 - 8 - 40 });
    expect(lootAnchor(null, win)).toBeNull();
  });

  it('falls back to the loot screen edge when the inventory is not on screen yet', () => {
    const { root } = makeLootRoot({ inventoryTop: null });
    expect(lootAnchor(root, { innerWidth: 1280 } as Window)).toEqual({ top: 616, right: 1232 });
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
    expect(dock?.style.top).toBe('616px');
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

describe('LootDock in the streaming overlay', () => {
  const CLIENT = { x: 0, y: 0, width: 1280, height: 720 };

  function overlaySetup(loot: { top: number; right: number } | null) {
    const store = createDrakeStore();
    store.getState().setSession({
      streaming: { host: 'overlay', effective: 'overlay' },
      overlayGeometry: { client: CLIENT, chrome: CLIENT },
      overlayLoot: loot,
    });
    const actions = { loadLoot: vi.fn(async () => lootItems()) };
    const utils = renderWithProviders(<LootDock />, { store, actions });
    const button = () => within(utils.portalTarget).queryByRole('button', { name: 'Bulk disenchant' });
    return { ...utils, store, actions, button };
  }

  it('places the button at the tray anchor, inside the 40x40 click area', () => {
    makeLootRoot();
    const { portalTarget, button } = overlaySetup({ top: 166, right: 104 });
    expect(button()).not.toBeNull();
    const dock = portalTarget.querySelector<HTMLElement>('.drk-dock--overlay-loot');
    expect(dock?.style.left).toBe(`${1280 - 104 - 40}px`);
    expect(dock?.style.top).toBe('166px');
    expect(dock?.style.width).toBe('40px');
    expect(dock?.style.height).toBe('40px');
  });

  it('hides the button when the client reports no loot screen', async () => {
    const { button, store } = overlaySetup({ top: 166, right: 104 });
    expect(button()).not.toBeNull();
    act(() => store.getState().setSession({ overlayLoot: null }));
    await waitFor(() => expect(button()).toBeNull());
  });

  it('opens the modal through the store so the window can take clicks', async () => {
    const { button, store, portalTarget, actions } = overlaySetup({ top: 166, right: 104 });
    fireEvent.click(button() as HTMLElement);
    expect(store.getState().ui.lootOpen).toBe(true);
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Bulk disenchant' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Ahri' })).toBeTruthy());
    expect(actions.loadLoot).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().ui.lootOpen).toBe(false);
  });

  it('does not render the in-client button in the overlay host', () => {
    makeLootRoot();
    const { portalTarget } = overlaySetup(null);
    expect(portalTarget.querySelector('.drk-dock--loot')).toBeNull();
  });
});
