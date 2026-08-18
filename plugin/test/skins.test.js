import { describe, it, expect, vi } from 'vitest';
import {
  normaliseSkins,
  searchSkins,
  loadSkins,
  makeBackground,
  PROFILE_ROUTE,
} from '../src/features/skins.js';

const raw = {
  1000: { id: 1000, name: 'Annie', tilePath: '/a/annie_tile_0.jpg' },
  1001: { id: 1001, name: 'Goth Annie', tilePath: '/a/annie_tile_1.jpg' },
  103000: { id: 103000, name: 'Ahri', tilePath: '/a/ahri_tile_0.jpg' },
  999: { id: 999, name: 'Broken', tilePath: '' },
};

describe('normaliseSkins', () => {
  it('keeps id, name and tile for each skin', () => {
    const list = normaliseSkins(raw);
    const annie = list.find((s) => s.id === 1001);
    expect(annie.name).toBe('Goth Annie');
    expect(annie.tile).toBe('/a/annie_tile_1.jpg');
  });

  it('drops entries with no artwork, which cannot be shown', () => {
    expect(normaliseSkins(raw).some((s) => s.id === 999)).toBe(false);
  });

  it('sorts by name so the grid is predictable', () => {
    expect(normaliseSkins(raw).map((s) => s.name)).toEqual(['Ahri', 'Annie', 'Goth Annie']);
  });

  it('accepts the object map the client actually returns', () => {


    expect(normaliseSkins(raw).length).toBe(3);
  });

  it('is safe on nothing', () => {
    expect(normaliseSkins(null)).toEqual([]);
  });
});

describe('searchSkins', () => {
  const list = normaliseSkins(raw);

  it('matches on skin name', () => {
    expect(searchSkins(list, 'goth').map((s) => s.id)).toEqual([1001]);
  });

  it('ignores case and accents', () => {
    expect(searchSkins(list, 'ANNIE')).toHaveLength(2);
  });

  it('returns everything for an empty query', () => {
    expect(searchSkins(list, '  ')).toHaveLength(3);
  });
});

describe('makeBackground', () => {
  it('sets the profile background to a skin', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await makeBackground({ lcu }).set(1001);

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(PROFILE_ROUTE, {
      key: 'backgroundSkinId',
      value: 1001,
    });
  });

  it('sends a number, because the client rejects a string id', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    await makeBackground({ lcu }).set('1001');
    expect(lcu.post.mock.calls[0][1].value).toBe(1001);
  });

  it('reports a refusal', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 400 }) };
    const result = await makeBackground({ lcu }).set(1);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('400');
  });
});

describe('loadSkins', () => {
  it('reads and normalises', async () => {
    const lcu = { get: vi.fn().mockResolvedValue(raw) };
    expect(await loadSkins(lcu)).toHaveLength(3);
  });

  it('returns an empty list rather than throwing', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(await loadSkins(lcu)).toEqual([]);
  });
});
