import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_FILTERS,
  LootLoadError,
  PLAYER_LOOT_ROUTE,
  buildPlan,
  classifyLoot,
  computeTotals,
  craftRoute,
  filterLoot,
  loadLoot,
  makeLootService,
  makeRecipeResolver,
  normalizeLoot,
  normalizeRarity,
  parseSkinMeta,
  pickDisenchantRecipe,
  planTotals,
  recipesRoute,
  runDisenchant,
  sleep,
} from '../src/features/loot';
import type { LootFilters, LootItem, RecipeResolver } from '../src/features/loot';
import { SKINS_ROUTE } from '../src/features/skins';
import { SUMMARY_ROUTE } from '../src/features/champions';
import type { Lcu } from '../src/lcu';

const RAW_LOOT = [
  {
    lootId: 'CHAMPION_RENTAL_103',
    type: 'CHAMPION_RENTAL',
    itemDesc: 'Ahri',
    count: 2,
    disenchantValue: 1260,
    disenchantLootName: 'CURRENCY_champion',
    itemStatus: 'OWNED',
    storeItemId: 103,
    tilePath: '/lol-game-data/assets/v1/champion-tiles/103/103000.jpg',
  },
  {
    lootId: 'CHAMPION_RENTAL_1',
    type: 'CHAMPION_RENTAL',
    count: 1,
    disenchantValue: 90,
    disenchantLootName: 'CURRENCY_champion',
    itemStatus: 'NONE',
    storeItemId: 1,
  },
  {
    lootId: 'CHAMPION_22',
    type: 'CHAMPION',
    localizedName: 'Ashe',
    count: 1,
    disenchantValue: 450,
    itemStatus: 'OWNED',
    storeItemId: 22,
  },
  {
    lootId: 'CHAMPION_SKIN_RENTAL_1001',
    type: 'SKIN_RENTAL',
    itemDesc: 'Goth Annie',
    count: 3,
    disenchantValue: 156,
    disenchantLootName: 'CURRENCY_cosmetic',
    itemStatus: 'NONE',
    rarity: 'DEFAULT',
    storeItemId: 1001,
    parentStoreItemId: 1,
  },
  {
    lootId: 'CHAMPION_SKIN_RENTAL_103015',
    type: 'SKIN_RENTAL',
    itemDesc: 'Spirit Blossom Ahri',
    count: 1,
    disenchantValue: 270,
    disenchantLootName: 'CURRENCY_cosmetic',
    itemStatus: 'OWNED',
    storeItemId: 103015,
    parentStoreItemId: 103,
  },
  {
    lootId: 'CHAMPION_SKIN_103001',
    type: 'SKIN',
    itemDesc: 'Dynasty Ahri',
    count: 1,
    disenchantValue: 300,
    itemStatus: 'NONE',
    storeItemId: 103001,
    parentStoreItemId: 103,
  },
  { lootId: 'CURRENCY_champion', type: 'CURRENCY', count: 5000 },
  { lootId: 'WARD_SKIN_RENTAL_1', type: 'WARDSKIN_RENTAL', count: 1 },
  { lootId: '', type: 'CHAMPION_RENTAL', count: 1 },
  { lootId: 'CHAMPION_RENTAL_2', type: 'CHAMPION_RENTAL', count: 0 },
  null,
  'junk',
];

const RAW_SKINS = {
  1001: { id: 1001, name: 'Goth Annie', isLegacy: true, rarity: 'kNoRarity', tilePath: '/lol-game-data/assets/annie_1.jpg' },
  103015: { id: 103015, name: 'Spirit Blossom Ahri', isLegacy: false, rarity: 'kLegendary' },
  103001: { id: 103001, name: 'Dynasty Ahri', isLegacy: false, rarity: 'kEpic' },
};

const CHAMPIONS = [
  { id: 1, name: 'Annie', alias: 'Annie' },
  { id: 22, name: 'Ashe', alias: 'Ashe' },
  { id: 103, name: 'Ahri', alias: 'Ahri' },
];

function lookups() {
  return { skins: parseSkinMeta(RAW_SKINS), champions: new Map(CHAMPIONS.map((c) => [c.id, c.name])) };
}

function items(): LootItem[] {
  return normalizeLoot(RAW_LOOT, lookups());
}

function byId(list: LootItem[], lootId: string): LootItem {
  const found = list.find((item) => item.lootId === lootId);
  if (!found) throw new Error(`missing ${lootId}`);
  return found;
}

function filters(category: 'champion' | 'skin', patch: Partial<LootFilters> = {}): LootFilters {
  return { ...DEFAULT_FILTERS[category], ...patch };
}

