import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { BuildTab } from '../../../src/app/overlays/build/BuildTab.jsx';
import { pct, rankIconKey, statusKey, wrTone } from '../../../src/app/overlays/build/format.jsx';

const BUILD = {
  hasData: true,
  patch: '14.1',
  stats: { winRate: 51.2, pickRate: 8.4, banRate: 3.1, kda: 2.61, play: 12345 },
  spells: [],
  items: { starter: [], boots: [], core: [], last: [] },
  runePages: [],
  skills: { masteries: [], order: [] },
  counters: { strong: [], weak: [] },
};

function makeActions() {
  return {
    loadBuild: vi.fn(async () => {}),
    setBuildTier: vi.fn(),
    setBuildRegion: vi.fn(),
    retryBuild: vi.fn(async () => {}),
    showAllRanks: vi.fn(),
    clearPlayerBuild: vi.fn(),
  };
}

function setup(build = {}, locale) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  store.getState().setBuild({
    ...store.getState().build,
    championId: 157,
    championName: 'Yasuo',
    position: 'MIDDLE',
    patch: '14.1',
    build: BUILD,
    ...build,
  });
  const actions = makeActions();
  const utils = renderWithProviders(<BuildTab body={<p>body</p>} />, { store, actions });
  return { ...utils, store, actions };
}

describe('build format', () => {
  it('formats percentages, tones, rank icons and statuses', () => {
    expect(pct(null)).toBe('—');
    expect(pct(21)).toBe('21%');
    expect(pct(55.24)).toBe('55.2%');
    expect(wrTone(50)).toBe('positive');
    expect(wrTone(49.9)).toBe('negative');
    expect(wrTone(null)).toBe('');
    expect(rankIconKey('emerald_plus')).toBe('EMERALD');
    expect(rankIconKey('ibsg')).toBe('UNRANKED');
    expect(statusKey('applying', 'x')).toBe('overlays.build.actions.applying');
    expect(statusKey('idle', 'x')).toBe('x');
  });
});

describe('BuildTab', () => {
  it('renders the header and body', () => {
    setup();
    expect(screen.getByText('Yasuo')).toBeTruthy();
    expect(screen.getByText('Patch 14.1')).toBeTruthy();
    expect(screen.getByText('Ranked')).toBeTruthy();
    expect(screen.getByText('51.2%')).toBeTruthy();
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('changes rank and region', () => {
    const { actions, portalTarget } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Rank' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Master' }));
    expect(actions.setBuildTier).toHaveBeenCalledWith('master');
    fireEvent.click(screen.getByRole('button', { name: 'Region' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'BR' }));
    expect(actions.setBuildRegion).toHaveBeenCalledWith('br');
  });

  it('shows each placeholder state', () => {
    const { store, actions } = setup({ championId: 0, build: null });
    expect(screen.getByText('Pick a champion to see build recommendations')).toBeTruthy();
    act(() => store.getState().setBuild({ ...store.getState().build, championId: 157, loading: true }));
    expect(screen.getByText('Loading build data…')).toBeTruthy();
    act(() =>
      store.getState().setBuild({ ...store.getState().build, loading: false, error: 'Could not reach OP.GG' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(actions.retryBuild).toHaveBeenCalledTimes(1);
    act(() =>
      store.getState().setBuild({ ...store.getState().build, error: '', build: { ...BUILD, hasData: false } }),
    );
    expect(screen.getByText('No data for Emerald+')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See All Ranks' }));
    expect(actions.showAllRanks).toHaveBeenCalledTimes(1);
  });

  it('shows the player banner and restores', () => {
    const { actions } = setup({ viewingPlayer: 'Hide on bush#KR1' });
    expect(screen.getByText('Hide on bush#KR1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '✕ Restore core build' }));
    expect(actions.clearPlayerBuild).toHaveBeenCalledTimes(1);
  });

  it('reloads when the champion changes', () => {
    const { store, actions } = setup();
    expect(actions.loadBuild).not.toHaveBeenCalled();
    act(() => store.getState().setBuild({ ...store.getState().build, championId: 103 }));
    expect(actions.loadBuild).toHaveBeenCalledTimes(1);
  });

  it('is translated', () => {
    setup({ error: 'Could not reach OP.GG' }, 'pt_BR');
    expect(screen.getByText('Não foi possível acessar o OP.GG')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
  });
});
