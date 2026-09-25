import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ClientDocks } from '../../../src/app/overlays/docks/ClientDocks.jsx';
import { ROSE_BUTTON_SELECTOR } from '../../../src/ui/dodgeDock.js';

afterEach(() => {
  document.querySelectorAll('.rose-custom-wheel-button').forEach((node) => node.remove());
});

function setup(champSelect = {}, settings = {}) {
  const store = createDrakeStore({ settings: { queue_dodge_in_client: true, ...settings } });
  store.getState().patchChampSelect(champSelect);
  const actions = { dodge: vi.fn(async () => ({ ok: true })), cancelQueue: vi.fn(async () => {}) };
  const utils = renderWithProviders(<ClientDocks />, { store, actions });
  return { ...utils, store, actions };
}

describe('ClientDocks', () => {
  it('renders nothing outside ready check and champ select', () => {
    const { portalTarget } = setup();
    expect(within(portalTarget).queryByRole('button')).toBeNull();
  });

  it('shows Cancel Queue during a cancelable ready check', () => {
    const { portalTarget, actions } = setup({ cancelable: true });
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Cancel Queue' }));
    expect(actions.cancelQueue).toHaveBeenCalledTimes(1);
  });

  it('shows Dodge in champ select and follows the dodge state', () => {
    const { portalTarget, actions, store } = setup({ active: true });
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Dodge' }));
    expect(actions.dodge).toHaveBeenCalledTimes(1);
    act(() => store.getState().patchChampSelect({ dodge: 'busy' }));
    const busy = within(portalTarget).getByRole('button', { name: 'Dodging…' });
    expect(busy.disabled).toBe(true);
    act(() => store.getState().patchChampSelect({ dodge: 'failed' }));
    expect(within(portalTarget).getByRole('button', { name: 'Failed' })).toBeTruthy();
  });

  it('hides Dodge when the in-client toggle is off', () => {
    const { portalTarget } = setup({ active: true }, { queue_dodge_in_client: false });
    expect(within(portalTarget).queryByRole('button', { name: 'Dodge' })).toBeNull();
  });

  it('hides everything while in game', async () => {
    const { portalTarget, store } = setup({ active: true, cancelable: true });
    act(() => store.getState().setSession({ idle: true }));
    await waitFor(() => expect(within(portalTarget).queryByRole('button')).toBeNull());
  });

  it('places the dodge dock above the anchor', () => {
    const anchor = document.createElement('div');
    anchor.className = ROSE_BUTTON_SELECTOR.slice(1);
    anchor.getBoundingClientRect = () => ({ left: 300, top: 500, width: 60, height: 30 });
    document.body.appendChild(anchor);
    const { portalTarget } = setup({ active: true });
    const dock = portalTarget.querySelector('.drk-dock--dodge');
    expect(dock.style.left).toBe('330px');
    expect(dock.style.transform).toBe('translateX(-50%)');
  });

  it('stays out of the client while the streaming overlay is active', () => {
    const { portalTarget, store } = setup({ active: true, cancelable: true });
    act(() => store.getState().setSession({ streaming: { host: 'client', effective: 'overlay' } }));
    return waitFor(() => expect(within(portalTarget).queryByRole('button')).toBeNull());
  });
});
