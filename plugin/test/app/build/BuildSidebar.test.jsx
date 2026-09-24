import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { MatchupsCard, TopPlayersCard } from '../../../src/app/overlays/build/BuildSidebar.jsx';
import { BuildTab } from '../../../src/app/overlays/build/BuildTab.jsx';

const BUILD = {
  hasData: true,
  stats: null,
  spells: [],
  items: { starter: [], boots: [], core: [], last: [] },
  runePages: [],
  skills: { masteries: [], order: [] },
  counters: {
    strong: [{ championId: 82, winRate: 57.5, play: 163 }],
    weak: [{ championId: 360, winRate: 44.2, play: 120 }],
  },
};

const PLAYERS = [
  { ranking: 1, name: 'Hide on bush#KR1', region: 'KR', tier: 'Challenger 1 (1543 LP)', winRate: 61.2, played: 210 },
  { ranking: 2, name: 'Other#EUW', region: '', tier: 'Grandmaster', winRate: 48, played: 99 },
];

function setup(ui, state = {}) {
  const store = createDrakeStore();
  store.getState().setBuild({
    ...store.getState().build,
    championId: 157,
    championName: 'Yasuo',
    build: BUILD,
    championNames: { 82: 'Mordekaiser' },
    topPlayers: { loading: false, ok: true, players: PLAYERS, reason: '' },
    ...state,
  });
  const actions = { viewPlayerBuild: vi.fn(async () => {}), loadBuild: vi.fn(async () => {}) };
  const utils = renderWithProviders(ui, { store, actions });
  return { ...utils, store, actions };
}

describe('TopPlayersCard', () => {
  it('lists players and opens their build', () => {
    const { actions, container } = setup(<TopPlayersCard />, { viewingPlayer: 'Hide on bush#KR1' });
    const rows = container.querySelectorAll('.drk-toplist__row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('#1');
    expect(rows[0].textContent).toContain('61.2%');
    expect(rows[0].className).toContain('is-active');
    expect(rows[0].getAttribute('title')).toBe('Challenger 1 (1543 LP) · 210 games');
    fireEvent.click(screen.getByRole('button', { name: /Other#EUW/ }));
    expect(actions.viewPlayerBuild).toHaveBeenCalledWith('Other#EUW', 'kr');
  });

  it('shows loading and reasons', () => {
    const { rerender } = setup(<TopPlayersCard />, { topPlayers: { loading: true, ok: false, players: [], reason: '' } });
    expect(screen.getByText('Loading players…')).toBeTruthy();
    setup(<TopPlayersCard />, { topPlayers: { loading: false, ok: false, players: [], reason: 'No ranking data available' } });
    expect(screen.getByText('No ranking data available')).toBeTruthy();
    expect(rerender).toBeTypeOf('function');
  });
});

describe('MatchupsCard', () => {
  it('lists strong and weak matchups', () => {
    const { container } = setup(<MatchupsCard />);
    expect(screen.getByText('Strong Against')).toBeTruthy();
    expect(screen.getByText('Mordekaiser')).toBeTruthy();
    expect(screen.getByText('Champion 360')).toBeTruthy();
    expect(container.textContent).toContain('57.5%');
    expect(container.textContent).toContain('163');
  });

  it('is hidden in ARAM', () => {
    const { container } = setup(<MatchupsCard />, { mode: 'aram' });
    expect(container.textContent).toBe('');
  });
});

describe('BuildTab assembly', () => {
  it('renders the sidebar next to the main cards', () => {
    const { container } = setup(<BuildTab />);
    const sidebar = container.querySelector('.drk-build-sidebar');
    const main = container.querySelector('.drk-build-main');
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();
    expect(sidebar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sidebar.textContent).toContain('Top Players (OP.GG)');
  });
});
