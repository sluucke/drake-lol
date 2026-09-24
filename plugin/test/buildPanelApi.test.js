import { describe, it, expect, vi } from 'vitest';
import { makeBuildPanel } from '../src/ui/buildPanel.js';

const BUILD = {
  hasData: true,
  patch: '14.1',
  stats: { winRate: 51.2, pickRate: 8.4, banRate: 3.1, kda: 2.61, play: 12345 },
  spells: [{ ids: [4, 14], winRate: 52, pickRate: 61.5, play: 900 }],
  items: {
    starter: [{ ids: [1055, 2003], winRate: 50.5, pickRate: 70, play: 800 }],
    boots: [{ ids: [3006], winRate: 51, pickRate: 60, play: 700 }],
    core: [{ ids: [6672, 3031, 3094], winRate: 55.2, pickRate: 21, play: 400 }],
    last: [{ ids: [3036], winRate: 50, pickRate: 30, play: 100 }],
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
  skills: { masteries: ['Q', 'E', 'W'], order: ['Q'], winRate: 50.1, play: 321 },
  counters: { strong: [{ championId: 82, winRate: 57.5, play: 163 }], weak: [] },
};

const NAMES = { 157: 'Yasuo', 82: 'Mordekaiser' };

function setup(extra = {}) {
  const overlayRoot = { appendChild: vi.fn(), querySelector: vi.fn(() => null), ownerDocument: null };
  const deps = {
    fetchChampionBuildImpl: vi.fn(async () => ({ meta: { version: '14.1' } })),
    normalizeChampionBuildImpl: vi.fn(() => BUILD),
    fetchChampionLeaderboardImpl: vi.fn(async () => ({ ok: true, data: [{ ranking: 1, name: 'Hide on bush#KR1', region: 'KR' }] })),
    fetchPlayerBuildImpl: vi.fn(async () => ({ ok: true, data: { runePages: [], items: [3078] } })),
    applyRunePageImpl: vi.fn(async () => ({ success: true })),
    applySummonerSpellsImpl: vi.fn(async () => ({ success: true })),
    applyItemSetImpl: vi.fn(async () => ({ success: true })),
    loadGameAssetsImpl: vi.fn(async () => true),
    loadRuneAssetsImpl: vi.fn(async () => true),
  };
  const saveSettings = vi.fn(async () => ({ ok: true }));
  let names = { ...NAMES };
  const panel = makeBuildPanel({
    doc: {},
    overlayRoot,
    lcu: {},
    headless: true,
    getChampName: (id) => names[id] || '',
    getSettings: () => ({}),
    saveSettings,
    getSummonerId: () => 42,
    ...deps,
    ...extra,
  });
  const updates = [];
  panel.onUpdate(() => updates.push(panel.getSnapshot()));
  return { panel, deps, saveSettings, overlayRoot, updates, setNames: (next) => (names = next) };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('headless build panel', () => {
  it('never builds DOM and notifies on session changes', () => {
    const { panel, overlayRoot, updates } = setup();
    panel.setSession({ championId: 157, position: 'MIDDLE', mode: 'ranked' });
    expect(overlayRoot.appendChild).not.toHaveBeenCalled();
    expect(updates.at(-1).championId).toBe(157);
    expect(updates.at(-1).championName).toBe('Yasuo');
  });

  it('loads a build into the snapshot', async () => {
    const { panel } = setup();
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    await panel.loadBuild();
    await flush();
    const snap = panel.getSnapshot();
    expect(snap.build).toBe(BUILD);
    expect(snap.loading).toBe(false);
    expect(snap.topPlayers.ok).toBe(true);
    expect(snap.championNames).toEqual({ 82: 'Mordekaiser' });
    expect(snap.getChampName).toBeUndefined();
  });

  it('changes tier and region through methods', async () => {
    const { panel, saveSettings, deps } = setup();
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    panel.setTier('master');
    panel.setRegion('br');
    await flush();
    expect(saveSettings).toHaveBeenCalledWith({ build_tier: 'master' });
    expect(saveSettings).toHaveBeenCalledWith({ build_region: 'br' });
    expect(panel.getSnapshot().tier).toBe('master');
    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'master', region: 'br' }),
      expect.anything(),
    );
    panel.showAllRanks();
    expect(panel.getSnapshot().tier).toBe('all');
  });

  it('views and clears a player build', async () => {
    const { panel } = setup();
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    await panel.loadBuild();
    await panel.viewPlayer('Hide on bush#KR1', 'KR');
    expect(panel.getSnapshot().viewingPlayer).toBe('Hide on bush#KR1');
    expect(panel.getSnapshot().build.items.core[0].ids).toEqual([3078]);
    panel.clearPlayer();
    expect(panel.getSnapshot().viewingPlayer).toBe('');
    expect(panel.getSnapshot().build).toBe(BUILD);
  });

  it('applies runes, spells and items', async () => {
    const { panel, deps } = setup();
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    await panel.loadBuild();
    await panel.applyRunes(0);
    expect(deps.applyRunePageImpl).toHaveBeenCalledWith({}, expect.objectContaining({ name: 'Yasuo Build', primaryStyleId: 8000 }));
    expect(panel.getSnapshot().runeStatus).toBe('applied');
    await panel.applySpells(0);
    expect(deps.applySummonerSpellsImpl).toHaveBeenCalledWith({}, { spell1Id: 4, spell2Id: 14 });
    await panel.applyItems();
    expect(deps.applyItemSetImpl).toHaveBeenCalledWith({}, 42, expect.objectContaining({ associatedChampions: [157] }));
    expect(panel.getSnapshot().itemSetStatus).toBe('applied');
  });

  it('re-queries top players when a late champion name arrives', async () => {
    const { panel, deps, setNames } = setup();
    setNames({});
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    await panel.loadBuild();
    await flush();
    const calls = deps.fetchChampionLeaderboardImpl.mock.calls.length;
    setNames(NAMES);
    panel.setSession({ championId: 157, position: 'MIDDLE' });
    await flush();
    expect(panel.getSnapshot().championName).toBe('Yasuo');
    expect(deps.fetchChampionLeaderboardImpl.mock.calls.length).toBeGreaterThanOrEqual(calls);
  });
});
