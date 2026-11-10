import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import type { SettingsValues } from '../../../src/settings';
import type { LegacyActions } from '../../../src/app/shell/LegacyActions';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore';
import { AutoAcceptScreen } from '../../../src/app/screens/AutoAccept';
import { isReactScreen } from '../../../src/app/screens/registry';

function makeActions(overrides: Partial<LegacyActions> = {}) {
  return {
    navigate: vi.fn<LegacyActions['navigate']>(),
    close: vi.fn<LegacyActions['close']>(),
    openUrl: vi.fn<LegacyActions['openUrl']>(),
    setSettings: vi.fn<LegacyActions['setSettings']>(async () => ({ ok: true })),
    saveStatus: vi.fn<LegacyActions['saveStatus']>(async () => ({ ok: true })),
    revealLobby: vi.fn<LegacyActions['revealLobby']>(async () => ({ ok: true, count: 3 })),
    dodge: vi.fn<LegacyActions['dodge']>(async () => ({ ok: true })),
    checkUpdates: vi.fn<LegacyActions['checkUpdates']>(async () => {}),
    installUpdate: vi.fn<LegacyActions['installUpdate']>(async () => ({ ok: true, installing: true, upToDate: false })),
    restartClient: vi.fn<LegacyActions['restartClient']>(async () => ({ ok: true })),
    ...overrides,
  };
}

function setup(settings: SettingsValues, locale?: string) {
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
    expect(screen.getByRole<HTMLInputElement>('slider', { name: 'Accept after' }).disabled).toBe(true);
  });

  it('disables everything while the tray is down', () => {
    const { store } = setup({ auto_accept: true });
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole<HTMLButtonElement>('checkbox').disabled).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('slider').disabled).toBe(true);
  });

  it('is translated', () => {
    setup({ auto_accept: true, auto_accept_delay_ms: 2500 }, 'pt_BR');
    expect(screen.getByRole('heading', { name: 'Aceite automático' })).toBeTruthy();
    expect(screen.getByText('2,5s')).toBeTruthy();
  });
});
