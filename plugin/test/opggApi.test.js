import { describe, it, expect, vi } from 'vitest';
import {
  OPGG_BASE,
  OPGG_TIERS,
  OPGG_REGIONS,
  normalizeOpggPosition,
  buildChampionUrl,
  buildVersionsUrl,
  fetchChampionBuild,
  fetchVersions,
} from '../src/features/opggApi.js';

describe('normalizeOpggPosition', () => {
  it('maps client lane names to OP.GG positions', () => {
    expect(normalizeOpggPosition('TOP')).toBe('top');
    expect(normalizeOpggPosition('JUNGLE')).toBe('jungle');
    expect(normalizeOpggPosition('MIDDLE')).toBe('mid');
    expect(normalizeOpggPosition('BOTTOM')).toBe('adc');
    expect(normalizeOpggPosition('UTILITY')).toBe('support');
  });

  it('falls back to none for unknown or empty lanes', () => {
    expect(normalizeOpggPosition('')).toBe('none');
    expect(normalizeOpggPosition(null)).toBe('none');
    expect(normalizeOpggPosition('whatever')).toBe('none');
  });
});

describe('buildChampionUrl', () => {
  it('builds a ranked URL with position and tier', () => {
    expect(buildChampionUrl({ championId: 157, position: 'MIDDLE', tier: 'emerald_plus' })).toBe(
      `${OPGG_BASE}/api/global/champions/ranked/157/mid?tier=emerald_plus`
    );
  });

  it('forces position none for aram and keeps the mode in the path', () => {
    expect(buildChampionUrl({ championId: 157, mode: 'aram', position: 'MIDDLE', tier: 'all' })).toBe(
      `${OPGG_BASE}/api/global/champions/aram/157/none?tier=all`
    );
  });

  it('includes the version when given and honours the region', () => {
    expect(
      buildChampionUrl({ championId: 103, position: 'MID', tier: 'gold_plus', region: 'br', version: '16.17' })
    ).toBe(`${OPGG_BASE}/api/br/champions/ranked/103/mid?tier=gold_plus&version=16.17`);
  });

  it('defaults to global/ranked/emerald_plus/none', () => {
    expect(buildChampionUrl({ championId: 1 })).toBe(
      `${OPGG_BASE}/api/global/champions/ranked/1/none?tier=emerald_plus`
    );
  });
});

describe('buildVersionsUrl', () => {
  it('points at the versions route for the mode', () => {
    expect(buildVersionsUrl({ region: 'kr', mode: 'aram' })).toBe(
      `${OPGG_BASE}/api/kr/champions/aram/versions`
    );
  });
});

describe('tier and region tables', () => {
  it('exposes every tier the API accepts, with English labels', () => {
    expect(OPGG_TIERS.map((t) => t.value)).toEqual([
      'all',
      'ibsg',
      'gold_plus',
      'platinum_plus',
      'emerald_plus',
      'diamond_plus',
      'master',
      'grandmaster',
      'challenger',
    ]);
    for (const tier of OPGG_TIERS) {
      expect(typeof tier.label).toBe('string');
      expect(tier.label.length).toBeGreaterThan(0);
    }
  });

  it('lists global first so it is the natural default', () => {
    expect(OPGG_REGIONS[0].value).toBe('global');
  });
});

describe('fetchChampionBuild', () => {
  it('returns the parsed json on success', async () => {
    const payload = { data: { summary: {} }, meta: { version: '16.17' } };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    const res = await fetchChampionBuild({ championId: 157, position: 'MID' }, { fetchFn });
    expect(res).toEqual(payload);
    expect(fetchFn).toHaveBeenCalledWith(
      `${OPGG_BASE}/api/global/champions/ranked/157/mid?tier=emerald_plus`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns null on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await fetchChampionBuild({ championId: 157 }, { fetchFn })).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchChampionBuild({ championId: 157 }, { fetchFn })).toBeNull();
  });

  it('returns null when there is no fetch implementation', async () => {
    expect(await fetchChampionBuild({ championId: 157 }, { fetchFn: null })).toBeNull();
  });
});

describe('fetchVersions', () => {
  it('unwraps the data array', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: ['16.17', '16.16'] }) });
    expect(await fetchVersions({}, { fetchFn })).toEqual(['16.17', '16.16']);
  });

  it('returns an empty list on failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('nope'));
    expect(await fetchVersions({}, { fetchFn })).toEqual([]);
  });
});
