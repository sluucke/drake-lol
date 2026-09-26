import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { AutoBanScreen } from '../../../src/app/screens/AutoBan.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';

const CHAMPIONS = [
  { id: 103, name: 'Ahri', alias: 'Ahri' },
  { id: 55, name: 'Katarina', alias: 'Katarina' },
  { id: 64, name: 'Lee Sin', alias: 'LeeSin' },
  { id: 157, name: 'Yasuo', alias: 'Yasuo' },
];

function setup({ settings, locale } = {}) {
  const store = createDrakeStore({ settings });
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ champions: CHAMPIONS });
  const actions = { setSettings: vi.fn(async () => ({ ok: true })) };
  const utils = renderWithProviders(<AutoBanScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('AutoBanScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('auto-ban')).toBe(true);
  });

  it('toggles auto ban', () => {
    const { actions } = setup({ settings: { auto_ban: false } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ban a champion automatically' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_ban: true });
  });

  it('shows the banned champion and clears it', () => {
    const { actions } = setup({ settings: { auto_ban: true, auto_ban_champion_id: 55 } });
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Katarina' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Katarina' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_ban_champion_id: 0 });
  });

  it('toggles the ban from the grid', () => {
    const { actions } = setup({ settings: { auto_ban: true, auto_ban_champion_id: 55 } });
    fireEvent.click(screen.getByRole('button', { name: 'Katarina' }));
    expect(actions.setSettings).toHaveBeenLastCalledWith({ auto_ban_champion_id: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Ahri' }));
    expect(actions.setSettings).toHaveBeenLastCalledWith({ auto_ban_champion_id: 103 });
  });

  it('explains how to pick when nothing is banned', () => {
    setup({ settings: { auto_ban: true } });
    expect(screen.getByText('none chosen')).toBeTruthy();
    expect(screen.getByText('Click a champion to ban — click again or ✕ to clear.')).toBeTruthy();
  });

  it('keeps its own search query', () => {
    const { store } = setup({ settings: {} });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kat' } });
    expect(store.getState().ui.championQueries['auto-ban']).toBe('kat');
    expect(store.getState().ui.championQueries['auto-pick']).toBe('');
    expect(screen.queryByRole('button', { name: 'Ahri' })).toBeNull();
  });

  it('is translated', () => {
    setup({ settings: {}, locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Ban automático' })).toBeTruthy();
  });
});
