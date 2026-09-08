import { describe, it, expect } from 'vitest';
import {
  renderBuildPanel,
  renderPanelHeader,
  renderItemsCard,
  renderRunesCard,
  renderSpellsCard,
  renderCounters,
  renderTopPlayers,
} from '../src/ui/buildPanelRender.js';

const build = {
  patch: '16.17',
  cachedAt: '2026-08-31 11:59:25',
  stats: { winRate: 49.4, pickRate: 15.0, banRate: 19.9, kda: 1.61, play: 126257, tier: 2, rank: 19 },
  spells: [{ ids: [4, 14], winRate: 48.7, pickRate: 61.5, play: 43855 }],
  items: {
    starter: [{ ids: [1086, 2003], winRate: 49.2, pickRate: 74.5, play: 53125 }],
    boots: [{ ids: [3006], winRate: 49.0, pickRate: 84.6, play: 59523 }],
    core: [{ ids: [3153, 6673, 3031], winRate: 55.2, pickRate: 21.0, play: 8986 }],
    last: [{ ids: [6673], winRate: 51.5, pickRate: 68.0, play: 46899 }],
  },
  runePages: [
    { primaryStyleId: 8000, subStyleId: 8400, selectedPerkIds: [8008, 9101, 9104, 8299, 8444, 8451, 5005, 5008, 5001], winRate: 46.4, pickRate: 42.3, play: 23983 },
  ],
  skills: { masteries: ['Q', 'E', 'W'], order: ['Q', 'E', 'W', 'Q', 'Q', 'R', 'Q', 'E', 'Q', 'E', 'R', 'E', 'E', 'W', 'W'] },
  counters: {
    strong: [{ championId: 82, winRate: 57.5, play: 485 }],
    weak: [{ championId: 360, winRate: 36.8, play: 163 }],
  },
  hasData: true,
};

const baseState = {
  championId: 157,
  championName: 'Yasuo',
  position: 'MIDDLE',
  mode: 'ranked',
  tier: 'emerald_plus',
  region: 'global',
  patch: '16.17',
  loading: false,
  error: '',
  build,
  topPlayers: { loading: false, ok: true, players: [], reason: '' },
  viewingPlayer: '',
  runeStatus: 'idle',
  itemSetStatus: 'idle',
  spellStatus: 'idle',
  getChampName: (id) => ({ 82: 'Mordekaiser', 360: 'Samira' })[id] || `Champion ${id}`,
};

describe('renderPanelHeader', () => {
  it('renders every tier as a drake-select option and marks the selected one', () => {
    const html = renderPanelHeader(baseState);
    expect(html).toContain('drake-select');
    expect(html).toContain('data-build-tier');
    expect(html).toMatch(/<div class="drake-select-option is-selected" data-value="emerald_plus"/);
    expect(html).toContain('data-value="challenger"');
    expect(html).toContain('Emerald+');
  });

  it('shows the champion, patch and aggregate stats', () => {
    const html = renderPanelHeader(baseState);
    expect(html).toContain('Yasuo');
    expect(html).toContain('16.17');
    expect(html).toContain('49.4%');
    expect(html).toContain('1.61');
  });

  it('tags the mode so aram is visible at a glance', () => {
    expect(renderPanelHeader({ ...baseState, mode: 'aram' })).toContain('ARAM');
  });

  it('keeps images out of the tier dropdown options — icons live outside the select, not inside an option', () => {
    const html = renderPanelHeader(baseState);
    const optionsBlock = html.slice(html.indexOf('data-build-tier'), html.indexOf('drake-select-list'));
    expect(optionsBlock).not.toContain('<img');
  });

  it('stamps the current value on the rank and region select hosts', () => {
    const html = renderPanelHeader(baseState);
    expect(html).toContain(`data-value="${baseState.tier}"`);
    expect(html).toContain(`data-value="${baseState.region}"`);
  });

  it('shows the current rank icon outside the dropdown instead', () => {
    const html = renderPanelHeader(baseState);
    expect(html).toContain('build-filter-rank-icon');
  });
});

describe('renderItemsCard', () => {
  it('renders local icon paths, never a cdn url', () => {
    const html = renderItemsCard(baseState);
    expect(html).toContain('/lol-game-data/');
    expect(html).not.toMatch(/ddragon|communitydragon/);
  });

  it('shows the rank index, win rate and pick rate for each build, with hextech highlight on the top item', () => {
    const html = renderItemsCard(baseState);
    expect(html).toContain('build-row-num');
    expect(html).toContain('1.');
    expect(html).toContain('hextech-item');
    expect(html).toContain('55.2%');
    expect(html).toContain('21%');
  });

  it('offers the item set action', () => {
    expect(renderItemsCard(baseState)).toContain('data-build-apply-items');
  });

  it('reflects the apply status', () => {
    expect(renderItemsCard({ ...baseState, itemSetStatus: 'applied' })).toContain('Applied');
    expect(renderItemsCard({ ...baseState, itemSetStatus: 'applying' })).toContain('disabled');
  });

  it('groups items by game phase: starter, boots, core and situational', () => {
    const html = renderItemsCard(baseState);
    expect(html).toContain('Starter');
    expect(html).toContain('Boots');
    expect(html).toContain('Core');
    expect(html).toContain('Situational');
    expect(html).toContain('build-item-phase');
    expect(html).toContain('build-trend-cell');
  });

  it('skips a phase entirely when there is no data for it', () => {
    const html = renderItemsCard({
      ...baseState,
      build: { ...build, items: { starter: [], boots: [], core: build.items.core, last: [] } },
    });
    expect(html).not.toContain('Starter');
    expect(html).not.toContain('Boots');
    expect(html).not.toContain('Situational');
    expect(html).toContain('Core');
  });
});

