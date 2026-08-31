import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeChampionBuild, EMPTY_BUILD } from '../src/features/buildData.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/opgg-yasuo-mid.json', import.meta.url), 'utf8')
);

describe('normalizeChampionBuild', () => {
  it('reports no data for empty or malformed input', () => {
    expect(normalizeChampionBuild(null)).toEqual(EMPTY_BUILD);
    expect(normalizeChampionBuild({}).hasData).toBe(false);
    expect(normalizeChampionBuild('nonsense').hasData).toBe(false);
    expect(normalizeChampionBuild({ data: null }).hasData).toBe(false);
  });

  it('extracts patch and aggregate stats as percentages', () => {
    const build = normalizeChampionBuild(fixture);
    expect(build.hasData).toBe(true);
    expect(build.patch).toBe(fixture.meta.version);

    const raw = fixture.data.summary.average_stats;
    expect(build.stats.winRate).toBeCloseTo(Math.round(raw.win_rate * 1000) / 10, 5);
    expect(build.stats.pickRate).toBeCloseTo(Math.round(raw.pick_rate * 1000) / 10, 5);
    expect(build.stats.play).toBe(raw.play);
    expect(build.stats.tier).toBe(raw.tier);

    // Percentages, not fractions.
    expect(build.stats.winRate).toBeGreaterThan(1);
    expect(build.stats.winRate).toBeLessThan(100);
  });

  it('normalizes every item bucket into id lists with rates', () => {
    const build = normalizeChampionBuild(fixture);
    for (const bucket of ['starter', 'boots', 'core', 'last']) {
      expect(Array.isArray(build.items[bucket])).toBe(true);
      expect(build.items[bucket].length).toBeGreaterThan(0);
      for (const entry of build.items[bucket]) {
        expect(Array.isArray(entry.ids)).toBe(true);
        expect(entry.ids.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
        expect(entry.winRate).toBeGreaterThan(0);
        expect(entry.pickRate).toBeGreaterThan(0);
      }
    }
    expect(build.items.core[0].ids.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts item buckets by pick rate, most played first', () => {
    const build = normalizeChampionBuild(fixture);
    const rates = build.items.core.map((e) => e.pickRate);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it('flattens rune pages into apply-ready perk lists', () => {
    const build = normalizeChampionBuild(fixture);
    expect(build.runePages.length).toBeGreaterThan(0);

    const page = build.runePages[0];
    const rawPage = fixture.data.rune_pages[0];
    const rawBuild = rawPage.builds[0];

    expect(page.primaryStyleId).toBe(rawPage.primary_page_id);
    expect(page.subStyleId).toBe(rawPage.secondary_page_id);
    expect(page.selectedPerkIds).toEqual([
      ...rawBuild.primary_rune_ids,
      ...rawBuild.secondary_rune_ids,
      ...rawBuild.stat_mod_ids,
    ]);
    // 4 primary + 2 secondary + 3 shards
    expect(page.selectedPerkIds.length).toBe(9);

    // pickRate is the GLOBAL rate (build.pick_rate is relative to its
    // parent page, not comparable across pages) — build.pick_rate * page.pick_rate.
    const expectedGlobalPickRate = Math.round(rawBuild.pick_rate * rawPage.pick_rate * 1000) / 10;
    expect(page.pickRate).toBeCloseTo(expectedGlobalPickRate, 5);
  });

  it('sorts rune pages by global pick rate, most played first', () => {
    const build = normalizeChampionBuild(fixture);
    const rates = build.runePages.map((p) => p.pickRate);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it('extracts the skill mastery and the level order', () => {
    const build = normalizeChampionBuild(fixture);
    expect(build.skills.masteries).toEqual(fixture.data.skill_masteries[0].ids);
    expect(build.skills.order).toEqual(fixture.data.skill_masteries[0].builds[0].order);
    expect(build.skills.order.length).toBe(15);
  });

  it('splits counters into strong and weak, capped at five each', () => {
    const build = normalizeChampionBuild(fixture);
    expect(build.counters.strong.length).toBeLessThanOrEqual(5);
    expect(build.counters.weak.length).toBeLessThanOrEqual(5);

    for (const entry of build.counters.strong) expect(entry.winRate).toBeGreaterThanOrEqual(50);
    for (const entry of build.counters.weak) expect(entry.winRate).toBeLessThan(50);

    const strongRates = build.counters.strong.map((e) => e.winRate);
    expect([...strongRates].sort((a, b) => b - a)).toEqual(strongRates);
    const weakRates = build.counters.weak.map((e) => e.winRate);
    expect([...weakRates].sort((a, b) => a - b)).toEqual(weakRates);
  });

  it('drops counters below the sample-size floor', () => {
    const json = {
      meta: { version: '16.17' },
      data: {
        summary: { average_stats: { play: 100000, win_rate: 0.5, pick_rate: 0.1, ban_rate: 0.1, kda: 2, tier: 1, rank: 1 } },
        counters: [
          { champion_id: 1, play: 3, win: 3 },        // 100% but only 3 games — dropped
          { champion_id: 2, play: 4000, win: 2600 },  // 65% over 4000 games — kept
          { champion_id: 3, play: 4000, win: 1200 },  // 30% over 4000 games — kept
        ],
      },
    };
    const build = normalizeChampionBuild(json);
    expect(build.counters.strong.map((e) => e.championId)).toEqual([2]);
    expect(build.counters.weak.map((e) => e.championId)).toEqual([3]);
  });

  it('produces the same shape for aram, with no counters', () => {
    const json = {
      meta: { version: '16.17' },
      data: {
        summary: { average_stats: { play: 5000, win_rate: 0.52, pick_rate: 0.2, ban_rate: 0, kda: 3, tier: 1, rank: 4 } },
        core_items: [{ ids: [3153, 6673], play: 100, win: 55, pick_rate: 0.4 }],
        rune_pages: [],
        skill_masteries: [],
      },
    };
    const build = normalizeChampionBuild(json, { mode: 'aram' });
    expect(build.hasData).toBe(true);
    expect(build.counters).toEqual({ strong: [], weak: [] });
    expect(build.items.core[0].winRate).toBe(55);
    expect(build.items.starter).toEqual([]);
    expect(build.runePages).toEqual([]);
    expect(build.skills).toEqual({ masteries: [], order: [] });
  });
});
