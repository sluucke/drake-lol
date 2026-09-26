import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { QueueScreen } from '../../../src/app/screens/Queue.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';

function makeActions(overrides = {}) {
  return {
    navigate: vi.fn(),
    close: vi.fn(),
    openUrl: vi.fn(),
    setSettings: vi.fn(async () => ({ ok: true })),
    saveStatus: vi.fn(async () => ({ ok: true })),
    revealLobby: vi.fn(async () => ({ ok: true, count: 3 })),
    dodge: vi.fn(async () => ({ ok: true })),
    checkUpdates: vi.fn(async () => {}),
    installUpdate: vi.fn(async () => ({ ok: true, installing: true })),
    restartClient: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function setup({ settings = {}, locale, actions = makeActions() } = {}) {
  const store = createDrakeStore({ settings });
  if (locale) store.getState().setLocale(locale);
  const utils = renderWithProviders(<QueueScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('QueueScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('queue')).toBe(true);
  });

  it('reveals the lobby with the chosen provider', async () => {
    const { actions, store } = setup();
    expect(screen.getByRole('radio', { name: 'Porofessor' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'OP.GG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Lobby' }));
    expect(actions.revealLobby).toHaveBeenCalledWith('opgg');
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Looking up 3 summoners', tone: 'good' }),
    );
  });

  it('reports reveal failures as given', async () => {
    const actions = makeActions({
      revealLobby: vi.fn(async () => ({ ok: false, reason: 'you have to be in champ select to reveal a lobby' })),
    });
    const { store } = setup({ actions });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Lobby' }));
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({
        text: 'you have to be in champ select to reveal a lobby',
        tone: 'bad',
      }),
    );
  });

  it('gates the reveal options behind the in-client toggle', () => {
    const { actions } = setup();
    expect(screen.getByRole('button', { name: 'Sample size' }).disabled).toBe(true);
    expect(screen.getByText('Enable in-client reveal to change these.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reveal my team in-client' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ queue_team_reveal_in_client: true });
  });

  it('saves reveal options with the right types', () => {
    const { actions, portalTarget } = setup({ settings: { queue_team_reveal_in_client: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Sample size' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: '100' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ queue_team_reveal_sample_size: 100 });
    fireEvent.click(screen.getByRole('button', { name: 'Recent pool' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Any queue' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ queue_team_reveal_recent_pool: 'any' });
    fireEvent.click(screen.getByRole('button', { name: 'Fetch at once' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: '3' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ queue_team_reveal_fetch_concurrency: 3 });
  });

  it('shows the pool, concurrency and timing hints', () => {
    const { store } = setup({
      settings: { queue_team_reveal_in_client: true, queue_team_reveal_fetch_concurrency: 3 },
    });
    expect(screen.getByText('Current queue can look sparse if that player rarely plays this queue.')).toBeTruthy();
    expect(screen.getByText('Higher concurrency loads the client harder and can hit rate limits.')).toBeTruthy();
    act(() => {
      store.getState().syncLegacy({
        settings: { queue_team_reveal_in_client: true, queue_team_reveal_fetch_concurrency: 1 },
        revealTiming: { lastMs: 12000, lastConcurrency: 1 },
      });
    });
    expect(screen.getByText('About ~12s for a full lobby at this setting.')).toBeTruthy();
    expect(screen.getByText('Based on your last reveal, we suggest resolving 2 players at a time.')).toBeTruthy();
  });

  it('keeps the dodge and map side toggles on by default', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Show dodge button in champ select' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Show map side in champ select' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Auto-mute teammates in champ select' }).getAttribute('aria-checked')).toBe('false');
  });

  it('dodges and shows the outcome', async () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dodge' }));
    expect(actions.dodge).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Dodged!' })).toBeTruthy();
  });

  it('saves the auto message when it changes', () => {
    const { actions } = setup({ settings: { queue_auto_message: 'gl' } });
    const input = screen.getByRole('textbox', { name: 'Auto-send message on chat connect' });
    expect(input.value).toBe('gl');
    input.focus();
    fireEvent.blur(input);
    expect(actions.setSettings).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'gl hf' } });
    fireEvent.blur(input);
    expect(actions.setSettings).toHaveBeenCalledWith({ queue_auto_message: 'gl hf' });
  });

  it('disables settings but not actions while the tray is down', () => {
    const { store } = setup();
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole('checkbox', { name: 'Reveal my team in-client' }).disabled).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Auto-send message on chat connect' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Reveal Lobby' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Dodge' }).disabled).toBe(false);
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Fila' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revelar lobby' })).toBeTruthy();
  });
});
