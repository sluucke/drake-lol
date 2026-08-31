import { describe, it, expect, vi } from 'vitest';
import {
  ITEM_SETS_ROUTE,
  MY_SELECTION_ROUTE,
  DRAKE_SET_MARKER,
  buildItemSet,
  applyItemSet,
  applySummonerSpells,
} from '../src/features/itemSets.js';

const build = {
  items: {
    starter: [{ ids: [1086, 2003], winRate: 51.2, pickRate: 74.5, play: 100 }],
    boots: [{ ids: [3006], winRate: 49.0, pickRate: 84.6, play: 100 }],
    core: [{ ids: [3153, 6673, 3031], winRate: 55.2, pickRate: 21.0, play: 100 }],
    // buildData.js normalizes last_items into up to 12 separate single-item
    // entries (Item Trend strip shape), not one multi-id alternative build.
    last: [
      { ids: [3072], winRate: 51.5, pickRate: 68.0, play: 100 },
      { ids: [3036], winRate: 50.1, pickRate: 55.0, play: 90 },
      { ids: [3026], winRate: 49.0, pickRate: 40.0, play: 70 },
    ],
  },
};

describe('buildItemSet', () => {
  it('creates one block per bucket, in build order', () => {
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    expect(set.blocks.map((b) => b.type)).toEqual([
      'Starter Items',
      'Core Build',
      'Boots',
      'Final Items',
    ]);
    expect(set.blocks[1].items.map((i) => i.id)).toEqual(['3153', '6673', '3031']);
  });

  it('flattens the last-items bucket into distinct ids from across every entry', () => {
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    const finalItems = set.blocks.find((b) => b.type === 'Final Items');
    expect(finalItems.items.map((i) => i.id)).toEqual(['3072', '3036', '3026']);
    expect(finalItems.items.every((i) => i.count === 1)).toBe(true);
  });

  it('caps the last-items block at six items and de-duplicates repeated ids', () => {
    const manyLast = {
      items: {
        ...build.items,
        last: [
          { ids: [1], winRate: 1, pickRate: 1, play: 1 },
          { ids: [2], winRate: 1, pickRate: 1, play: 1 },
          { ids: [1], winRate: 1, pickRate: 1, play: 1 }, // duplicate of the first
          { ids: [3], winRate: 1, pickRate: 1, play: 1 },
          { ids: [4], winRate: 1, pickRate: 1, play: 1 },
          { ids: [5], winRate: 1, pickRate: 1, play: 1 },
          { ids: [6], winRate: 1, pickRate: 1, play: 1 },
          { ids: [7], winRate: 1, pickRate: 1, play: 1 },
        ],
      },
    };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build: manyLast });
    const finalItems = set.blocks.find((b) => b.type === 'Final Items');
    expect(finalItems.items.map((i) => i.id)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('marks the set as Drake-owned and binds it to the champion', () => {
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    expect(set.title).toContain(DRAKE_SET_MARKER);
    expect(set.title).toContain('Yasuo');
    expect(set.associatedChampions).toEqual([157]);
    expect(set.map).toBe('any');
    expect(set.mode).toBe('any');
  });

  it('deduplicates item ids inside a block and sets a count', () => {
    const withDupes = { items: { ...build.items, starter: [{ ids: [2003, 2003, 1086], winRate: 50, pickRate: 70, play: 10 }] } };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build: withDupes });
    const starter = set.blocks[0].items;
    expect(starter.map((i) => i.id)).toEqual(['2003', '1086']);
    expect(starter[0].count).toBe(2);
  });

  it('skips empty buckets rather than emitting empty blocks', () => {
    const sparse = { items: { starter: [], boots: [], core: build.items.core, last: [] } };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build: sparse });
    expect(set.blocks.map((b) => b.type)).toEqual(['Core Build']);
  });

  it('returns null when there is nothing to build', () => {
    expect(buildItemSet({ championId: 157, championName: 'Yasuo', build: null })).toBeNull();
    expect(
      buildItemSet({ championId: 157, championName: 'Yasuo', build: { items: { starter: [], boots: [], core: [], last: [] } } })
    ).toBeNull();
  });
});

describe('applyItemSet', () => {
  it('replaces a previous Drake set and keeps the user\'s own sets', async () => {
    const existing = {
      accountId: 42,
      itemSets: [
        { title: 'My own set', uid: 'a' },
        { title: `${DRAKE_SET_MARKER} Ahri`, uid: 'b' },
      ],
    };
    const lcu = {
      get: vi.fn().mockResolvedValue(existing),
      put: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    };

    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    const res = await applyItemSet(lcu, 42, set);

    expect(res.success).toBe(true);
    expect(lcu.get).toHaveBeenCalledWith(ITEM_SETS_ROUTE(42));

    const [route, payload] = lcu.put.mock.calls[0];
    expect(route).toBe(ITEM_SETS_ROUTE(42));
    const titles = payload.itemSets.map((s) => s.title);
    expect(titles).toContain('My own set');
    expect(titles.filter((t) => t.includes(DRAKE_SET_MARKER)).length).toBe(1);
    expect(titles).toContain(set.title);
  });

  it('still writes when the client has no sets yet', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ itemSets: [] }),
      put: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    expect((await applyItemSet(lcu, 42, set)).success).toBe(true);
    expect(lcu.put.mock.calls[0][1].itemSets.length).toBe(1);
  });

  it('fails cleanly without an lcu, a summoner id, or a set', async () => {
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    expect((await applyItemSet(null, 42, set)).success).toBe(false);
    expect((await applyItemSet({ get: vi.fn(), put: vi.fn() }, 0, set)).success).toBe(false);
    expect((await applyItemSet({ get: vi.fn(), put: vi.fn() }, 42, null)).success).toBe(false);
  });

  it('does not write when reading existing sets fails', async () => {
    const lcu = {
      get: vi.fn().mockRejectedValue(new Error('client restarting')),
      put: vi.fn(),
    };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    const res = await applyItemSet(lcu, 42, set);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    expect(lcu.put).not.toHaveBeenCalled();
  });

  it('reports failure when the client rejects the write', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ itemSets: [] }),
      put: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    };
    const set = buildItemSet({ championId: 157, championName: 'Yasuo', build });
    const res = await applyItemSet(lcu, 42, set);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe('applySummonerSpells', () => {
  it('patches the champ select selection', async () => {
    const lcu = { patch: vi.fn().mockResolvedValue({ ok: true, status: 204 }) };
    const res = await applySummonerSpells(lcu, { spell1Id: 4, spell2Id: 14 });
    expect(res.success).toBe(true);
    expect(lcu.patch).toHaveBeenCalledWith(MY_SELECTION_ROUTE, { spell1Id: 4, spell2Id: 14 });
  });

  it('rejects incomplete or identical spell pairs', async () => {
    const lcu = { patch: vi.fn() };
    expect((await applySummonerSpells(lcu, { spell1Id: 4, spell2Id: 0 })).success).toBe(false);
    expect((await applySummonerSpells(lcu, { spell1Id: 4, spell2Id: 4 })).success).toBe(false);
    expect(lcu.patch).not.toHaveBeenCalled();
  });

  it('reports failure when the client rejects the patch', async () => {
    const lcu = { patch: vi.fn().mockResolvedValue({ ok: false, status: 409 }) };
    const res = await applySummonerSpells(lcu, { spell1Id: 4, spell2Id: 14 });
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
