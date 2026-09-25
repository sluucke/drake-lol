import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeBuildPanel, CACHE_TTL_MS } from '../src/ui/buildPanel.js';

const SESSION = { championId: 157, position: 'MIDDLE', mode: 'ranked' };

function makeDeps(overrides = {}) {
  return {
    lcu: { get: vi.fn(), put: vi.fn(), patch: vi.fn() },
    fetchFn: vi.fn(),
    getChampName: (id) => (id === 157 ? 'Yasuo' : `Champion ${id}`),
    getSettings: () => ({ build_tier: 'emerald_plus', build_region: 'global' }),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
    fetchChampionBuildImpl: vi.fn().mockResolvedValue({ data: {}, meta: { version: '16.17' } }),
    normalizeChampionBuildImpl: vi.fn().mockReturnValue({
      patch: '16.17',
      stats: { winRate: 49.4, pickRate: 15, banRate: 19.9, kda: 1.61, play: 1000, tier: 2, rank: 19 },
      spells: [{ ids: [4, 14], winRate: 48.7, pickRate: 61.5, play: 100 }],
      items: { starter: [], boots: [], core: [{ ids: [3153], winRate: 55, pickRate: 21, play: 10 }], last: [] },
      runePages: [{ primaryStyleId: 8000, subStyleId: 8400, selectedPerkIds: [8008, 5005], winRate: 46, pickRate: 42, play: 10 }],
      skills: { masteries: ['Q'], order: ['Q'] },
      counters: { strong: [], weak: [] },
      hasData: true,
    }),
    fetchChampionLeaderboardImpl: vi.fn().mockResolvedValue({ ok: true, data: [], reason: '' }),
    fetchPlayerBuildImpl: vi.fn().mockResolvedValue({ ok: true, data: { runePages: [], items: [3153] }, reason: '' }),
    applyRunePageImpl: vi.fn().mockResolvedValue({ success: true }),
    applyItemSetImpl: vi.fn().mockResolvedValue({ success: true }),
    applySummonerSpellsImpl: vi.fn().mockResolvedValue({ success: true }),
    loadGameAssetsImpl: vi.fn().mockResolvedValue(true),
    loadRuneAssetsImpl: vi.fn().mockResolvedValue(true),
    nowFn: () => 1000,
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('makeBuildPanel', () => {
  it('does not fetch until it is opened', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    await flush();
    expect(deps.fetchChampionBuildImpl).not.toHaveBeenCalled();
  });

  it('fetches with the persisted tier when opened', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    expect(deps.loadGameAssetsImpl).toHaveBeenCalledWith(deps.lcu);
    expect(deps.loadRuneAssetsImpl).toHaveBeenCalledWith(deps.lcu);
    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledWith(
      expect.objectContaining({ championId: 157, position: 'MIDDLE', mode: 'ranked', tier: 'emerald_plus', region: 'global' }),
      expect.anything()
    );
  });

  it('reuses the cache for the same key inside the TTL', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();
    panel.close();
    panel.open();
    await flush();
    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache entry expires', async () => {
    let now = 1000;
    const deps = makeDeps({ nowFn: () => now });
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    now += CACHE_TTL_MS + 1;
    panel.close();
    panel.open();
    await flush();
    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledTimes(2);
  });

  it('refetches and persists when the tier changes', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.setTier('challenger');
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'challenger' }),
      expect.anything()
    );
    expect(deps.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ build_tier: 'challenger' }));
  });

  it('re-reads settings on open so a save made after construction reaches the panel', async () => {
    let current = { build_tier: 'emerald_plus', build_region: 'global' };
    const deps = makeDeps({ getSettings: () => current });
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);

    // Settings changed after the panel was constructed (e.g. reloaded
    // elsewhere) but before the panel is ever opened.
    current = { build_tier: 'diamond_plus', build_region: 'na' };

    panel.open();
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'diamond_plus', region: 'na' }),
      expect.anything()
    );
  });

  it('does not let a stale settings re-read clobber a live mid-session tier change', async () => {
    let current = { build_tier: 'emerald_plus', build_region: 'global' };
    const deps = makeDeps({ getSettings: () => current });
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.setTier('challenger');
    await flush();

    // getSettings() still reflects the pre-change value (save is async /
    // has not round-tripped yet) at the moment the panel is reopened.
    panel.close();
    panel.open();
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'challenger' }),
      expect.anything()
    );
  });

  it('surfaces an error state when the fetch returns nothing', async () => {
    const deps = makeDeps({ fetchChampionBuildImpl: vi.fn().mockResolvedValue(null) });
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    expect(panel.getSnapshot().error).toBeTruthy();
  });

  it('applies the selected rune page', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.applyRunes(0);
    await flush();

    expect(deps.applyRunePageImpl).toHaveBeenCalledWith(
      deps.lcu,
      expect.objectContaining({ primaryStyleId: 8000, subStyleId: 8400, selectedPerkIds: [8008, 5005] })
    );
  });

  it('applies summoner spells from the chosen row', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.applySpells(0);
    await flush();

    expect(deps.applySummonerSpellsImpl).toHaveBeenCalledWith(deps.lcu, { spell1Id: 4, spell2Id: 14 });
  });

  it('loads a player build and then restores the average', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.viewPlayer('Hide on bush#KR1', 'kr');
    await flush();
    expect(deps.fetchPlayerBuildImpl).toHaveBeenCalledWith(
      expect.objectContaining({ riotId: 'Hide on bush#KR1', championId: 157 }),
      expect.anything()
    );
    expect(panel.getSnapshot().viewingPlayer).toBeTruthy();

    panel.clearPlayer();
    await flush();
    expect(panel.getSnapshot().viewingPlayer).toBeFalsy();
  });

  it('clears state when the champion changes', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.setSession({ championId: 103, position: 'MIDDLE', mode: 'ranked' });
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ championId: 103 }),
      expect.anything()
    );
  });

  it('does not let a stale player-build fetch overwrite a cleared selection', async () => {
    const deps = makeDeps();
    let resolvePlayerBuild;
    deps.fetchPlayerBuildImpl = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlayerBuild = resolve;
        })
    );
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.viewPlayer('Hide on bush#KR1', 'kr');
    await flush();

    panel.clearPlayer();
    await flush();
    expect(panel.getSnapshot().viewingPlayer).toBeFalsy();

    resolvePlayerBuild({ ok: true, data: { runePages: [], items: [9999] } });
    await flush();

    expect(panel.getSnapshot().viewingPlayer).toBeFalsy();
  });

  it('keeps top players scoped to the champion when the build is restored from cache', async () => {
    const deps = makeDeps({
      fetchChampionLeaderboardImpl: vi.fn().mockImplementation(({ championName }) => {
        if (championName === 'Yasuo') {
          return Promise.resolve({ ok: true, data: [{ name: 'YasuoPlayer#KR1', ranking: 1 }], reason: '' });
        }
        return Promise.resolve({ ok: true, data: [{ name: 'AhriPlayer#KR1', ranking: 1 }], reason: '' });
      }),
    });
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    panel.setSession({ championId: 103, position: 'MIDDLE', mode: 'ranked' });
    await flush();

    panel.setSession(SESSION);
    await flush();

    const names = panel.getSnapshot().topPlayers.players.map((p) => p.name);
    expect(names).toContain('YasuoPlayer#KR1');
    expect(names).not.toContain('AhriPlayer#KR1');
  });
});

