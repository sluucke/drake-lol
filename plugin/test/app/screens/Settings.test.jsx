import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { SettingsScreen } from '../../../src/app/screens/Settings.jsx';
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

function setup({ settings = {}, updateUi, locale, actions = makeActions() } = {}) {
  const store = createDrakeStore({ settings, appVersion: '0.3.25' });
  if (locale) store.getState().setLocale(locale);
  if (updateUi) store.getState().syncLegacy({ updateUi });
  const utils = renderWithProviders(<SettingsScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('SettingsScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('settings')).toBe(true);
  });

  it('binds the four toggles with their defaults', () => {
    const { actions } = setup();
    expect(screen.getByRole('checkbox', { name: 'Start Drake with Windows' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Reload the client when Drake starts' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Install updates automatically' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Unlock the status message field' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start Drake with Windows' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ run_at_startup: true });
  });

  it('shows the version and checks for updates', () => {
    const { actions } = setup();
    expect(screen.getByText('v0.3.25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(actions.checkUpdates).toHaveBeenCalledTimes(1);
  });

  it('shows the checking state', () => {
    setup({ updateUi: { phase: 'checking' } });
    expect(screen.getByRole('button', { name: 'Checking…' }).disabled).toBe(true);
  });

  it('describes each update phase', () => {
    const { store } = setup({ updateUi: { phase: 'current' } });
    expect(screen.getByText('Drake is up to date.')).toBeTruthy();
    act(() => store.getState().syncLegacy({ updateUi: { phase: 'no_installer', version: 'v0.4.0' } }));
    expect(screen.getByText('v0.4.0 is on GitHub but has no Windows installer yet.')).toBeTruthy();
    act(() => store.getState().syncLegacy({ updateUi: { phase: 'error', message: 'could not check for updates (500)' } }));
    expect(screen.getByText('could not check for updates (500)')).toBeTruthy();
    act(() => store.getState().syncLegacy({ updateUi: { phase: 'error' } }));
    expect(screen.getByText('Could not check for updates.')).toBeTruthy();
  });

  it('installs an available update and keeps the button disabled', async () => {
    const { store, actions } = setup({ updateUi: { phase: 'available', version: 'v0.4.0' } });
    expect(screen.getByText('v0.4.0 is available.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install now' }));
    expect(actions.installUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Installing update…', tone: 'good' }),
    );
    expect(screen.getByRole('button', { name: 'Install now' }).disabled).toBe(true);
  });

  it('re-enables install and reports a failure', async () => {
    const actions = makeActions({ installUpdate: vi.fn(async () => ({ ok: false, reason: 'could not install the update (500)' })) });
    const { store } = setup({ updateUi: { phase: 'available', version: 'v0.4.0' }, actions });
    fireEvent.click(screen.getByRole('button', { name: 'Install now' }));
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'could not install the update (500)', tone: 'bad' }),
    );
    expect(screen.getByRole('button', { name: 'Install now' }).disabled).toBe(false);
  });

  it('restarts the client', async () => {
    const { store, actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Restart client' }));
    expect(actions.restartClient).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Restarting the client…', tone: 'good' }),
    );
  });

  it('disables settings and update checks while the tray is down', () => {
    const { store } = setup();
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole('checkbox', { name: 'Start Drake with Windows' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Check for updates' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Restart client' }).disabled).toBe(false);
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reiniciar cliente' })).toBeTruthy();
  });

  it('offers the client language by default and saves an override', () => {
    const { actions, portalTarget } = setup();
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger.textContent).toContain('Client language (English)');
    fireEvent.click(trigger);
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Português (Brasil)' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ ui_language: 'pt_BR' });
  });

  it('follows the client language while the preference is auto', () => {
    setup({ locale: 'pt_BR', settings: { ui_language: 'auto' } });
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Idioma' }).textContent).toContain('Idioma do cliente (Português (Brasil))');
  });

  it('gives the saved language priority over the client language', () => {
    const { store } = setup({ locale: 'pt_BR', settings: { ui_language: 'en_US' } });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    act(() => store.getState().syncLegacy({ settings: { ui_language: 'auto' } }));
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeTruthy();
  });

  it('saves the streaming mode', () => {
    const { actions, portalTarget } = setup();
    const trigger = screen.getByRole('button', { name: 'Streaming mode' });
    expect(trigger.textContent).toContain('Off');
    fireEvent.click(trigger);
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Auto (when a streaming app is open)' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ streaming_mode: 'auto' });
  });

  it('resets the overlay button positions', () => {
    const { actions } = setup({ settings: { overlay_positions: { fab: { x: 1, y: 2 }, dodge: null } } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset overlay button positions' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ overlay_positions: { fab: null, dodge: null } });
  });

  it('disables the reset while nothing was moved', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Reset overlay button positions' }).disabled).toBe(true);
  });
});

