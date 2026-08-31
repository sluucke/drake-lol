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
