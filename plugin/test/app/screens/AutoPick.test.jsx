import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { AutoPickScreen } from '../../../src/app/screens/AutoPick.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';

const CHAMPIONS = [
  { id: 103, name: 'Ahri', alias: 'Ahri' },
  { id: 55, name: 'Katarina', alias: 'Katarina' },
  { id: 64, name: 'Lee Sin', alias: 'LeeSin' },
  { id: 157, name: 'Yasuo', alias: 'Yasuo' },
];

const EMPTY = { TOP: [], JUNGLE: [], MIDDLE: [], BOTTOM: [], UTILITY: [] };

function setup({ settings, champions = CHAMPIONS, locale } = {}) {
  const store = createDrakeStore({ settings });
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ champions });
  const actions = { setSettings: vi.fn(async () => ({ ok: true })) };
  const utils = renderWithProviders(<AutoPickScreen />, { store, actions });
  return { ...utils, store, actions };
}

const BASE = { auto_pick: true, auto_pick_by_role: { TOP: [103, 64] } };

describe('AutoPickScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('auto-pick')).toBe(true);
  });

  it('binds the toggles and gates insta lock', () => {
    const { actions } = setup({ settings: { auto_pick: false } });
    expect(screen.getByRole('switch', { name: 'Insta Lock' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Pick a champion automatically' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_pick: true });
  });

  it('summarizes the picks of the active role', () => {
    setup({ settings: BASE });
    expect(screen.getByRole('tab', { name: /Top/ }).textContent).toContain('2');
    expect(screen.getByText('2 selected')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ahri'),
      expect.stringContaining('Lee Sin'),
    ]);
    expect(screen.getByRole('button', { name: 'Ahri' }).querySelector('.drk-champ__slot').textContent).toBe('1');
  });

  it('replaces the backup when a third champion is picked', () => {
    const { actions } = setup({ settings: BASE });
    fireEvent.click(screen.getByRole('button', { name: 'Yasuo' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_pick_by_role: { ...EMPTY, TOP: [103, 157] } });
  });

  it('removes a pick from the summary', () => {
    const { actions } = setup({ settings: BASE });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ahri' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_pick_by_role: { ...EMPTY, TOP: [64] } });
  });

  it('switches roles and picks for the new role', () => {
    const { actions, store } = setup({ settings: BASE });
    fireEvent.click(screen.getByRole('tab', { name: /Mid/ }));
    expect(store.getState().ui.autoPickRole).toBe('MIDDLE');
    expect(screen.getByText('Click up to 2 champions for this role — first is your pick, second is the backup.')).toBeTruthy();
    expect(screen.getByText('none chosen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yasuo' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_pick_by_role: { ...EMPTY, TOP: [103, 64], MIDDLE: [157] } });
  });

  it('filters by search and keeps the query in the store', () => {
    const { store } = setup({ settings: BASE });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'yas' } });
    expect(screen.getByRole('button', { name: 'Yasuo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Katarina' })).toBeNull();
    expect(store.getState().ui.championQueries['auto-pick']).toBe('yas');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No champions match.')).toBeTruthy();
  });

  it('explains an unavailable champion list', () => {
    setup({ settings: BASE, champions: [] });
    expect(screen.getByText('Champion list unavailable — reopen this screen to try again.')).toBeTruthy();
  });

  it('never disables the picker while the tray is down', () => {
    const { store } = setup({ settings: BASE });
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole('switch', { name: 'Pick a champion automatically' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Yasuo' }).disabled).toBe(false);
  });

  it('is translated', () => {
    setup({ settings: BASE, locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Pick automático' })).toBeTruthy();
    expect(screen.getByText('2 selecionados')).toBeTruthy();
  });
});
