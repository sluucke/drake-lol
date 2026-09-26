import { fetchChampionBuild, DEFAULT_TIER, DEFAULT_REGION } from '../features/opggApi.js';
import { normalizeChampionBuild } from '../features/buildData.js';
import { fetchChampionLeaderboard, fetchPlayerBuild } from '../features/topPlayers.js';
import { loadGameAssets } from '../features/gameAssets.js';
import { applyRunePage, loadRuneAssets } from '../features/runes.js';
import { buildItemSet, applyItemSet, applySummonerSpells } from '../features/itemSets.js';

const TAG = '[Drake]';
export const CACHE_TTL_MS = 10 * 60 * 1000;

export function makeBuildPanel({
  lcu,
  fetchFn = globalThis.fetch,
  getChampName = () => '',
  getSettings = () => ({}),
  saveSettings = async () => ({ ok: true }),
  getSummonerId = () => 0,
  fetchChampionBuildImpl = fetchChampionBuild,
  normalizeChampionBuildImpl = normalizeChampionBuild,
  fetchChampionLeaderboardImpl = fetchChampionLeaderboard,
  fetchPlayerBuildImpl = fetchPlayerBuild,
  applyRunePageImpl = applyRunePage,
  applyItemSetImpl = applyItemSet,
  applySummonerSpellsImpl = applySummonerSpells,
  loadGameAssetsImpl = loadGameAssets,
  loadRuneAssetsImpl = loadRuneAssets,
  nowFn = () => Date.now(),
} = {}) {
  const settings = getSettings() || {};

  let open = false;
  let enabled = true;
  let generation = 0;
  let hasOpenedOnce = false;
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch (err) {
        console.warn(TAG, 'onUpdate listener failed:', err?.stack || err?.message || err);
      }
    }
  }

  function ensureSettingsRead() {
    if (!hasOpenedOnce) {
      hasOpenedOnce = true;
      const fresh = getSettings() || {};
      state.tier = fresh.build_tier || state.tier;
      state.region = fresh.build_region || state.region;
    }
  }

  const cache = new Map();

  let state = {
    championId: 0,
    championName: '',
    position: '',
    mode: 'ranked',
    tier: settings.build_tier || DEFAULT_TIER,
    region: settings.build_region || DEFAULT_REGION,
    patch: '',
    loading: false,
    error: '',
    build: null,
    averageBuild: null,
    topPlayers: { loading: false, ok: false, players: [], reason: '' },
    viewingPlayer: '',
    runeStatus: 'idle',
    itemSetStatus: 'idle',
    spellStatus: 'idle',
    getChampName,
  };

  function cacheKey() {
    return `${state.championId}|${state.position}|${state.mode}|${state.tier}|${state.region}`;
  }

  // The champion list can arrive after the session does (it loads lazily and is
  // shared with team reveal). An empty name must never stick: re-resolve it
  // wherever it is about to be used.
  function refreshChampionName() {
    if (!state.championId || state.championName) return false;
    const name = getChampName(state.championId) || '';
    if (!name) return false;
    state.championName = name;
    return true;
  }

  function paint() {
    refreshChampionName();
    notify();
  }

  function setTier(value) {
    if (!value || value === state.tier) return;
    state.tier = value;
    void saveSettings({ build_tier: state.tier });
    void loadBuild();
    notify();
  }

  function setRegion(value) {
    if (!value || value === state.region) return;
    state.region = value;
    void saveSettings({ build_region: state.region });
    void loadBuild();
    notify();
  }

  function clearPlayer() {
    generation += 1;
    state.viewingPlayer = '';
    state.build = state.averageBuild;
    paint();
  }

  function applyRunes(index) {
    const page = state.build?.runePages?.[Number(index) || 0];
    if (!page) return Promise.resolve();
    return runAction('runeStatus', () =>
      applyRunePageImpl(lcu, {
        name: `${state.championName || 'Drake'} Build`,
        primaryStyleId: page.primaryStyleId,
        subStyleId: page.subStyleId,
        selectedPerkIds: page.selectedPerkIds,
      })
    );
  }

  function applySpells(index) {
    const entry = state.build?.spells?.[Number(index) || 0];
    if (!entry?.ids?.length) return Promise.resolve();
    return runAction('spellStatus', () =>
      applySummonerSpellsImpl(lcu, { spell1Id: entry.ids[0], spell2Id: entry.ids[1] })
    );
  }

  function applyItems() {
    const itemSet = buildItemSet({
      championId: state.championId,
      championName: state.championName,
      build: state.build,
    });
    if (!itemSet) return Promise.resolve();
    return runAction('itemSetStatus', () => applyItemSetImpl(lcu, getSummonerId(), itemSet));
  }

  function getSnapshot() {
    const { getChampName: _getChampName, ...rest } = state;
    const counters = [...(state.build?.counters?.strong || []), ...(state.build?.counters?.weak || [])];
    const championNames = Object.fromEntries(
      counters.map((c) => [c.championId, getChampName(Number(c.championId)) || ''])
    );
    return { ...rest, topPlayers: { ...state.topPlayers }, championNames };
  }

  async function loadBuild({ force = false } = {}) {
    ensureSettingsRead();
    if (!state.championId) {
      state.build = null;
      paint();
      return;
    }

    const key = cacheKey();
    const cached = cache.get(key);
    if (!force && cached && nowFn() - cached.at < CACHE_TTL_MS) {
      const gen = ++generation;
      state.build = cached.build;
      state.averageBuild = cached.build;
      state.patch = cached.build?.patch || '';
      state.loading = false;
      state.error = '';
      state.viewingPlayer = '';

      if (cached.topPlayers) {
        state.topPlayers = cached.topPlayers;
        paint();
        return;
      }

      paint();
      void loadTopPlayers(gen, key);
      return;
    }

    const gen = ++generation;
    state.loading = true;
    state.error = '';
    state.viewingPlayer = '';
    paint();

    try {
      await Promise.all([loadGameAssetsImpl(lcu), loadRuneAssetsImpl(lcu)]);
    } catch (err) {
      console.warn(TAG, 'asset load failed:', err?.message || err);
    }

    let json = null;
    try {
      json = await fetchChampionBuildImpl(
        {
          championId: state.championId,
          position: state.position,
          mode: state.mode,
          tier: state.tier,
          region: state.region,
        },
        { fetchFn }
      );
    } catch (err) {
      console.warn(TAG, 'build fetch failed:', err?.message || err);
    }

    if (gen !== generation) return;

    if (!json) {
      state.loading = false;
      state.error = 'Could not reach OP.GG';
      paint();
      return;
    }

    const build = normalizeChampionBuildImpl(json, { mode: state.mode });
    cache.set(key, { build, at: nowFn() });

    state.loading = false;
    state.build = build;
    state.averageBuild = build;
    state.patch = build.patch || '';
    paint();

    void loadTopPlayers(gen, key);
  }

  async function loadTopPlayers(gen, key) {
    refreshChampionName();
    state.topPlayers = { loading: true, ok: false, players: [], reason: '' };
    paint();

    const res = await fetchChampionLeaderboardImpl(
      { championName: state.championName, region: state.region === 'global' ? 'kr' : state.region },
      { fetchFn }
    );

    const topPlayers = { loading: false, ok: res.ok, players: res.data || [], reason: res.reason };

    const entry = cache.get(key);
    if (entry) entry.topPlayers = topPlayers;

    if (gen !== generation) return;
    state.topPlayers = topPlayers;
    paint();
  }

  async function handlePlayerBuild(riotId, playerRegion) {
    const gen = ++generation;
    const res = await fetchPlayerBuildImpl(
      { riotId, region: playerRegion, championId: state.championId },
      { fetchFn }
    );
    if (gen !== generation) return;

    if (!res.ok) {
      state.topPlayers = { ...state.topPlayers, reason: res.reason, ok: false };
      paint();
      return;
    }

    const base = state.averageBuild;
    state.viewingPlayer = riotId;
    state.build = {
      ...base,
      runePages: res.data.runePages?.length ? res.data.runePages : base.runePages,
      items: res.data.items?.length
        ? { ...base.items, core: [{ ids: res.data.items, winRate: null, pickRate: null, play: 0 }] }
        : base.items,
    };
    paint();
  }

  async function runAction(statusKey, fn) {
    state[statusKey] = 'applying';
    paint();
    try {
      const res = await fn();
      state[statusKey] = res?.success ? 'applied' : 'failed';
    } catch (err) {
      console.warn(TAG, 'action failed:', err?.message || err);
      state[statusKey] = 'failed';
    }
    paint();
  }

  function setSession(session) {
    const championId = Number(session?.championId) || 0;
    const position = session?.position || '';
    const mode = session?.mode === 'aram' ? 'aram' : 'ranked';

    if (championId === state.championId && position === state.position && mode === state.mode) {
      if (refreshChampionName()) {
        if (open) {
          paint();
          if (!state.topPlayers.ok && !state.topPlayers.loading) {
            void loadTopPlayers(generation, cacheKey());
          }
        } else {
          notify();
          if (state.build && !state.topPlayers.ok && !state.topPlayers.loading) {
            void loadTopPlayers(generation, cacheKey());
          }
        }
      }
      return;
    }

    state.championId = championId;
    state.championName = championId ? getChampName(championId) : '';
    state.position = position;
    state.mode = mode;
    state.viewingPlayer = '';
    state.runeStatus = 'idle';
    state.itemSetStatus = 'idle';
    state.spellStatus = 'idle';

    if (open) void loadBuild();
    else notify();
  }

  function openPanel() {
    if (!enabled || open) return;
    ensureSettingsRead();
    open = true;
    paint();
    void loadBuild();
  }

  function close() {
    if (!open) return;
    open = false;
    paint();
  }

  function destroy() {
    close();
    cache.clear();
    generation += 1;
    listeners.clear();
  }

  function getStateSig() {
    return `${state.championId}|${state.position}|${state.mode}|${state.tier}|${state.region}|${state.loading}|${state.error}|${state.patch}|${Boolean(state.build)}|${state.runeStatus}|${state.itemSetStatus}|${state.spellStatus}|${state.viewingPlayer}|${state.topPlayers.loading}|${state.topPlayers.players.length}`;
  }

  return {
    open: openPanel,
    close,
    toggle: () => (open ? close() : openPanel()),
    isOpen: () => open,
    setSession,
    setEnabled: (value) => {
      enabled = !!value;
      if (!enabled) close();
    },
    loadBuild,
    getState: () => state,
    getStateSig,
    setTier,
    setRegion,
    retry: () => loadBuild({ force: true }),
    showAllRanks: () => setTier('all'),
    viewPlayer: (riotId, region) => handlePlayerBuild(riotId, region || 'kr'),
    clearPlayer,
    applyRunes,
    applySpells,
    applyItems,
    getSnapshot,
    onUpdate: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy,
    teardown: destroy,
  };
}
