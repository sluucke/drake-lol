import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { OverlayChrome } from '../../../src/app/overlays/streaming/OverlayChrome.jsx';
import { ClientDocks } from '../../../src/app/overlays/docks/ClientDocks.jsx';

const GEOMETRY = {
  client: { x: 0, y: 0, width: 1280, height: 720 },
  chrome: { x: 0, y: 0, width: 1280, height: 720 },
};

function setup({ host = 'overlay', champSelect = {}, panelOpen = false } = {}) {
  const store = createDrakeStore({ settings: { queue_dodge_in_client: true } });
  store.getState().setSession({ streaming: { host, effective: 'overlay' }, overlayGeometry: GEOMETRY });
  store.getState().patchChampSelect(champSelect);
  store.getState().setPanelOpen(panelOpen);
  const actions = { togglePanel: vi.fn(), cancelQueue: vi.fn(async () => {}), dodge: vi.fn(async () => ({ ok: true })) };
  const utils = renderWithProviders(
    <>
      <OverlayChrome />
      <ClientDocks />
    </>,
    { store, actions },
  );
  return { ...utils, store, actions };
}

describe('OverlayChrome', () => {
  it('renders nothing inside the client', () => {
    const { portalTarget } = setup({ host: 'client' });
    expect(within(portalTarget).queryByRole('button')).toBeNull();
  });

  it('shows the Drake button where the tray reserved it', () => {
    const { portalTarget, actions } = setup();
    const fab = within(portalTarget).getByRole('button', { name: 'Open Drake' });
    expect(fab.style.left).toBe(`${1280 - 14 - 52}px`);
    fireEvent.click(fab);
    expect(actions.togglePanel).toHaveBeenCalledTimes(1);
  });

  it('shows compact docks for ready check and champ select', () => {
    const { portalTarget, actions } = setup({ champSelect: { cancelable: true, active: true } });
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Cancel Queue' }));
    expect(actions.cancelQueue).toHaveBeenCalledTimes(1);
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Dodge' }));
    expect(actions.dodge).toHaveBeenCalledTimes(1);
    expect(within(portalTarget).getAllByRole('button', { name: 'Dodge' })).toHaveLength(1);
  });

  it('gets out of the way while the panel is open', async () => {
    const { portalTarget, store } = setup({ champSelect: { cancelable: true } });
    act(() => store.getState().setPanelOpen(true));
    await waitFor(() => expect(within(portalTarget).queryByRole('button')).toBeNull());
  });
});
