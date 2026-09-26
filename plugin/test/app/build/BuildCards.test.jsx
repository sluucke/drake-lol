import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ItemsCard, RunesCard, SkillOrderCard, SpellsCard } from '../../../src/app/overlays/build/BuildCards.jsx';

const BUILD = {
  hasData: true,
  patch: '14.1',
  stats: null,
  spells: [{ ids: [4, 14], winRate: 61.5, pickRate: 61.5, play: 900 }],
  items: {
    starter: [{ ids: [1055, 2003], winRate: 50.5, pickRate: 70, play: 800 }],
    boots: [{ ids: [3006], winRate: 51, pickRate: 60, play: 700 }],
    core: [
      { ids: [6672, 3031, 3094], winRate: 55.2, pickRate: 21, play: 400 },
      { ids: [6673, 3031], winRate: 48.1, pickRate: 12, play: 200 },
    ],
    last: [
      { ids: [3036], winRate: 50, pickRate: 30, play: 100 },
      { ids: [3072], winRate: 49, pickRate: 20, play: 80 },
    ],
  },
  runePages: [
    {
      primaryStyleId: 8000,
      subStyleId: 8100,
      selectedPerkIds: [8008, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5001],
      winRate: 53.4,
      pickRate: 20,
      play: 600,
    },
  ],
  skills: { masteries: ['Q', 'E', 'W'], order: ['Q', 'E', 'W', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W'], winRate: 50.1, play: 321 },
  counters: { strong: [], weak: [] },
};

function setup(ui, build = {}) {
  const store = createDrakeStore();
  store.getState().setBuild({ ...store.getState().build, championId: 157, championName: 'Yasuo', build: BUILD, ...build });
  const actions = {
    applyBuildRunes: vi.fn(async () => {}),
    applyBuildSpells: vi.fn(async () => {}),
    applyBuildItems: vi.fn(async () => {}),
  };
  const utils = renderWithProviders(ui, { store, actions });
  return { ...utils, store, actions };
}

describe('RunesCard', () => {
  it('renders the page and applies it', () => {
    const { container, actions, store } = setup(<RunesCard />);
    const card = container.querySelector('.drk-card');
    expect(within(card).getByRole('heading', { name: 'Runes' })).toBeTruthy();
    expect(card.querySelectorAll('.drk-build-shard')).toHaveLength(3);
    expect(card.querySelectorAll('.drk-build-perk')).toHaveLength(5);
    expect(card.querySelector('.drk-build-keystone')).not.toBeNull();
    expect(card.textContent).toContain('53.4%');
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(actions.applyBuildRunes).toHaveBeenCalledWith(0);
    act(() => store.getState().setBuild({ ...store.getState().build, runeStatus: 'applying' }));
    expect(within(card).getByRole('button', { name: 'Applying…' }).disabled).toBe(true);
  });

  it('shows the empty state', () => {
    setup(<RunesCard />, { build: { ...BUILD, runePages: [] } });
    expect(screen.getByText('No rune data')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });
});

describe('ItemsCard', () => {
  it('renders phases, core rows and the situational strip', () => {
    const { container, actions } = setup(<ItemsCard />);
    for (const label of ['Starter', 'Boots', 'Core', 'Situational']) expect(screen.getByText(label)).toBeTruthy();
    const coreRows = container.querySelectorAll('.drk-build-core-row');
    expect(coreRows).toHaveLength(2);
    expect(coreRows[0].className).toContain('is-hextech');
    expect(coreRows[0].querySelectorAll('.drk-build-icon.is-hextech')).toHaveLength(1);
    expect(coreRows[0].textContent).toContain('1.');
    expect(coreRows[0].textContent).toContain('55.2% WR');
    expect(coreRows[0].querySelector('.drk-build-wr').className).toContain('is-positive');
    expect(coreRows[1].querySelector('.drk-build-wr').className).toContain('is-negative');
    expect(container.querySelectorAll('.drk-build-trend__cell')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Create Item Set' }));
    expect(actions.applyBuildItems).toHaveBeenCalledTimes(1);
  });

  it('shows applied and the empty state', () => {
    setup(<ItemsCard />, { itemSetStatus: 'applied', build: { ...BUILD, items: { starter: [], boots: [], core: [], last: [] } } });
    expect(screen.getByText('No item data')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Applied' })).toBeTruthy();
  });
});

describe('SpellsCard', () => {
  it('applies the spell pair', () => {
    const { actions, container } = setup(<SpellsCard />);
    expect(container.querySelectorAll('.drk-build-icon')).toHaveLength(2);
    expect(container.textContent).toContain('61.5%');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(actions.applyBuildSpells).toHaveBeenCalledWith(0);
  });
});

describe('SkillOrderCard', () => {
  it('renders the 4x15 grid', () => {
    const { container } = setup(<SkillOrderCard />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(container.querySelectorAll('.drk-skill-cell')).toHaveLength(60);
    const active = container.querySelectorAll('.drk-skill-cell.is-active');
    expect(active).toHaveLength(15);
    expect(active[0].textContent).toBe('1');
    expect(container.textContent).toContain('50.1%');
    expect(container.textContent).toContain('321');
  });

  it('renders nothing without skills', () => {
    const { container } = setup(<SkillOrderCard />, { build: { ...BUILD, skills: { masteries: [], order: [] } } });
    expect(container.querySelector('.drk-skill-table')).toBeNull();
  });
});
