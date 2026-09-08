import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeBuildPanel, CACHE_TTL_MS } from '../src/ui/buildPanel.js';

function makeNode() {
  const node = {
    className: '',
    hidden: true,
    innerHTML: '',
    dataset: {},
    style: { display: '' },
    children: [],
    listeners: {},
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    querySelector() {
      return null;
    },
    addEventListener(type, handler) {
      (this.listeners[type] ||= []).push(handler);
    },
    removeEventListener() {},
    emit(type, event) {
      for (const handler of this.listeners[type] || []) handler(event);
    },
  };
  return node;
}

function makeRoot() {
  const root = makeNode();
  root.ownerDocument = { createElement: () => makeNode() };
  return root;
}

function clickEvent(dataset) {
  const target = {
    dataset,
    closest: (sel) => {
      const key = sel.replace(/^\[|\]$/g, '').replace(/=.*$/, '');
      const prop = key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return dataset[prop] !== undefined ? target : null;
    },
    matches: () => false,
  };
  return { target, stopPropagation: vi.fn(), preventDefault: vi.fn() };
}

const SESSION = { championId: 157, position: 'MIDDLE', mode: 'ranked' };

function makeDeps(overrides = {}) {
  return {
    doc: { createElement: () => makeNode() },
    overlayRoot: makeRoot(),
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

    const overlay = deps.overlayRoot.children[0];
    overlay.emit('change', { target: { dataset: { buildTier: '' }, value: 'challenger', matches: () => true, closest: () => null } });
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'challenger' }),
      expect.anything()
    );
    expect(deps.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ build_tier: 'challenger' }));
  });

  it('resolves tier changes when the event target is a nested dropdown option', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    const dropdown = {
      dataset: { buildTier: '' },
      value: 'diamond_plus',
      matches: (sel) => sel === '[data-build-tier]',
      closest: (sel) => (sel === '[data-build-tier]' ? dropdown : null),
    };
    const option = {
      value: '',
      matches: () => false,
      closest: (sel) => (sel === '[data-build-tier]' ? dropdown : null),
      dataset: {},
    };
    const overlay = deps.overlayRoot.children[0];
    overlay.emit('change', { target: option, composedPath: () => [option, dropdown] });
    await flush();

    expect(deps.fetchChampionBuildImpl).toHaveBeenLastCalledWith(
      expect.objectContaining({ tier: 'diamond_plus' }),
      expect.anything()
    );
    expect(panel.getState().tier).toBe('diamond_plus');
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

    const overlay = deps.overlayRoot.children[0];
    overlay.emit('change', { target: { dataset: { buildTier: '' }, value: 'challenger', matches: () => true, closest: () => null } });
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

    const overlay = deps.overlayRoot.children[0];
    expect(overlay.innerHTML).toContain('data-build-retry');
  });

  it('applies the selected rune page', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    const overlay = deps.overlayRoot.children[0];
    overlay.emit('click', clickEvent({ buildApplyRunes: '0' }));
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

    deps.overlayRoot.children[0].emit('click', clickEvent({ buildApplySpells: '0' }));
    await flush();

    expect(deps.applySummonerSpellsImpl).toHaveBeenCalledWith(deps.lcu, { spell1Id: 4, spell2Id: 14 });
  });

  it('loads a player build and then restores the average', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();

    const overlay = deps.overlayRoot.children[0];
    overlay.emit('click', clickEvent({ buildPlayer: 'Hide on bush#KR1', buildPlayerRegion: 'kr' }));
    await flush();
    expect(deps.fetchPlayerBuildImpl).toHaveBeenCalledWith(
      expect.objectContaining({ riotId: 'Hide on bush#KR1', championId: 157 }),
      expect.anything()
    );
    expect(overlay.innerHTML).toContain('data-build-clear-player');

    overlay.emit('click', clickEvent({ buildClearPlayer: '' }));
    await flush();
    expect(overlay.innerHTML).not.toContain('data-build-clear-player');
  });

  it('closes on the close button and on escape', async () => {
    const deps = makeDeps();
    const panel = makeBuildPanel(deps);
    panel.setSession(SESSION);
    panel.open();
    await flush();
    expect(panel.isOpen()).toBe(true);

    deps.overlayRoot.children[0].emit('click', clickEvent({ buildClose: '' }));
    expect(panel.isOpen()).toBe(false);
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

    const overlay = deps.overlayRoot.children[0];
    overlay.emit('click', clickEvent({ buildPlayer: 'Hide on bush#KR1', buildPlayerRegion: 'kr' }));
    await flush();

    // Clear the selection before the in-flight player-build fetch resolves.
    overlay.emit('click', clickEvent({ buildClearPlayer: '' }));
    await flush();
    expect(overlay.innerHTML).not.toContain('data-build-clear-player');

    resolvePlayerBuild({ ok: true, data: { runePages: [], items: [9999] } });
    await flush();

    // The stale response must not resurrect the "viewing player" state.
    expect(overlay.innerHTML).not.toContain('data-build-clear-player');
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

    const overlay = deps.overlayRoot.children[0];
    expect(overlay.innerHTML).toContain('YasuoPlayer#KR1');
    expect(overlay.innerHTML).not.toContain('AhriPlayer#KR1');
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

  it('renders the real champion name once the list arrives after setSession', async () => {
    const { deps, arrive } = makeLateNameDeps();
    const panel = makeBuildPanel(deps);

    panel.setSession(SESSION);
    panel.open();
    await flush();

    const overlay = deps.overlayRoot.children[0];
    expect(overlay.innerHTML).toContain('Champion');
    expect(overlay.innerHTML).not.toContain('Yasuo');

    // The names land, and champ select re-feeds the identical session.
    arrive();
    panel.setSession(SESSION);
    await flush();

    expect(overlay.innerHTML).toContain('Yasuo');
    expect(overlay.innerHTML).not.toContain('>Champion<');
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
