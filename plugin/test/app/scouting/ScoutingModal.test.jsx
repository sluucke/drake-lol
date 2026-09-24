import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ScoutingModal } from '../../../src/app/overlays/scouting/ScoutingModal.jsx';

const ROWS = [
  { cellId: 0, riotId: 'Ally#ONE', matchesPending: false, recentGames: [] },
  { cellId: 1, riotId: 'Me#TAG', isLocalPlayer: true, matchesPending: false, recentGames: [] },
];

function makeActions() {
  return {
    closeScouting: vi.fn(),
    setScoutingTab: vi.fn(),
    muteScouting: vi.fn(async () => {}),
    renderBuildHtml: vi.fn(() => '<div class="build-panel"><button data-build-retry="1">Retry</button></div>'),
    wireBuildSelects: vi.fn(),
    buildChange: vi.fn(),
    buildClick: vi.fn(() => true),
  };
}

function setup(view = {}, locale) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  store.getState().setTeamReveal({ enabled: true, open: true, rows: ROWS, ...view });
  const actions = makeActions();
  const utils = renderWithProviders(<ScoutingModal />, { store, actions });
  return { ...utils, store, actions };
}

describe('ScoutingModal', () => {
  it('renders the cards in a labelled dialog', () => {
    const { portalTarget } = setup({ side: { side: 'BLUE', color: 'blue' } });
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Team Scouting' });
    expect(dialog.querySelectorAll('.drk-scout-card')).toHaveLength(2);
    expect(within(dialog).getByText('Blue Side').className).toContain('is-blue');
    expect(within(dialog).getByRole('tab', { name: 'Team Scouting' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows the empty state', () => {
    const { portalTarget } = setup({ rows: [] });
    expect(within(portalTarget).getByText('No team scouting data available')).toBeTruthy();
  });

  it('switches tabs through the legacy module', () => {
    const { portalTarget, actions } = setup();
    fireEvent.click(within(portalTarget).getByRole('tab', { name: 'Build' }));
    expect(actions.setScoutingTab).toHaveBeenCalledWith('build');
  });

  it('mutes and reflects the mute state', () => {
    const { portalTarget, actions, store } = setup();
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Mute All' }));
    expect(actions.muteScouting).toHaveBeenCalledTimes(1);
    act(() => store.getState().setTeamReveal({ muteStatus: 'muting' }));
    expect(within(portalTarget).getByRole('button', { name: 'Muting…' }).disabled).toBe(true);
    act(() => store.getState().setTeamReveal({ muteStatus: 'muted' }));
    expect(within(portalTarget).getByRole('button', { name: '✓ Muted' })).toBeTruthy();
  });

  it('closes through the legacy module', () => {
    const { portalTarget, actions } = setup();
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Close' }));
    expect(actions.closeScouting).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.closeScouting).toHaveBeenCalledTimes(2);
  });

  it('bridges the legacy build tab', async () => {
    const { portalTarget, actions, store } = setup({ activeTab: 'build', buildSig: 'a' });
    const legacy = portalTarget.querySelector('.drk-scout__legacy');
    expect(legacy.className).toContain('team-reveal-shell');
    expect(within(legacy).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(actions.wireBuildSelects).toHaveBeenCalledWith(legacy);
    fireEvent.click(within(legacy).getByRole('button', { name: 'Retry' }));
    expect(actions.buildClick).toHaveBeenCalledTimes(1);
    act(() => store.getState().setTeamReveal({ buildSig: 'b' }));
    expect(actions.renderBuildHtml).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Mute All')).toBeNull();
  });

  it('is translated', () => {
    const { portalTarget } = setup({}, 'pt_BR');
    expect(within(portalTarget).getByRole('dialog', { name: 'Scouting do time' })).toBeTruthy();
    expect(within(portalTarget).getByRole('button', { name: 'Silenciar todos' })).toBeTruthy();
  });

  it('renders nothing while closed', async () => {
    const { portalTarget, store } = setup();
    act(() => store.getState().setTeamReveal({ open: false }));
    await waitFor(() => expect(within(portalTarget).queryByRole('dialog')).toBeNull());
  });
});
