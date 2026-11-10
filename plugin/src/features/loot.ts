import type { Lcu } from '../lcu';
import { gameDataUrl } from './assetUrl';
import { iconUrl, loadChampions } from './champions';
import { SKINS_ROUTE, searchSkins } from './skins';

export const PLAYER_LOOT_ROUTE = '/lol-loot/v1/player-loot';
export const RECIPES_ROUTE = '/lol-loot/v1/recipes';
export const DISENCHANT_DELAY_MS = 250;

export type LootCategory = 'champion' | 'skin';

export type LootKind = 'championShard' | 'championPermanent' | 'skinShard' | 'skinPermanent';

export type Essence = 'blue' | 'orange';

export const LOOT_CATEGORIES: readonly LootCategory[] = ['champion', 'skin'];

export const LOOT_KINDS: readonly LootKind[] = ['championShard', 'championPermanent', 'skinShard', 'skinPermanent'];

export const RARITIES = ['standard', 'epic', 'legendary', 'mythic', 'ultimate', 'transcendent', 'exalted', 'other'] as const;

export type Rarity = (typeof RARITIES)[number];

export type RarityFilter = Rarity | 'all';

export interface LootItem {
  lootId: string;
  lootType: string;
  kind: LootKind;
  category: LootCategory;
  shard: boolean;
  name: string;
  count: number;
  value: number;
  essence: Essence;
  owned: boolean;
  rarity: Rarity;
  legacy: boolean;
  storeItemId: number;
  championId: number;
  tile: string;
}

export interface SkinMeta {
  id: number;
  name: string;
  legacy: boolean;
  rarity: Rarity;
  tilePath: string;
}

export interface LootLookups {
  skins?: ReadonlyMap<number, SkinMeta>;
  champions?: ReadonlyMap<number, string>;
}

export interface LootFilters {
  query: string;
  ownedOnly: boolean;
  includePermanents: boolean;
  legacyOnly: boolean;
  rarity: RarityFilter;
}

export interface EssenceTotals {
  blue: number;
  orange: number;
  items: number;
  copies: number;
}

export interface DisenchantEntry {
  item: LootItem;
  repeat: number;
}

export type DisenchantFailureReason = 'noRecipe' | 'refused' | 'network';

export interface DisenchantFailure extends DisenchantEntry {
  reason: DisenchantFailureReason;
  status?: number;
}

export interface DisenchantProgress {
  index: number;
  total: number;
  item: LootItem;
}

export interface DisenchantResult {
  done: DisenchantEntry[];
  failed: DisenchantFailure[];
  skipped: DisenchantEntry[];
  cancelled: boolean;
  gained: EssenceTotals;
  inventory: LootItem[] | null;
}

export interface DisenchantOptions {
  signal?: AbortSignal;
  onProgress?: (progress: DisenchantProgress) => void;
}

export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

export type RecipeResolver = (item: Pick<LootItem, 'lootId' | 'lootType'>) => Promise<string | null>;

export interface RunDisenchantOptions extends DisenchantOptions {
  lcu: Pick<Lcu, 'post'>;
  plan: readonly DisenchantEntry[];
  resolveRecipe: RecipeResolver;
  reload?: () => Promise<LootItem[]>;
  delayMs?: number;
  sleep?: SleepFn;
}

export interface LootAnchor {
  top: number;
  right: number;
}

export interface LootService {
  load(): Promise<LootItem[]>;
  disenchant(plan: readonly DisenchantEntry[], options?: DisenchantOptions): Promise<DisenchantResult>;
}

export interface LootServiceOptions {
  lcu: Pick<Lcu, 'get' | 'post'>;
  delayMs?: number;
  sleep?: SleepFn;
}

export class LootLoadError extends Error {
  constructor(message = 'the loot inventory is unavailable') {
    super(message);
    this.name = 'LootLoadError';
  }
}

export const DEFAULT_FILTERS: Readonly<Record<LootCategory, LootFilters>> = {
  champion: { query: '', ownedOnly: true, includePermanents: false, legacyOnly: false, rarity: 'all' },
  skin: { query: '', ownedOnly: false, includePermanents: false, legacyOnly: false, rarity: 'all' },
};

export const EMPTY_TOTALS: Readonly<EssenceTotals> = { blue: 0, orange: 0, items: 0, copies: 0 };

const KIND_BY_TYPE: ReadonlyMap<string, LootKind> = new Map([
  ['CHAMPION_RENTAL', 'championShard'],
  ['CHAMPION', 'championPermanent'],
  ['SKIN_RENTAL', 'skinShard'],
  ['SKIN', 'skinPermanent'],
]);

const ESSENCE_BY_CURRENCY: ReadonlyMap<string, Essence> = new Map([
  ['CURRENCY_champion', 'blue'],
  ['CURRENCY_cosmetic', 'orange'],
]);

const STANDARD_RARITIES = new Set(['', 'default', 'norarity', 'none', 'standard']);

