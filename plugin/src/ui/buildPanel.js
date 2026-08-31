import { fetchChampionBuild, DEFAULT_TIER, DEFAULT_REGION } from '../features/opggApi.js';
import { normalizeChampionBuild } from '../features/buildData.js';
import { fetchChampionLeaderboard, fetchPlayerBuild } from '../features/topPlayers.js';
import { loadGameAssets } from '../features/gameAssets.js';
import { applyRunePage } from '../features/runes.js';
import { buildItemSet, applyItemSet, applySummonerSpells } from '../features/itemSets.js';
import { renderBuildPanel } from './buildPanelRender.js';

const TAG = '[Drake]';
export const CACHE_TTL_MS = 10 * 60 * 1000;

export function makeBuildPanel({
  doc,
  overlayRoot,
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
  nowFn = () => Date.now(),
} = {}) {
  const settings = getSettings() || {};

  let open = false;
  let enabled = true;
  let overlay = null;
  let generation = 0;
  let hasOpenedOnce = false;

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

  function ensureOverlay() {
    if (overlay) return overlay;
    const owner = overlayRoot?.ownerDocument || doc;
    const node = owner?.createElement?.('div');
    if (!node) return null;
    node.className = 'build-overlay';
    node.hidden = true;
    if (node.style) node.style.display = 'none';
    overlayRoot?.appendChild?.(node);
    overlay = node;
    wireEvents(node);
    return node;
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
    const node = ensureOverlay();
    if (!node) return;
    refreshChampionName();
    node.hidden = !open;
    if (node.style) node.style.display = open ? 'flex' : 'none';
    if (open) node.innerHTML = renderBuildPanel(state);
  }

  async function loadBuild({ force = false } = {}) {
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
      await loadGameAssetsImpl(lcu);
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

  function wireEvents(node) {
    if (!node?.addEventListener || node.dataset?.drakeBuildWired === '1') return;
    if (node.dataset) node.dataset.drakeBuildWired = '1';

    node.addEventListener('change', (event) => {
      const target = event.target;
      if (target?.matches?.('[data-build-tier]') || target?.dataset?.buildTier !== undefined) {
        state.tier = target.value;
        void saveSettings({ build_tier: state.tier });
        void loadBuild();
        return;
      }
      if (target?.matches?.('[data-build-region]') || target?.dataset?.buildRegion !== undefined) {
        state.region = target.value;
        void saveSettings({ build_region: state.region });
        void loadBuild();
      }
    });

    node.addEventListener('click', (event) => {
      const target = event.target;
      const hit = (attr) => target?.closest?.(`[${attr}]`);

      if (hit('data-build-close')) {
        event.stopPropagation?.();
        close();
        return;
      }
      if (hit('data-build-retry')) {
        event.stopPropagation?.();
        void loadBuild({ force: true });
        return;
      }
      if (hit('data-build-tier-all')) {
        event.stopPropagation?.();
        state.tier = 'all';
        void saveSettings({ build_tier: 'all' });
        void loadBuild();
        return;
      }
      if (hit('data-build-clear-player')) {
        event.stopPropagation?.();
        generation += 1;
        state.viewingPlayer = '';
        state.build = state.averageBuild;
        paint();
        return;
      }

      const playerBtn = hit('data-build-player');
      if (playerBtn) {
        event.stopPropagation?.();
        void handlePlayerBuild(
          playerBtn.dataset.buildPlayer,
          playerBtn.dataset.buildPlayerRegion || 'kr'
        );
        return;
      }

      const runeBtn = hit('data-build-apply-runes');
      if (runeBtn) {
        event.stopPropagation?.();
        const page = state.build?.runePages?.[Number(runeBtn.dataset.buildApplyRunes) || 0];
        if (!page) return;
        void runAction('runeStatus', () =>
          applyRunePageImpl(lcu, {
            name: `${state.championName || 'Drake'} Build`,
            primaryStyleId: page.primaryStyleId,
            subStyleId: page.subStyleId,
            selectedPerkIds: page.selectedPerkIds,
          })
        );
        return;
      }

      const spellBtn = hit('data-build-apply-spells');
      if (spellBtn) {
        event.stopPropagation?.();
        const entry = state.build?.spells?.[Number(spellBtn.dataset.buildApplySpells) || 0];
        if (!entry?.ids?.length) return;
        void runAction('spellStatus', () =>
          applySummonerSpellsImpl(lcu, { spell1Id: entry.ids[0], spell2Id: entry.ids[1] })
        );
        return;
      }

      if (hit('data-build-apply-items')) {
        event.stopPropagation?.();
        const itemSet = buildItemSet({
          championId: state.championId,
          championName: state.championName,
          build: state.build,
        });
        if (!itemSet) return;
        void runAction('itemSetStatus', () => applyItemSetImpl(lcu, getSummonerId(), itemSet));
      }
    });
  }

  function setSession(session) {
    const championId = Number(session?.championId) || 0;
    const position = session?.position || '';
    const mode = session?.mode === 'aram' ? 'aram' : 'ranked';

    if (championId === state.championId && position === state.position && mode === state.mode) {
      // Same session, but the champion list may have loaded in the meantime.
      if (refreshChampionName() && open) {
        paint();
        if (!state.topPlayers.ok && !state.topPlayers.loading) {
          void loadTopPlayers(generation, cacheKey());
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
  }

  function openPanel() {
    if (!enabled || open) return;
    // Re-read settings on every open so a save made elsewhere (e.g. a
    // settings reload after construction) reaches the panel. Only seed
    // state.tier/state.region from it the first time this panel instance
    // opens -- after that, a mid-session dropdown change is a live user
    // choice and must not be clobbered by a stale settings read.
    if (!hasOpenedOnce) {
      hasOpenedOnce = true;
      const fresh = getSettings() || {};
      state.tier = fresh.build_tier || state.tier;
      state.region = fresh.build_region || state.region;
    }
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
    destroy,
  };
}
