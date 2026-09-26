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

function setup({ host = 'overlay', champSelect = {}, panelOpen = false, positions, hintSeen = true } = {}) {
  const store = createDrakeStore({
    settings: { queue_dodge_in_client: true, overlay_positions: positions, overlay_hint_seen: hintSeen },
  });
  store.getState().setSession({ streaming: { host, effective: 'overlay' }, overlayGeometry: GEOMETRY });
  store.getState().patchChampSelect(champSelect);
  store.getState().setPanelOpen(panelOpen);
  const actions = {
    togglePanel: vi.fn(),
    cancelQueue: vi.fn(async () => {}),
    dodge: vi.fn(async () => ({ ok: true })),
    setSettings: vi.fn(async () => ({ ok: true })),
    setOverlayDragging: vi.fn(),
  };
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
    fireEvent.pointerDown(fab, { button: 0, pointerId: 1, screenX: 1220, screenY: 660 });
    fireEvent.pointerUp(fab, { button: 0, pointerId: 1, screenX: 1220, screenY: 660 });
    expect(actions.togglePanel).toHaveBeenCalledTimes(1);
    expect(actions.setSettings).not.toHaveBeenCalled();
  });

  it('shows compact docks for ready check and champ select', () => {
    const { portalTarget, actions } = setup({ champSelect: { cancelable: true, active: true } });
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Cancel Queue' }));
    expect(actions.cancelQueue).toHaveBeenCalledTimes(1);
    const dodge = within(portalTarget).getByRole('button', { name: 'Dodge' });
    fireEvent.pointerDown(dodge, { button: 0, pointerId: 2, screenX: 1150, screenY: 690 });
    fireEvent.pointerUp(dodge, { button: 0, pointerId: 2, screenX: 1150, screenY: 690 });
    expect(actions.dodge).toHaveBeenCalledTimes(1);
    expect(dodge.style.width).toBe('96px');
    expect(within(portalTarget).getAllByRole('button', { name: 'Dodge' })).toHaveLength(1);
  });

  it('gets out of the way while the panel is open', async () => {
    const { portalTarget, store } = setup({ champSelect: { cancelable: true } });
    act(() => store.getState().setPanelOpen(true));
    await waitFor(() => expect(within(portalTarget).queryByRole('button')).toBeNull());
  });

  it('lets the Drake button be dragged and saves where it landed', async () => {
    const { portalTarget, actions } = setup();
    const fab = within(portalTarget).getByRole('button', { name: 'Open Drake' });
    fireEvent.pointerDown(fab, { button: 0, pointerId: 1, screenX: 1220, screenY: 660 });
    expect(actions.setOverlayDragging).toHaveBeenLastCalledWith(true);
    fireEvent.pointerMove(fab, { pointerId: 1, screenX: 620, screenY: 360 });
    expect(fab.style.left).toBe(`${1280 - 14 - 52 - 600}px`);
    fireEvent.pointerUp(fab, { button: 0, pointerId: 1, screenX: 620, screenY: 360 });
    expect(actions.togglePanel).not.toHaveBeenCalled();
    await waitFor(() => expect(actions.setOverlayDragging).toHaveBeenLastCalledWith(false));
    expect(actions.setSettings).toHaveBeenCalledWith({
      overlay_positions: {
        fab: { x: Math.round(((1280 - 14 - 52 - 600) / 1280) * 10000), y: Math.round(((720 - 14 - 52 - 300) / 720) * 10000) },
        dodge: null,
      },
    });
  });

  it('lets go of the whole client when a drag loses its pointer capture', () => {
    const { portalTarget, actions } = setup();
    const fab = within(portalTarget).getByRole('button', { name: 'Open Drake' });
    fireEvent.pointerDown(fab, { button: 0, pointerId: 1, screenX: 1220, screenY: 660 });
    fireEvent.pointerMove(fab, { pointerId: 1, screenX: 620, screenY: 360 });
    expect(actions.setOverlayDragging).toHaveBeenLastCalledWith(true);
    fireEvent(fab, new Event('lostpointercapture', { bubbles: true }));
    expect(actions.setOverlayDragging).toHaveBeenLastCalledWith(false);
    expect(actions.setSettings).not.toHaveBeenCalled();
    expect(actions.togglePanel).not.toHaveBeenCalled();
  });

  it('draws a moved button at its saved spot', () => {
    const { portalTarget } = setup({ positions: { fab: { x: 5000, y: 5000 }, dodge: null } });
    const fab = within(portalTarget).getByRole('button', { name: 'Open Drake' });
    expect(fab.style.left).toBe('640px');
    expect(fab.style.top).toBe('360px');
  });

  it('shows new users that the buttons can be moved until they close it', () => {
    const { portalTarget, actions } = setup({ hintSeen: false });
    const hint = within(portalTarget).getByRole('note');
    expect(hint.textContent).toContain('drag');
    fireEvent.click(within(hint).getByRole('button', { name: 'Got it' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ overlay_hint_seen: true });
  });

  it('stops hinting once a button was dragged', async () => {
    const { portalTarget, actions } = setup({ hintSeen: false });
    const fab = within(portalTarget).getByRole('button', { name: 'Open Drake' });
    fireEvent.pointerDown(fab, { button: 0, pointerId: 1, screenX: 1220, screenY: 660 });
    fireEvent.pointerMove(fab, { pointerId: 1, screenX: 1100, screenY: 600 });
    fireEvent.pointerUp(fab, { button: 0, pointerId: 1, screenX: 1100, screenY: 600 });
    await waitFor(() => expect(actions.setSettings).toHaveBeenCalledWith({ overlay_hint_seen: true }));
  });

  it('retires the hint on its own after a while', () => {
    vi.useFakeTimers();
    try {
      const { actions } = setup({ hintSeen: false });
      act(() => vi.advanceTimersByTime(12000));
      expect(actions.setSettings).toHaveBeenCalledWith({ overlay_hint_seen: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never hints users who already saw it', () => {
    const { portalTarget } = setup({ hintSeen: true });
    expect(within(portalTarget).queryByRole('note')).toBeNull();
  });
});

