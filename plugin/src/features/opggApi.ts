import type { HttpFetch } from './proxyFetch';

const TAG = '[Drake]';

export type OpggMode = 'ranked' | 'aram';

export type OpggPosition = 'top' | 'jungle' | 'mid' | 'adc' | 'support' | 'none';

export interface OpggOption {
  value: string;
  label: string;
}

export interface ChampionBuildQuery {
  region?: string;
  mode?: string;
  championId?: number | string;
  position?: string;
  tier?: string;
  version?: string | number;
}

export interface OpggRequestOptions {
  fetchFn?: HttpFetch | null;
  timeout?: number;
}

export interface OpggStatEntry {
  ids?: (number | string)[];
  play?: number;
  win?: number;
  pick_rate?: number;
}

export interface OpggAverageStats {
  win_rate?: number;
  pick_rate?: number;
  ban_rate?: number;
  kda?: number;
  play?: number;
  tier?: number;
  rank?: number;
}

export interface OpggSummary {
  average_stats?: OpggAverageStats | null;
}

export interface OpggRuneBuild {
  primary_rune_ids?: number[];
  secondary_rune_ids?: number[];
  stat_mod_ids?: number[];
  play?: number;
  win?: number;
  pick_rate?: number;
}

export interface OpggRunePage {
  primary_page_id?: number;
  secondary_page_id?: number;
  pick_rate?: number;
  builds?: OpggRuneBuild[];
}

export interface OpggSkillBuild {
  order?: string[];
  play?: number;
  win?: number;
  pick_rate?: number;
}

export interface OpggSkillMastery {
  ids?: string[];
  builds?: OpggSkillBuild[];
  play?: number;
  win?: number;
}

export interface OpggCounter {
  champion_id?: number;
  play?: number;
  win?: number;
}

export interface OpggChampionData {
  summary?: OpggSummary | null;
  starter_items?: OpggStatEntry[];
  boots?: OpggStatEntry[];
  core_items?: OpggStatEntry[];
  last_items?: OpggStatEntry[];
  summoner_spells?: OpggStatEntry[];
  rune_pages?: OpggRunePage[];
  skill_masteries?: OpggSkillMastery[];
  counters?: OpggCounter[];
}

export interface OpggChampionResponse {
  data?: OpggChampionData | null;
  meta?: { version?: string; cached_at?: string } | null;
}

interface OpggVersionsResponse {
  data?: string[];
}

export const OPGG_BASE = 'https://lol-api-champion.op.gg';

export const DEFAULT_TIER = 'emerald_plus';
export const DEFAULT_REGION = 'global';
export const DEFAULT_MODE: OpggMode = 'ranked';

export const OPGG_MODES: readonly string[] = ['ranked', 'aram'];

export const OPGG_TIERS: OpggOption[] = [
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

export const OPGG_REGIONS: OpggOption[] = [
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

const POSITION_MAP: Record<string, OpggPosition> = {
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

export function normalizeOpggPosition(lane: string | null | undefined): OpggPosition {
  const key = String(lane || '').trim().toUpperCase();
  return POSITION_MAP[key] || 'none';
}

function normalizeMode(mode: string | null | undefined): string {
  const value = String(mode || DEFAULT_MODE).trim().toLowerCase();
  return OPGG_MODES.includes(value) ? value : DEFAULT_MODE;
}

function normalizeRegion(region: string | null | undefined): string {
  const value = String(region || DEFAULT_REGION).trim().toLowerCase();
  return OPGG_REGIONS.some((r) => r.value === value) ? value : DEFAULT_REGION;
}

function normalizeTier(tier: string | null | undefined): string {
  const value = String(tier || DEFAULT_TIER).trim().toLowerCase();
  return OPGG_TIERS.some((t) => t.value === value) ? value : DEFAULT_TIER;
}

export function buildChampionUrl({ region, mode, championId, position, tier, version }: ChampionBuildQuery = {}): string {
  const reg = normalizeRegion(region);
  const gameMode = normalizeMode(mode);
  const pos = gameMode === 'aram' ? 'none' : normalizeOpggPosition(position);
  const id = Number(championId) || 0;

  const params = new URLSearchParams();
  params.set('tier', normalizeTier(tier));
  if (version) params.set('version', String(version));

  return `${OPGG_BASE}/api/${reg}/champions/${gameMode}/${id}/${pos}?${params.toString()}`;
}

export function buildVersionsUrl({ region, mode }: Pick<ChampionBuildQuery, 'region' | 'mode'> = {}): string {
  return `${OPGG_BASE}/api/${normalizeRegion(region)}/champions/${normalizeMode(mode)}/versions`;
}

async function requestJson<T>(
  url: string,
  { fetchFn, timeout }: { fetchFn: HttpFetch | null | undefined; timeout: number },
): Promise<T | null> {
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
    return (await res.json()) as T;
  } catch (err) {
    console.warn(TAG, 'OP.GG API error:', (err as Error | null)?.message || err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchChampionBuild(
  options: ChampionBuildQuery = {},
  { fetchFn = globalThis.fetch, timeout = 8000 }: OpggRequestOptions = {},
): Promise<OpggChampionResponse | null> {
  return requestJson<OpggChampionResponse>(buildChampionUrl(options), { fetchFn, timeout });
}

export async function fetchVersions(
  options: Pick<ChampionBuildQuery, 'region' | 'mode'> = {},
  { fetchFn = globalThis.fetch, timeout = 8000 }: OpggRequestOptions = {},
): Promise<string[]> {
  const json = await requestJson<OpggVersionsResponse>(buildVersionsUrl(options), { fetchFn, timeout });
  return Array.isArray(json?.data) ? json.data : [];
}
