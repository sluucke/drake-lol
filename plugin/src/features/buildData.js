export const MIN_COUNTER_GAMES = 50;
export const COUNTER_PLAY_RATIO = 0.01;
export const COUNTER_LIMIT = 5;

const ITEM_BUCKET_LIMIT = 3;
const RUNE_PAGE_LIMIT = 3;
const SPELL_LIMIT = 3;

export const EMPTY_BUILD = Object.freeze({
  patch: '',
  cachedAt: '',
  stats: null,
  spells: [],
  items: { starter: [], boots: [], core: [], last: [] },
  runePages: [],
  skills: { masteries: [], order: [] },
  counters: { strong: [], weak: [] },
  hasData: false,
});

function toPercent(rate) {
  const num = Number(rate);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 1000) / 10;
}

function ratio(win, play) {
  const w = Number(win);
  const p = Number(play);
  if (!Number.isFinite(w) || !Number.isFinite(p) || p <= 0) return null;
  return Math.round((w / p) * 1000) / 10;
}

function toIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

function normalizeEntries(list, limit) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => ({
      ids: toIds(entry?.ids),
      play: Number(entry?.play) || 0,
      winRate: ratio(entry?.win, entry?.play),
      pickRate: toPercent(entry?.pick_rate),
    }))
    .filter((entry) => entry.ids.length > 0)
    .sort((a, b) => (b.pickRate ?? 0) - (a.pickRate ?? 0))
    .slice(0, limit);
}

function normalizeStats(summary) {
  const raw = summary?.average_stats;
  if (!raw || typeof raw !== 'object') return null;
  return {
    winRate: toPercent(raw.win_rate),
    pickRate: toPercent(raw.pick_rate),
    banRate: toPercent(raw.ban_rate),
    kda: Number.isFinite(Number(raw.kda)) ? Math.round(Number(raw.kda) * 100) / 100 : null,
    play: Number(raw.play) || 0,
    tier: Number(raw.tier) || null,
    rank: Number(raw.rank) || null,
  };
}

function normalizeRunePages(runePages) {
  if (!Array.isArray(runePages)) return [];

  // A build's own pick_rate is relative to its parent page (how often that
  // exact perk combo is chosen among players who picked this page), not
  // comparable across pages. Rank pages by the page-level pick_rate/play
  // (which IS globally comparable) and take the single most popular build
  // within each page — sorting flattened builds by their local pick_rate
  // would scramble page order (a niche page's top build can have a higher
  // local rate than a dominant page's top build).
  const pages = runePages
    .map((page) => {
      const primaryStyleId = Number(page?.primary_page_id) || 0;
      const subStyleId = Number(page?.secondary_page_id) || 0;
      const builds = Array.isArray(page?.builds) ? page.builds : [];
      const bestBuild = builds
        .slice()
        .sort((a, b) => (Number(b?.pick_rate) || 0) - (Number(a?.pick_rate) || 0))[0];
      if (!primaryStyleId || !subStyleId || !bestBuild) return null;

      const selectedPerkIds = [
        ...toIds(bestBuild?.primary_rune_ids),
        ...toIds(bestBuild?.secondary_rune_ids),
        ...toIds(bestBuild?.stat_mod_ids),
      ];
      if (selectedPerkIds.length === 0) return null;

      return {
        primaryStyleId,
        subStyleId,
        selectedPerkIds,
        play: Number(page?.play) || 0,
        winRate: ratio(page?.win, page?.play),
        pickRate: toPercent(page?.pick_rate),
      };
    })
    .filter(Boolean);

  return pages.sort((a, b) => (b.pickRate ?? 0) - (a.pickRate ?? 0)).slice(0, RUNE_PAGE_LIMIT);
}

function normalizeSkills(skillMasteries) {
  const first = Array.isArray(skillMasteries) ? skillMasteries[0] : null;
  if (!first) return { masteries: [], order: [] };

  const masteries = Array.isArray(first.ids) ? first.ids.map((s) => String(s).toUpperCase()) : [];
  const builds = Array.isArray(first.builds) ? first.builds : [];
  const best = builds
    .slice()
    .sort((a, b) => (Number(b?.pick_rate) || 0) - (Number(a?.pick_rate) || 0))[0];
  const order = Array.isArray(best?.order) ? best.order.map((s) => String(s).toUpperCase()) : [];

  return { masteries, order };
}

function normalizeCounters(counters, totalPlay) {
  if (!Array.isArray(counters) || counters.length === 0) {
    return { strong: [], weak: [] };
  }

  const floor = Math.max(MIN_COUNTER_GAMES, Math.round((Number(totalPlay) || 0) * COUNTER_PLAY_RATIO));

  const entries = counters
    .map((entry) => ({
      championId: Number(entry?.champion_id) || 0,
      play: Number(entry?.play) || 0,
      winRate: ratio(entry?.win, entry?.play),
    }))
    .filter((entry) => entry.championId > 0 && entry.winRate !== null && entry.play >= floor);

  const strong = entries
    .filter((entry) => entry.winRate >= 50)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, COUNTER_LIMIT);

  const weak = entries
    .filter((entry) => entry.winRate < 50)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, COUNTER_LIMIT);

  return { strong, weak };
}

export function normalizeChampionBuild(json, { mode = 'ranked' } = {}) {
  if (!json || typeof json !== 'object') return EMPTY_BUILD;

  const data = json.data;
  if (!data || typeof data !== 'object') return EMPTY_BUILD;

  const stats = normalizeStats(data.summary);
  const items = {
    starter: normalizeEntries(data.starter_items, ITEM_BUCKET_LIMIT),
    boots: normalizeEntries(data.boots, ITEM_BUCKET_LIMIT),
    core: normalizeEntries(data.core_items, ITEM_BUCKET_LIMIT),
    last: normalizeEntries(data.last_items, 12),
  };
  const spells = normalizeEntries(data.summoner_spells, SPELL_LIMIT);
  const runePages = normalizeRunePages(data.rune_pages);
  const skills = normalizeSkills(data.skill_masteries);
  const counters = mode === 'aram' ? { strong: [], weak: [] } : normalizeCounters(data.counters, stats?.play);

  const hasData = Boolean(
    stats ||
      spells.length ||
      runePages.length ||
      skills.masteries.length ||
      items.core.length ||
      items.starter.length
  );

  return {
    patch: String(json.meta?.version || ''),
    cachedAt: String(json.meta?.cached_at || ''),
    stats,
    spells,
    items,
    runePages,
    skills,
    counters,
    hasData,
  };
}