describe('renderRunesCard', () => {
  it('renders keystone, minor perks and shards from the perk ids with rank index', () => {
    const html = renderRunesCard(baseState);
    expect(html).toContain('build-row-num');
    expect(html).toContain('1.');
    expect(html).toContain('data-build-apply-runes="0"');
    expect(html).toContain('perk');
  });

  it('shows an empty state when there are no pages', () => {
    const html = renderRunesCard({ ...baseState, build: { ...build, runePages: [] } });
    expect(html).toMatch(/No rune/i);
    expect(html).not.toContain('data-build-apply-runes');
  });
});

describe('renderSpellsCard', () => {
  it('renders each spell pair with an apply action and rank index', () => {
    const html = renderSpellsCard(baseState);
    expect(html).toContain('build-row-num');
    expect(html).toContain('1.');
    expect(html).toContain('data-build-apply-spells="0"');
    expect(html).toContain('61.5%');
  });
});

describe('renderCounters', () => {
  it('splits strong and weak matchups with names and games', () => {
    const html = renderCounters(baseState);
    expect(html).toContain('Mordekaiser');
    expect(html).toContain('57.5%');
    expect(html).toContain('Samira');
    expect(html).toContain('163');
  });

  it('hides itself in aram where counters do not apply', () => {
    expect(renderCounters({ ...baseState, mode: 'aram' })).toBe('');
  });
});

describe('renderTopPlayers', () => {
  it('renders a view-build button per player', () => {
    const state = {
      ...baseState,
      topPlayers: {
        loading: false,
        ok: true,
        reason: '',
        players: [{ ranking: 1, name: 'Hide on bush#KR1', region: 'KR', tier: 'Challenger 1 (1543 LP)', winRate: 60.4, played: 530 }],
      },
    };
    const html = renderTopPlayers(state);
    expect(html).toContain('Hide on bush#KR1');
    expect(html).toContain('data-build-player="Hide on bush#KR1"');
  });

  it('renders a compact clickable list rather than a table, to fit the sidebar', () => {
    const state = {
      ...baseState,
      topPlayers: {
        loading: false,
        ok: true,
        reason: '',
        players: [{ ranking: 1, name: 'Hide on bush#KR1', region: 'KR', tier: 'Challenger 1 (1543 LP)', winRate: 60.4, played: 530 }],
      },
    };
    const html = renderTopPlayers(state);
    expect(html).toContain('build-toplist');
    expect(html).not.toContain('<table');
  });

  it('shows the degradation reason instead of an empty table', () => {
    const html = renderTopPlayers({
      ...baseState,
      topPlayers: { loading: false, ok: false, players: [], reason: 'Ranking service unavailable' },
    });
    expect(html).toContain('Ranking service unavailable');
    expect(html).not.toContain('data-build-player=');
  });

  it('shows a floating banner with a restore button while viewing a player build', () => {
    const html = renderBuildPanel({ ...baseState, viewingPlayer: 'Hide on bush#KR1' });
    expect(html).toContain('data-build-clear-player');
    expect(html).toContain('Hide on bush#KR1');
  });
});

describe('renderBuildPanel', () => {
  it('renders a loading state without touching the build', () => {
    const html = renderBuildPanel({ ...baseState, loading: true, build: null });
    expect(html).toMatch(/Loading/i);
  });

  it('renders an error state with a retry action', () => {
    const html = renderBuildPanel({ ...baseState, loading: false, error: 'Network error', build: null });
    expect(html).toContain('Network error');
    expect(html).toContain('data-build-retry');
  });

  it('offers a shortcut to all ranks when the tier has no data', () => {
    const html = renderBuildPanel({ ...baseState, loading: false, error: '', build: { ...build, hasData: false } });
    expect(html).toMatch(/No data/i);
    expect(html).toContain('data-build-tier-all');
  });

  it('prompts to pick a champion when none is selected', () => {
    const html = renderBuildPanel({ ...baseState, championId: 0, build: null });
    expect(html).toMatch(/Pick a champion/i);
  });

  it('renders every section when data is present', () => {
    const html = renderBuildPanel(baseState);
    for (const marker of ['data-build-tier', 'data-build-apply-items', 'data-build-apply-runes', 'data-build-apply-spells']) {
      expect(html).toContain(marker);
    }
    expect(html).toContain('data-build-close');
  });

  it('escapes champion names so a crafted name cannot inject markup', () => {
    const html = renderBuildPanel({ ...baseState, championName: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('puts Top Players and Matchups in a sidebar next to a two-column main area', () => {
    const html = renderBuildPanel(baseState);
    expect(html).toContain('build-sidebar');
    expect(html).toContain('build-main');
    const sidebarIndex = html.indexOf('build-sidebar');
    const topPlayersIndex = html.indexOf('build-players-card');
    const mainIndex = html.indexOf('build-main"');
    const skillsIndex = html.indexOf('build-skills-card');
    expect(topPlayersIndex).toBeGreaterThan(sidebarIndex);
    expect(topPlayersIndex).toBeLessThan(mainIndex);
    expect(skillsIndex).toBeGreaterThan(mainIndex);
  });

  it('places Summoner Spells under Skill Order in the right column', () => {
    const html = renderBuildPanel(baseState);
    const skillsIndex = html.indexOf('build-skills-card');
    const spellsIndex = html.indexOf('build-spells-card');
    const itemsIndex = html.indexOf('build-items-card');
    const runesIndex = html.indexOf('build-runes-card');
    expect(skillsIndex).toBeGreaterThan(-1);
    expect(spellsIndex).toBeGreaterThan(skillsIndex);
    expect(itemsIndex).toBeGreaterThan(runesIndex);
    expect(spellsIndex).toBeGreaterThan(itemsIndex);
  });
});