const KNOWN_RARITIES: ReadonlySet<string> = new Set(RARITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numeric(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function normalizeRarity(raw: unknown): Rarity {
  const key = text(raw).replace(/^k(?=[A-Z])/, '').toLowerCase();
  if (STANDARD_RARITIES.has(key)) return 'standard';
  return KNOWN_RARITIES.has(key) ? (key as Rarity) : 'other';
}

export function parseLootAnchor(raw: unknown): LootAnchor | null {
  if (!isRecord(raw)) return null;
  const { top, right } = raw;
  if (typeof top !== 'number' || typeof right !== 'number' || !Number.isFinite(top) || !Number.isFinite(right)) return null;
  return { top: Math.round(top), right: Math.round(right) };
}

export function sameLootAnchor(a: LootAnchor | null | undefined, b: LootAnchor | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.top === b.top && a.right === b.right;
}

export function classifyLoot(type: unknown): LootKind | null {
  return KIND_BY_TYPE.get(text(type)) ?? null;
}

export function categoryOf(kind: LootKind): LootCategory {
  return kind === 'championShard' || kind === 'championPermanent' ? 'champion' : 'skin';
}

export function isShard(kind: LootKind): boolean {
  return kind === 'championShard' || kind === 'skinShard';
}

export function parseSkinMeta(raw: unknown): Map<number, SkinMeta> {
  const out = new Map<number, SkinMeta>();
  const entries = Array.isArray(raw) ? raw : isRecord(raw) ? Object.values(raw) : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const id = numeric(entry.id);
    if (id <= 0) continue;
    out.set(id, {
      id,
      name: text(entry.name),
      legacy: entry.isLegacy === true,
      rarity: normalizeRarity(entry.rarity),
      tilePath: text(entry.tilePath),
    });
  }
  return out;
}

function pickTile(rawPath: string, category: LootCategory, storeItemId: number, skin: SkinMeta | undefined): string {
  if (rawPath) return gameDataUrl(rawPath);
  if (category === 'champion' && storeItemId > 0) return iconUrl(storeItemId);
  if (skin?.tilePath) return gameDataUrl(skin.tilePath);
  return '';
}

export function normalizeLootItem(raw: unknown, { skins, champions }: LootLookups = {}): LootItem | null {
  if (!isRecord(raw)) return null;
  const lootId = text(raw.lootId);
  const lootType = text(raw.type);
  const kind = classifyLoot(lootType);
  const count = Math.floor(numeric(raw.count));
  if (!lootId || !kind || count <= 0) return null;
  const category = categoryOf(kind);
  const storeItemId = numeric(raw.storeItemId);
  const skin = category === 'skin' ? skins?.get(storeItemId) : undefined;
  const fallbackName = category === 'champion' ? champions?.get(storeItemId) : skin?.name;
  const name = text(raw.itemDesc) || text(raw.localizedName) || fallbackName || text(raw.lootName) || lootId;
  const lootRarity = normalizeRarity(raw.rarity);
  return {
    lootId,
    lootType,
    kind,
    category,
    shard: isShard(kind),
    name,
    count,
    value: Math.max(0, numeric(raw.disenchantValue)),
    essence: ESSENCE_BY_CURRENCY.get(text(raw.disenchantLootName)) ?? (category === 'champion' ? 'blue' : 'orange'),
    owned: text(raw.itemStatus) === 'OWNED',
    rarity: skin && skin.rarity !== 'standard' ? skin.rarity : lootRarity,
    legacy: !!skin?.legacy,
    storeItemId,
    championId: category === 'champion' ? storeItemId : numeric(raw.parentStoreItemId),
    tile: pickTile(text(raw.tilePath), category, storeItemId, skin),
  };
}

export function normalizeLoot(raw: unknown, lookups: LootLookups = {}): LootItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeLootItem(entry, lookups))
    .filter((item): item is LootItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name) || a.lootId.localeCompare(b.lootId));
}

export function disenchantCount(item: Pick<LootItem, 'count'>, keepOne: boolean): number {
  return Math.max(0, item.count - (keepOne ? 1 : 0));
}

export function filterLoot(
  items: readonly LootItem[],
  category: LootCategory,
  filters: LootFilters,
  keepOne: boolean,
): LootItem[] {
  const skins = category === 'skin';
  const matching = items.filter(
    (item) =>
      item.category === category &&
      (filters.includePermanents || item.shard) &&
      (!filters.ownedOnly || item.owned) &&
      (!skins || !filters.legacyOnly || item.legacy) &&
      (!skins || filters.rarity === 'all' || item.rarity === filters.rarity) &&
      disenchantCount(item, keepOne) > 0,
  );
  return searchSkins(matching, filters.query);
}

export function buildPlan(items: readonly LootItem[], keepOne: boolean): DisenchantEntry[] {
  return items
    .map((item) => ({ item, repeat: disenchantCount(item, keepOne) }))
    .filter((entry) => entry.repeat > 0);
}

export function planTotals(plan: readonly DisenchantEntry[]): EssenceTotals {
  return plan.reduce<EssenceTotals>(
    (totals, { item, repeat }) => ({
      ...totals,
      [item.essence]: totals[item.essence] + item.value * repeat,
      items: totals.items + 1,
      copies: totals.copies + repeat,
    }),
    { ...EMPTY_TOTALS },
  );
}