describe('makeBuildPanel late champion names', () => {
  // The champion list loads lazily and is shared with team reveal, so it can
  // still be empty when champ select hands us a session.
  function makeLateNameDeps(overrides = {}) {
    const champs = [];
    const deps = makeDeps({
      getChampName: (id) => champs.find((c) => c.id === id)?.name || '',
      ...overrides,
    });
    return { deps, arrive: () => champs.push({ id: 157, name: 'Yasuo' }) };
  }

  it('resolves the real champion name once the list arrives after setSession', async () => {
    const { deps, arrive } = makeLateNameDeps();
    const panel = makeBuildPanel(deps);

    panel.setSession(SESSION);
    panel.open();
    await flush();

    expect(panel.getSnapshot().championName).not.toBe('Yasuo');

    arrive();
    panel.setSession(SESSION);
    await flush();

    expect(panel.getSnapshot().championName).toBe('Yasuo');
  });

  it('re-queries the leaderboard with the real name after it arrives', async () => {
    const { deps, arrive } = makeLateNameDeps({
      fetchChampionLeaderboardImpl: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, data: [], reason: 'no champion' })
        .mockResolvedValue({ ok: true, data: [], reason: '' }),
    });
    const panel = makeBuildPanel(deps);

    panel.setSession(SESSION);
    panel.open();
    await flush();

    expect(deps.fetchChampionLeaderboardImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ championName: '' }),
      expect.anything()
    );

    arrive();
    panel.setSession(SESSION);
    await flush();

    expect(deps.fetchChampionLeaderboardImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ championName: 'Yasuo' }),
      expect.anything()
    );
  });

  it('does not re-fetch the build itself when only the name was backfilled', async () => {
    const { deps, arrive } = makeLateNameDeps();
    const panel = makeBuildPanel(deps);

    panel.setSession(SESSION);
    panel.open();
    await flush();
    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledTimes(1);

    arrive();
    panel.setSession(SESSION);
    await flush();
    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledTimes(1);
  });

  it('still ignores a repeated session once the name is already resolved', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);

    panel.setSession(SESSION);
    panel.open();
    await flush();
    const leaderboardCalls = deps.fetchChampionLeaderboardImpl.mock.calls.length;

    panel.setSession(SESSION);
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenCalledTimes(1);
    expect(deps.fetchChampionLeaderboardImpl.mock.calls.length).toBe(leaderboardCalls);
  });
});
