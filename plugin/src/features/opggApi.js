const TAG = '[Drake]';

export const OPGG_BASE = 'https://lol-api-champion.op.gg';

export const DEFAULT_TIER = 'emerald_plus';
export const DEFAULT_REGION = 'global';
export const DEFAULT_MODE = 'ranked';

export const OPGG_MODES = ['ranked', 'aram'];

export const OPGG_TIERS = [
  { value: 'all', label: 'All Ranks' },
  { value: 'ibsg', label: 'Iron–Silver' },
  { value: 'gold_plus', label: 'Gold+' },
  { value: 'platinum_plus', label: 'Platinum+' },
  { value: 'emerald_plus', label: 'Emerald+' },
  { value: 'diamond_plus', label: 'Diamond+' },
  { value: 'master', label: 'Master' },
  { value: 'grandmaster', label: 'Grandmaster' },
  { value: 'challenger', label: 'Challenger' },
];

export const OPGG_REGIONS = [
  { value: 'global', label: 'Global' },
  { value: 'br', label: 'BR' },
  { value: 'na', label: 'NA' },
  { value: 'euw', label: 'EUW' },
  { value: 'eune', label: 'EUNE' },
  { value: 'kr', label: 'KR' },
  { value: 'jp', label: 'JP' },
  { value: 'lan', label: 'LAN' },
  { value: 'las', label: 'LAS' },
  { value: 'oce', label: 'OCE' },
  { value: 'tr', label: 'TR' },
  { value: 'ru', label: 'RU' },
  { value: 'vn', label: 'VN' },
];

const POSITION_MAP = {
  TOP: 'top',
  JUNGLE: 'jungle',
  JG: 'jungle',
  MID: 'mid',
  MIDDLE: 'mid',
  ADC: 'adc',
  BOTTOM: 'adc',
  BOT: 'adc',
  SUPPORT: 'support',
  UTILITY: 'support',
  SUPP: 'support',
  SUP: 'support',
};

export function normalizeOpggPosition(lane) {
  const key = String(lane || '').trim().toUpperCase();
  return POSITION_MAP[key] || 'none';
}

function normalizeMode(mode) {
  const value = String(mode || DEFAULT_MODE).trim().toLowerCase();
  return OPGG_MODES.includes(value) ? value : DEFAULT_MODE;
}

function normalizeRegion(region) {
  const value = String(region || DEFAULT_REGION).trim().toLowerCase();
  return OPGG_REGIONS.some((r) => r.value === value) ? value : DEFAULT_REGION;
}

function normalizeTier(tier) {
  const value = String(tier || DEFAULT_TIER).trim().toLowerCase();
  return OPGG_TIERS.some((t) => t.value === value) ? value : DEFAULT_TIER;
}

export function buildChampionUrl({ region, mode, championId, position, tier, version } = {}) {
  const reg = normalizeRegion(region);
  const gameMode = normalizeMode(mode);
  const pos = gameMode === 'aram' ? 'none' : normalizeOpggPosition(position);
  const id = Number(championId) || 0;

  const params = new URLSearchParams();
  params.set('tier', normalizeTier(tier));
  if (version) params.set('version', String(version));

  return `${OPGG_BASE}/api/${reg}/champions/${gameMode}/${id}/${pos}?${params.toString()}`;
}

export function buildVersionsUrl({ region, mode } = {}) {
  return `${OPGG_BASE}/api/${normalizeRegion(region)}/champions/${normalizeMode(mode)}/versions`;
}

async function requestJson(url, { fetchFn, timeout }) {
  if (typeof fetchFn !== 'function') return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res || !res.ok) {
      console.warn(TAG, `OP.GG API returned ${res?.status} for ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(TAG, 'OP.GG API error:', err?.message || err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchChampionBuild(options = {}, { fetchFn = globalThis.fetch, timeout = 8000 } = {}) {
  return requestJson(buildChampionUrl(options), { fetchFn, timeout });
}

export async function fetchVersions(options = {}, { fetchFn = globalThis.fetch, timeout = 8000 } = {}) {
  const json = await requestJson(buildVersionsUrl(options), { fetchFn, timeout });
  return Array.isArray(json?.data) ? json.data : [];
}