export function computeTotals(items: readonly LootItem[], keepOne: boolean): EssenceTotals {
  return planTotals(buildPlan(items, keepOne));
}

export function recipesRoute(lootId: string): string {
  return `${RECIPES_ROUTE}/initial-item/${encodeURIComponent(lootId)}`;
}

export function craftRoute(recipeName: string, repeat: number): string {
  return `${RECIPES_ROUTE}/${encodeURIComponent(recipeName)}/craft?repeat=${repeat}`;
}

export function pickDisenchantRecipe(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const recipes = raw.filter(isRecord).map((r) => ({ name: text(r.recipeName), type: text(r.type).toUpperCase() }));
  const named = recipes.filter((r) => r.name);
  const match = named.find((r) => r.type === 'DISENCHANT') || named.find((r) => r.name.toLowerCase().endsWith('_disenchant'));
  return match ? match.name : null;
}

export function makeRecipeResolver(lcu: Pick<Lcu, 'get'>): RecipeResolver {
  const cache = new Map<string, string>();
  return async ({ lootId, lootType }) => {
    const cached = cache.get(lootType);
    if (cached) return cached;
    const recipe = pickDisenchantRecipe(await lcu.get<unknown>(recipesRoute(lootId)));
    if (recipe && lootType) cache.set(lootType, recipe);
    return recipe;
  };
}

export const sleep: SleepFn = (ms, signal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });

async function craft(
  lcu: Pick<Lcu, 'post'>,
  entry: DisenchantEntry,
  resolveRecipe: RecipeResolver,
): Promise<DisenchantFailure | null> {
  let recipe: string | null;
  try {
    recipe = await resolveRecipe(entry.item);
  } catch {
    return { ...entry, reason: 'network' };
  }
  if (!recipe) return { ...entry, reason: 'noRecipe' };
  try {
    const res = await lcu.post(craftRoute(recipe, entry.repeat), [entry.item.lootId]);
    if (res && res.ok === false) return { ...entry, reason: 'refused', status: res.status };
    return null;
  } catch {
    return { ...entry, reason: 'network' };
  }
}

export async function runDisenchant({
  lcu,
  plan,
  resolveRecipe,
  reload,
  signal,
  onProgress,
  delayMs = DISENCHANT_DELAY_MS,
  sleep: wait = sleep,
}: RunDisenchantOptions): Promise<DisenchantResult> {
  const done: DisenchantEntry[] = [];
  const failed: DisenchantFailure[] = [];
  let index = 0;
  for (; index < plan.length; index += 1) {
    if (signal?.aborted) break;
    if (index > 0) {
      await wait(delayMs, signal);
      if (signal?.aborted) break;
    }
    const entry = plan[index];
    onProgress?.({ index, total: plan.length, item: entry.item });
    const failure = await craft(lcu, entry, resolveRecipe);
    if (failure) failed.push(failure);
    else done.push(entry);
  }
  let inventory: LootItem[] | null = null;
  if (reload) {
    try {
      inventory = await reload();
    } catch {
      inventory = null;
    }
  }
  return {
    done,
    failed,
    skipped: plan.slice(index),
    cancelled: index < plan.length,
    gained: planTotals(done),
    inventory,
  };
}

async function loadSkinMeta(lcu: Pick<Lcu, 'get'>): Promise<Map<number, SkinMeta>> {
  try {
    return parseSkinMeta(await lcu.get<unknown>(SKINS_ROUTE));
  } catch {
    return new Map();
  }
}

async function loadChampionNames(lcu: Pick<Lcu, 'get'>): Promise<Map<number, string>> {
  return new Map((await loadChampions(lcu)).map((c) => [c.id, c.name]));
}

export async function loadLoot(lcu: Pick<Lcu, 'get'>, lookups?: () => Promise<LootLookups>): Promise<LootItem[]> {
  const [raw, extra] = await Promise.all([
    lcu.get<unknown>(PLAYER_LOOT_ROUTE),
    lookups ? lookups() : Promise.all([loadSkinMeta(lcu), loadChampionNames(lcu)]).then(([skins, champions]) => ({ skins, champions })),
  ]);
  if (!Array.isArray(raw)) throw new LootLoadError();
  return normalizeLoot(raw, extra);
}

export function makeLootService({ lcu, delayMs, sleep: wait }: LootServiceOptions): LootService {
  const resolveRecipe = makeRecipeResolver(lcu);
  let skins: Map<number, SkinMeta> | null = null;
  let champions: Map<number, string> | null = null;

  const lookups = async (): Promise<LootLookups> => {
    const [nextSkins, nextChampions] = await Promise.all([
      skins ?? loadSkinMeta(lcu),
      champions ?? loadChampionNames(lcu),
    ]);
    if (nextSkins.size) skins = nextSkins;
    if (nextChampions.size) champions = nextChampions;
    return { skins: nextSkins, champions: nextChampions };
  };

  const load = () => loadLoot(lcu, lookups);

  return {
    load,
    disenchant: (plan, options = {}) =>
      runDisenchant({ lcu, plan, resolveRecipe, reload: load, delayMs, sleep: wait, ...options }),
  };
}