function okResponse() {
  return new Response(null, { status: 204 });
}

interface FakeOptions {
  routes?: Record<string, unknown>;
  failGet?: string[];
  post?: (route: string, body: unknown) => Promise<Response>;
}

function fakeLcu({ routes = {}, failGet = [], post }: FakeOptions = {}) {
  const get = vi.fn(async (route: string) => {
    if (failGet.includes(route)) throw new Error('offline');
    return routes[route] ?? null;
  });
  const postFn = vi.fn(post ?? (async () => okResponse()));
  const lcu = {
    get: <T>(route: string) => get(route) as Promise<T>,
    post: (route: string, body?: unknown) => postFn(route, body),
  } satisfies Pick<Lcu, 'get' | 'post'>;
  return { lcu, get, post: postFn };
}

const DISENCHANT_RECIPES = [
  { recipeName: 'CHAMPION_RENTAL_upgrade', type: 'UPGRADE' },
  { recipeName: 'CHAMPION_RENTAL_disenchant', type: 'DISENCHANT' },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('classifyLoot', () => {
  it('maps the four champion and skin loot types', () => {
    expect(classifyLoot('CHAMPION_RENTAL')).toBe('championShard');
    expect(classifyLoot('CHAMPION')).toBe('championPermanent');
    expect(classifyLoot('SKIN_RENTAL')).toBe('skinShard');
    expect(classifyLoot('SKIN')).toBe('skinPermanent');
  });

  it('ignores every other type', () => {
    expect(classifyLoot('CURRENCY')).toBeNull();
    expect(classifyLoot('WARDSKIN_RENTAL')).toBeNull();
    expect(classifyLoot(undefined)).toBeNull();
  });
});

describe('normalizeRarity', () => {
  it('reads both the skins.json and the loot spellings', () => {
    expect(normalizeRarity('kEpic')).toBe('epic');
    expect(normalizeRarity('LEGENDARY')).toBe('legendary');
    expect(normalizeRarity('kNoRarity')).toBe('standard');
    expect(normalizeRarity('DEFAULT')).toBe('standard');
    expect(normalizeRarity(undefined)).toBe('standard');
    expect(normalizeRarity('kSomethingNew')).toBe('other');
  });
});

describe('normalizeLoot', () => {
  it('keeps only valid champion and skin items, sorted by name', () => {
    expect(items().map((item) => item.lootId)).toEqual([
      'CHAMPION_RENTAL_103',
      'CHAMPION_RENTAL_1',
      'CHAMPION_22',
      'CHAMPION_SKIN_103001',
      'CHAMPION_SKIN_RENTAL_1001',
      'CHAMPION_SKIN_RENTAL_103015',
    ]);
  });

  it('classifies, prices and marks ownership', () => {
    const ahri = byId(items(), 'CHAMPION_RENTAL_103');
    expect(ahri).toMatchObject({
      kind: 'championShard',
      category: 'champion',
      shard: true,
      name: 'Ahri',
      count: 2,
      value: 1260,
      essence: 'blue',
      owned: true,
      championId: 103,
      tile: '/lol-game-data/assets/v1/champion-tiles/103/103000.jpg',
    });
    const ashe = byId(items(), 'CHAMPION_22');
    expect(ashe).toMatchObject({ kind: 'championPermanent', shard: false, name: 'Ashe', essence: 'blue' });
    const goth = byId(items(), 'CHAMPION_SKIN_RENTAL_1001');
    expect(goth).toMatchObject({ kind: 'skinShard', category: 'skin', essence: 'orange', owned: false, championId: 1 });
  });

  it('falls back to the champion summary for a missing name and to the champion icon for a missing tile', () => {
    const annie = byId(items(), 'CHAMPION_RENTAL_1');
    expect(annie.name).toBe('Annie');
    expect(annie.tile).toBe('/lol-game-data/assets/v1/champion-icons/1.png');
  });

  it('joins legacy and rarity from skins.json', () => {
    const list = items();
    expect(byId(list, 'CHAMPION_SKIN_RENTAL_1001')).toMatchObject({ legacy: true, rarity: 'standard', tile: '/lol-game-data/assets/annie_1.jpg' });
    expect(byId(list, 'CHAMPION_SKIN_RENTAL_103015')).toMatchObject({ legacy: false, rarity: 'legendary' });
    expect(byId(list, 'CHAMPION_SKIN_103001')).toMatchObject({ rarity: 'epic', kind: 'skinPermanent' });
  });

  it('works without lookups and on garbage', () => {
    expect(normalizeLoot(RAW_LOOT).find((item) => item.lootId === 'CHAMPION_SKIN_RENTAL_1001')?.legacy).toBe(false);
    expect(normalizeLoot(null)).toEqual([]);
    expect(normalizeLoot({ lootId: 'x' })).toEqual([]);
  });

  it('routes asset paths through the asset proxy when one is set', () => {
    globalThis.__DRAKE_ASSET_PROXY__ = 'http://127.0.0.1:1/asset?p=';
    try {
      const ahri = byId(items(), 'CHAMPION_RENTAL_103');
      expect(ahri.tile.startsWith('http://127.0.0.1:1/asset?p=')).toBe(true);
    } finally {
      delete globalThis.__DRAKE_ASSET_PROXY__;
    }
  });
});

describe('filterLoot', () => {
  it('defaults to owned champion shards only', () => {
    expect(filterLoot(items(), 'champion', filters('champion'), false).map((i) => i.lootId)).toEqual(['CHAMPION_RENTAL_103']);
  });

  it('can include unowned champions and permanents', () => {
    const list = filterLoot(items(), 'champion', filters('champion', { ownedOnly: false, includePermanents: true }), false);
    expect(list.map((i) => i.lootId)).toEqual(['CHAMPION_RENTAL_103', 'CHAMPION_RENTAL_1', 'CHAMPION_22']);
  });

  it('filters skins by legacy, rarity and ownership', () => {
    const all = items();
    expect(filterLoot(all, 'skin', filters('skin'), false).map((i) => i.lootId)).toEqual([
      'CHAMPION_SKIN_RENTAL_1001',
      'CHAMPION_SKIN_RENTAL_103015',
    ]);
    expect(filterLoot(all, 'skin', filters('skin', { legacyOnly: true }), false).map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_RENTAL_1001']);
    expect(filterLoot(all, 'skin', filters('skin', { rarity: 'legendary' }), false).map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_RENTAL_103015']);
    expect(filterLoot(all, 'skin', filters('skin', { ownedOnly: true }), false).map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_RENTAL_103015']);
    expect(filterLoot(all, 'skin', filters('skin', { includePermanents: true, rarity: 'epic' }), false).map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_103001']);
  });

  it('searches by name ignoring case and accents', () => {
    const list = filterLoot(items(), 'skin', filters('skin', { query: 'SPÍRIT' }), false);
    expect(list.map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_RENTAL_103015']);
  });

  it('hides items with nothing left to disenchant when keeping one', () => {
    const list = filterLoot(items(), 'skin', filters('skin'), true);
    expect(list.map((i) => i.lootId)).toEqual(['CHAMPION_SKIN_RENTAL_1001']);
  });
});

describe('totals', () => {
  it('sums blue and orange essence over every copy', () => {
    const list = items();
    const chosen = [byId(list, 'CHAMPION_RENTAL_103'), byId(list, 'CHAMPION_SKIN_RENTAL_1001')];
    expect(computeTotals(chosen, false)).toEqual({ blue: 2520, orange: 468, items: 2, copies: 5 });
  });

  it('keeps one copy of each when asked', () => {
    const list = items();
    const chosen = [byId(list, 'CHAMPION_RENTAL_103'), byId(list, 'CHAMPION_RENTAL_1'), byId(list, 'CHAMPION_SKIN_RENTAL_1001')];
    const plan = buildPlan(chosen, true);
    expect(plan.map((e) => [e.item.lootId, e.repeat])).toEqual([
      ['CHAMPION_RENTAL_103', 1],
      ['CHAMPION_SKIN_RENTAL_1001', 2],
    ]);
    expect(planTotals(plan)).toEqual({ blue: 1260, orange: 312, items: 2, copies: 3 });
  });
});

describe('recipe discovery', () => {
  it('prefers the DISENCHANT recipe type', () => {
    expect(pickDisenchantRecipe(DISENCHANT_RECIPES)).toBe('CHAMPION_RENTAL_disenchant');
  });

  it('falls back to a recipe name ending in _disenchant', () => {
    expect(pickDisenchantRecipe([{ recipeName: 'SKIN_RENTAL_reroll' }, { recipeName: 'SKIN_RENTAL_Disenchant' }])).toBe('SKIN_RENTAL_Disenchant');
  });

  it('returns null when there is no disenchant recipe', () => {
    expect(pickDisenchantRecipe([{ recipeName: 'X_upgrade', type: 'UPGRADE' }])).toBeNull();
    expect(pickDisenchantRecipe({ error: true })).toBeNull();
  });

  it('asks once per loot type and caches the answer', async () => {
    const { lcu, get } = fakeLcu({ routes: { [recipesRoute('CHAMPION_RENTAL_103')]: DISENCHANT_RECIPES } });
    const resolve = makeRecipeResolver(lcu);
    expect(await resolve({ lootId: 'CHAMPION_RENTAL_103', lootType: 'CHAMPION_RENTAL' })).toBe('CHAMPION_RENTAL_disenchant');
    expect(await resolve({ lootId: 'CHAMPION_RENTAL_1', lootType: 'CHAMPION_RENTAL' })).toBe('CHAMPION_RENTAL_disenchant');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/lol-loot/v1/recipes/initial-item/CHAMPION_RENTAL_103');
  });
});

describe('runDisenchant', () => {
  const resolveRecipe: RecipeResolver = async ({ lootType }) => (lootType === 'SKIN' ? null : `${lootType}_disenchant`);
  const noWait = vi.fn(async () => {});

  it('crafts every entry with repeat set to the copies, waiting between calls', async () => {
    const { lcu, post } = fakeLcu();
    const list = items();
    const plan = buildPlan([byId(list, 'CHAMPION_RENTAL_103'), byId(list, 'CHAMPION_SKIN_RENTAL_1001')], false);
    const wait = vi.fn(async () => {});
    const progress: string[] = [];
    const reload = vi.fn(async () => [] as LootItem[]);
    const result = await runDisenchant({
      lcu,
      plan,
      resolveRecipe,
      reload,
      sleep: wait,
      delayMs: 300,
      onProgress: (p) => progress.push(`${p.index + 1}/${p.total} ${p.item.name}`),
    });
    expect(post.mock.calls).toEqual([
      ['/lol-loot/v1/recipes/CHAMPION_RENTAL_disenchant/craft?repeat=2', ['CHAMPION_RENTAL_103']],
      ['/lol-loot/v1/recipes/SKIN_RENTAL_disenchant/craft?repeat=3', ['CHAMPION_SKIN_RENTAL_1001']],
    ]);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0]).toEqual([300, undefined]);
    expect(progress).toEqual(['1/2 Ahri', '2/2 Goth Annie']);
    expect(result.done).toHaveLength(2);
    expect(result.failed).toEqual([]);
    expect(result.cancelled).toBe(false);
    expect(result.gained).toEqual({ blue: 2520, orange: 468, items: 2, copies: 5 });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.inventory).toEqual([]);
  });

  it('uses count minus one when keeping one', async () => {
    const { lcu, post } = fakeLcu();
    const plan = buildPlan([byId(items(), 'CHAMPION_SKIN_RENTAL_1001')], true);
    await runDisenchant({ lcu, plan, resolveRecipe, sleep: noWait });
    expect(post).toHaveBeenCalledWith(craftRoute('SKIN_RENTAL_disenchant', 2), ['CHAMPION_SKIN_RENTAL_1001']);
  });

  it('stops when cancelled and reports what was skipped', async () => {
    const { lcu, post } = fakeLcu();
    const list = items();
    const plan = buildPlan([byId(list, 'CHAMPION_RENTAL_103'), byId(list, 'CHAMPION_RENTAL_1'), byId(list, 'CHAMPION_22')], false);
    const controller = new AbortController();
    const reload = vi.fn(async () => list);
    const result = await runDisenchant({
      lcu,
      plan,
      resolveRecipe,
      reload,
      signal: controller.signal,
      sleep,
      delayMs: 5,
      onProgress: (p) => {
        if (p.index === 0) controller.abort();
      },
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.cancelled).toBe(true);
    expect(result.done.map((e) => e.item.lootId)).toEqual(['CHAMPION_RENTAL_103']);
    expect(result.skipped.map((e) => e.item.lootId)).toEqual(['CHAMPION_RENTAL_1', 'CHAMPION_22']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when cancelled before it starts', async () => {
    const { lcu, post } = fakeLcu();
    const controller = new AbortController();
    controller.abort();
    const result = await runDisenchant({ lcu, plan: buildPlan(items(), false), resolveRecipe, signal: controller.signal, sleep: noWait });
    expect(post).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(result.done).toEqual([]);
  });

  it('collects failures per item and keeps going', async () => {
    let call = 0;
    const { lcu } = fakeLcu({
      post: async () => {
        call += 1;
        if (call === 1) return new Response(null, { status: 500 });
        if (call === 2) throw new Error('down');
        return okResponse();
      },
    });
    const list = items();
    const plan = buildPlan(
      [byId(list, 'CHAMPION_RENTAL_103'), byId(list, 'CHAMPION_RENTAL_1'), byId(list, 'CHAMPION_SKIN_103001'), byId(list, 'CHAMPION_22')],
      false,
    );
    const result = await runDisenchant({ lcu, plan, resolveRecipe, sleep: noWait, reload: async () => Promise.reject(new Error('x')) });
    expect(result.failed.map((f) => [f.item.lootId, f.reason, f.status])).toEqual([
      ['CHAMPION_RENTAL_103', 'refused', 500],
      ['CHAMPION_RENTAL_1', 'network', undefined],
      ['CHAMPION_SKIN_103001', 'noRecipe', undefined],
    ]);
    expect(result.done.map((e) => e.item.lootId)).toEqual(['CHAMPION_22']);
    expect(result.gained).toEqual({ blue: 450, orange: 0, items: 1, copies: 1 });
    expect(result.inventory).toBeNull();
  });

  it('reports a recipe lookup that throws as a network failure', async () => {
    const { lcu, post } = fakeLcu();
    const result = await runDisenchant({
      lcu,
      plan: buildPlan([byId(items(), 'CHAMPION_RENTAL_103')], false),
      resolveRecipe: async () => Promise.reject(new Error('down')),
      sleep: noWait,
    });
    expect(post).not.toHaveBeenCalled();
    expect(result.failed[0].reason).toBe('network');
  });
});

describe('sleep', () => {
  it('ends early when aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const done = vi.fn();
    const pending = sleep(10_000, controller.signal).then(done);
    controller.abort();
    await pending;
    expect(done).toHaveBeenCalled();
  });
});

describe('loadLoot', () => {
  const routes = { [PLAYER_LOOT_ROUTE]: RAW_LOOT, [SKINS_ROUTE]: RAW_SKINS, [SUMMARY_ROUTE]: CHAMPIONS };

  it('loads loot, skins.json and champion names together', async () => {
    const { lcu, get } = fakeLcu({ routes });
    const list = await loadLoot(lcu);
    expect(get.mock.calls.map((c) => c[0])).toEqual([PLAYER_LOOT_ROUTE, SKINS_ROUTE, SUMMARY_ROUTE]);
    expect(byId(list, 'CHAMPION_SKIN_RENTAL_1001').legacy).toBe(true);
    expect(byId(list, 'CHAMPION_RENTAL_1').name).toBe('Annie');
  });

  it('still loads when skins.json is unavailable', async () => {
    const { lcu } = fakeLcu({ routes, failGet: [SKINS_ROUTE] });
    const list = await loadLoot(lcu);
    expect(byId(list, 'CHAMPION_SKIN_RENTAL_1001').legacy).toBe(false);
  });

  it('throws when the loot API fails or answers with something else', async () => {
    await expect(loadLoot(fakeLcu({ routes, failGet: [PLAYER_LOOT_ROUTE] }).lcu)).rejects.toThrow('offline');
    await expect(loadLoot(fakeLcu({ routes: { ...routes, [PLAYER_LOOT_ROUTE]: { errorCode: 'RPC_ERROR' } } }).lcu)).rejects.toBeInstanceOf(LootLoadError);
  });
});

describe('makeLootService', () => {
  it('caches skins.json and recipes, and refreshes the loot after disenchanting', async () => {
    const routes = {
      [PLAYER_LOOT_ROUTE]: RAW_LOOT,
      [SKINS_ROUTE]: RAW_SKINS,
      [SUMMARY_ROUTE]: CHAMPIONS,
      [recipesRoute('CHAMPION_RENTAL_103')]: DISENCHANT_RECIPES,
    };
    const { lcu, get, post } = fakeLcu({ routes });
    const service = makeLootService({ lcu, sleep: async () => {} });
    const list = await service.load();
    const result = await service.disenchant(buildPlan([byId(list, 'CHAMPION_RENTAL_103')], false));
    const routesCalled = get.mock.calls.map((c) => c[0]);
    expect(routesCalled).toEqual([
      PLAYER_LOOT_ROUTE,
      SKINS_ROUTE,
      SUMMARY_ROUTE,
      recipesRoute('CHAMPION_RENTAL_103'),
      PLAYER_LOOT_ROUTE,
    ]);
    expect(post).toHaveBeenCalledWith('/lol-loot/v1/recipes/CHAMPION_RENTAL_disenchant/craft?repeat=2', ['CHAMPION_RENTAL_103']);
    expect(result.inventory).toHaveLength(6);
  });
});
