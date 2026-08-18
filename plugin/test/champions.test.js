import { describe, it, expect, vi } from 'vitest';
import { normaliseChampions, searchChampions, iconUrl, loadChampions } from '../src/features/champions.js';

const raw = [
  { id: -1, name: 'Nenhum', alias: 'None' },
  { id: 103, name: 'Ahri', alias: 'Ahri' },
  { id: 84, name: 'Akali', alias: 'Akali' },
  { id: 266, name: "Aatrox", alias: 'Aatrox' },
  { id: 0, name: '', alias: '' },
];

describe('normaliseChampions', () => {
  it('drops the "None" entry, which is not a champion', () => {
    expect(normaliseChampions(raw).some((c) => c.id === -1)).toBe(false);
  });

  it('drops entries with no id or no name', () => {
    expect(normaliseChampions(raw).some((c) => c.id === 0)).toBe(false);
  });

  it('sorts by name so the grid is predictable', () => {
    expect(normaliseChampions(raw).map((c) => c.name)).toEqual(['Aatrox', 'Ahri', 'Akali']);
  });

  it('is safe on a failed load', () => {
    expect(normaliseChampions(null)).toEqual([]);
  });

  it('drops the LoL Classic variants, which duplicate every name', () => {




    const withVariants = [
      { id: 11, name: 'Master Yi', alias: 'MasterYi' },
      { id: 60011, name: 'Master Yi', alias: 'Jade_MasterYi' },
    ];
    const list = normaliseChampions(withVariants);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(11);
  });

  it('keeps the highest real champion id', () => {

    expect(normaliseChampions([{ id: 950, name: 'Newest', alias: 'Newest' }])).toHaveLength(1);
  });
});

describe('searchChampions', () => {
  const list = normaliseChampions(raw);

  it('returns everything for an empty query', () => {
    expect(searchChampions(list, '')).toHaveLength(3);
  });

  it('matches on a prefix', () => {
    expect(searchChampions(list, 'aka').map((c) => c.name)).toEqual(['Akali']);
  });

  it('ignores case', () => {
    expect(searchChampions(list, 'AHRI').map((c) => c.name)).toEqual(['Ahri']);
  });

  it('ignores accents, so pt-BR names are searchable from a plain keyboard', () => {
    const accented = normaliseChampions([{ id: 1, name: 'Chogath', alias: 'Chogath' }]);
    expect(searchChampions(accented, 'chogath')).toHaveLength(1);
  });

  it('matches the alias too, since players use English names', () => {


    const list2 = normaliseChampions([{ id: 5, name: 'Vil Mago', alias: 'Veigar' }]);
    expect(searchChampions(list2, 'veigar')).toHaveLength(1);
  });
});

describe('iconUrl', () => {
  it('points at the client\'s own asset, not an external CDN', () => {

    expect(iconUrl(103)).toBe('/lol-game-data/assets/v1/champion-icons/103.png');
  });
});

describe('loadChampions', () => {
  it('reads and normalises the client list', async () => {
    const lcu = { get: vi.fn().mockResolvedValue(raw) };
    const list = await loadChampions(lcu);
    expect(list.map((c) => c.id)).toEqual([266, 103, 84]);
  });

  it('returns an empty list instead of throwing when the client is not ready', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(await loadChampions(lcu)).toEqual([]);
  });
});
