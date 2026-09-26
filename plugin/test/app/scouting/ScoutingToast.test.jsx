import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ScoutingToast } from '../../../src/app/overlays/scouting/ScoutingToast.jsx';
import { STATUS_READY_MS } from '../../../src/ui/teamRevealDom.js';

afterEach(() => {
  vi.useRealTimers();
});

function setup(view) {
  const store = createDrakeStore();
  store.getState().setTeamReveal({ enabled: true, ...view });
  const actions = { openScouting: vi.fn() };
  const utils = renderWithProviders(<ScoutingToast />, { store, actions });
  return { ...utils, store, actions };
}

describe('ScoutingToast', () => {
  it('shows progress while revealing', () => {
    const { portalTarget } = setup({ statusPhase: 'loading', statusSeq: 1 });
    const toast = within(portalTarget).getByRole('status');
    expect(toast.textContent).toContain('Revealing lobby');
    expect(within(toast).queryByRole('button', { name: 'View' })).toBeNull();
  });

  it('announces the reveal with the side and opens the modal', () => {
    const { portalTarget, actions } = setup({ statusPhase: 'ready', statusSeq: 2, side: { side: 'RED', color: 'red' } });
    const toast = within(portalTarget).getByRole('status');
    expect(toast.textContent).toContain('Session revealed · Red Side · Press Ctrl+Shift+D to view it.');
    fireEvent.click(within(toast).getByRole('button', { name: 'View' }));
    expect(actions.openScouting).toHaveBeenCalledTimes(1);
  });

  it('hides while the modal is open or disabled', () => {
    const { portalTarget, store } = setup({ statusPhase: 'ready', statusSeq: 2, open: true });
    expect(within(portalTarget).queryByRole('status')).toBeNull();
    act(() => store.getState().setTeamReveal({ open: false, enabled: false }));
    expect(within(portalTarget).queryByRole('status')).toBeNull();
  });

  it('auto-dismisses the ready toast and reappears on the next status', async () => {
    vi.useFakeTimers();
    const { portalTarget, store } = setup({ statusPhase: 'ready', statusSeq: 3 });
    expect(within(portalTarget).getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(STATUS_READY_MS + 10));
    vi.useRealTimers();
    await waitFor(() => expect(within(portalTarget).queryByRole('status')).toBeNull());
    act(() => store.getState().setTeamReveal({ statusSeq: 4 }));
    expect(within(portalTarget).getByRole('status')).toBeTruthy();
  });
});
