import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ScoutCard } from '../../../src/app/overlays/scouting/ScoutCard.jsx';
import { formatRank, winRate } from '../../../src/app/overlays/scouting/format.js';
import { createTranslator } from '../../../src/app/i18n/runtime.js';
import { DICTS } from '../../../src/app/i18n/locales/index.js';

const ROW = {
  cellId: 1,
  riotId: 'Me#TAG',
  isLocalPlayer: true,
  assignedPosition: 'MIDDLE',
  matchesPending: false,
  soloRank: { tier: 'GOLD', division: 'II', lp: 45, hasRank: true },
  flexRank: { tier: 'MASTER', division: 'I', lp: 0, hasRank: true },
  wins: 8,
  losses: 2,
  winRate: 80,
  matchesUsed: 10,
  kda: 3.25,
  last12hWins: 2,
  last12hLosses: 1,
  pickedChampionId: 103,
  pickedChampionName: 'Ahri',
  pickedGames: 12,
  pickedWinRate: 58,
  seasonMostPlayedChampionId: 157,
  seasonMostPlayedChampionName: 'Yasuo',
  seasonMostPlayedCount: 30,
  seasonMostPlayedWins: 18,
  seasonMostPlayedLosses: 12,
  seasonMostPlayedWinRate: 60,
  recentGames: [
    { championId: 157, championName: 'Yasuo', win: true, kills: 8, deaths: 2, assists: 4 },
    { championId: 103, championName: 'Ahri', win: false, kills: 1, deaths: 6, assists: 3 },
  ],
};

function render(row, locale) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  return renderWithProviders(<ScoutCard row={row} index={0} />, { store });
}

describe('scouting format', () => {
  const t = createTranslator('en_US', DICTS);
  it('formats ranks', () => {
    expect(formatRank(ROW.soloRank, t)).toBe('Gold II · 45 LP');
    expect(formatRank(ROW.flexRank, t)).toBe('Master');
    expect(formatRank({ hasRank: false }, t)).toBe('Unranked');
    expect(formatRank({ tier: 'NONE', hasRank: true }, t)).toBe('Unranked');
  });

  it('computes win rates', () => {
    expect(winRate(3, 1, undefined)).toBe(75);
    expect(winRate(3, 1, 70)).toBe(70);
    expect(winRate(0, 0)).toBe(0);
  });
});

describe('ScoutCard', () => {
  it('renders the player summary', () => {
    const { container } = render(ROW);
    const card = container.querySelector('.drk-scout-card');
    expect(card.className).toContain('is-you');
    expect(screen.getByRole('heading').textContent).toContain('Me#TAG');
    expect(screen.getByRole('heading').textContent).toContain('(You)');
    expect(screen.getByText('Gold II · 45 LP')).toBeTruthy();
    expect(screen.getByText('Recent W/L · last 10 games')).toBeTruthy();
    expect(card.querySelector('.drk-wl .is-win').textContent).toBe('8W');
    expect(card.querySelector('.drk-wl .is-loss').textContent).toBe('2L');
    expect(card.textContent).toContain('80%');
    expect(screen.getByText('3.25')).toBeTruthy();
    expect(screen.getByText('2W/1L')).toBeTruthy();
    expect(screen.getByText('Ahri · 12g · 58%')).toBeTruthy();
    expect(screen.getByText('Yasuo · 30g · 18W/12L · 60%')).toBeTruthy();
    const games = card.querySelectorAll('.drk-scout-game');
    expect(games).toHaveLength(2);
    expect(games[0].className).toContain('is-win');
    expect(games[1].className).toContain('is-loss');
    expect(games[0].textContent).toBe('8/2/4');
  });

  it('shows skeletons while matches load', () => {
    const { container } = render({ ...ROW, matchesPending: true });
    expect(container.querySelector('.drk-scout-card').className).toContain('is-loading');
    expect(container.querySelectorAll('.drk-skel').length).toBeGreaterThan(3);
    expect(container.querySelector('.drk-wl')).toBeNull();
  });

  it('handles unknown players and missing data', () => {
    const { container } = render({
      ...ROW,
      riotId: '',
      isLocalPlayer: false,
      pickedChampionId: 0,
      seasonMostPlayedChampionId: 0,
      recentGames: [],
      pickedGames: 0,
    });
    expect(screen.getByRole('heading').textContent).toBe('Unknown');
    expect(screen.queryByText('Picked')).toBeNull();
    expect(container.querySelectorAll('.drk-scout-card__row-value')[4].textContent).toBe('—');
  });

  it('shows no games for an unplayed pick', () => {
    render({ ...ROW, pickedGames: 0 });
    expect(screen.getByText('Ahri · no games')).toBeTruthy();
  });

  it('is translated', () => {
    const { container } = render(ROW, 'pt_BR');
    expect(screen.getByText('Ouro II · 45 PDL')).toBeTruthy();
    expect(container.querySelector('.drk-wl .is-win').textContent).toBe('8V');
    expect(screen.getByRole('heading').textContent).toContain('(Você)');
  });
});
