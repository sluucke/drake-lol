import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { AutoAcceptScreen } from '../../../src/app/screens/AutoAccept.jsx';
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

function setup(settings, locale) {
  const store = createDrakeStore({ settings });
  if (locale) store.getState().setLocale(locale);
  const actions = makeActions();
  const utils = renderWithProviders(<AutoAcceptScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('AutoAcceptScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('auto-accept')).toBe(true);
  });

  it('toggles auto accept', () => {
    const { actions } = setup({ auto_accept: true, auto_accept_delay_ms: 2500 });
    expect(screen.getByRole('heading', { name: 'Auto Accept' })).toBeTruthy();
    const sw = screen.getByRole('checkbox', { name: 'Accept ready checks automatically' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_accept: false });
  });

  it('previews the delay while dragging and saves on release', () => {
    const { actions } = setup({ auto_accept: true, auto_accept_delay_ms: 2500 });
    const slider = screen.getByRole('slider', { name: 'Accept after' });
    expect(screen.getByText('2.5s')).toBeTruthy();
    fireEvent.change(slider, { target: { value: '4000' } });
    expect(screen.getByText('4.0s')).toBeTruthy();
    expect(actions.setSettings).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_accept_delay_ms: 4000 });
  });

  it('does not save an unchanged delay', () => {
    const { actions } = setup({ auto_accept: true, auto_accept_delay_ms: 2500 });
    fireEvent.pointerUp(screen.getByRole('slider', { name: 'Accept after' }));
    expect(actions.setSettings).not.toHaveBeenCalled();
  });

  it('shows Instant for zero and disables the delay when off', () => {
    setup({ auto_accept: false });
    expect(screen.getByText('Instant')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Accept after' }).disabled).toBe(true);
  });

  it('disables everything while the tray is down', () => {
    const { store } = setup({ auto_accept: true });
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole('checkbox').disabled).toBe(true);
    expect(screen.getByRole('slider').disabled).toBe(true);
  });

  it('is translated', () => {
    setup({ auto_accept: true, auto_accept_delay_ms: 2500 }, 'pt_BR');
    expect(screen.getByRole('heading', { name: 'Aceite automático' })).toBeTruthy();
    expect(screen.getByText('2,5s')).toBeTruthy();
  });
});
