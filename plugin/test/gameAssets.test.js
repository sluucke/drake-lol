import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ITEMS_ROUTE,
  SUMMONER_SPELLS_ROUTE,
  loadGameAssets,
  itemIconUrl,
  spellIconUrl,
  itemName,
  spellName,
  resetGameAssets,
} from '../src/features/gameAssets.js';

const ITEMS = [
  { id: 3153, name: 'Blade of the Ruined King', iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3153_Class_T3_BladeOfTheRuinedKing.png' },
  { id: 3006, name: "Berserker's Greaves", iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3006_Class_T2_BerserkersGreaves.png' },
];

const SPELLS = [
  { id: 4, name: 'Flash', iconPath: '/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_Flash.png' },
  { id: 14, name: 'Ignite', iconPath: '/lol-game-data/assets/DATA/Spells/Icons2D/Summoner_Dot.png' },
];

function makeLcu({ items = ITEMS, spells = SPELLS } = {}) {
  return {
    get: vi.fn(async (route) => {
      if (route === ITEMS_ROUTE) return items;
      if (route === SUMMONER_SPELLS_ROUTE) return spells;
      throw new Error(`unexpected route ${route}`);
    }),
  };
}

beforeEach(() => {
  resetGameAssets();
});

describe('loadGameAssets', () => {
  it('maps item and spell ids to lowercased icon paths', async () => {
    const lcu = makeLcu();
    await expect(loadGameAssets(lcu)).resolves.toBe(true);

    expect(itemIconUrl(3153)).toBe(ITEMS[0].iconPath.toLowerCase());
    expect(itemName(3153)).toBe('Blade of the Ruined King');
    expect(spellIconUrl(4)).toBe(SPELLS[0].iconPath.toLowerCase());
    expect(spellName(14)).toBe('Ignite');
  });

  it('only hits the LCU once across repeated calls', async () => {
    const lcu = makeLcu();
    await loadGameAssets(lcu);
    await loadGameAssets(lcu);
    expect(lcu.get).toHaveBeenCalledTimes(2); // items + spells, once each
  });

  it('survives an LCU failure and reports false', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('client down')) };
    await expect(loadGameAssets(lcu)).resolves.toBe(false);
    expect(itemIconUrl(3153)).toBe('/lol-game-data/assets/v1/item-icons/3153.png');
  });

  it('retries after a failed load', async () => {
    const failing = { get: vi.fn().mockRejectedValue(new Error('down')) };
    await loadGameAssets(failing);

    const working = makeLcu();
    await expect(loadGameAssets(working)).resolves.toBe(true);
    expect(itemIconUrl(3006)).toBe(ITEMS[1].iconPath.toLowerCase());
  });
});

describe('icon fallbacks', () => {
  it('falls back to the id-based route for unknown ids', () => {
    expect(itemIconUrl(9999)).toBe('/lol-game-data/assets/v1/item-icons/9999.png');
    expect(spellIconUrl(9999)).toBe('/lol-game-data/assets/v1/summoner-spell-icons/9999.png');
  });

  it('returns an empty string for a missing or zero id', () => {
    expect(itemIconUrl(0)).toBe('');
    expect(itemIconUrl(null)).toBe('');
    expect(spellIconUrl(undefined)).toBe('');
  });

  it('names unknown ids generically instead of throwing', () => {
    expect(itemName(9999)).toBe('Item 9999');
    expect(spellName(9999)).toBe('Spell 9999');
  });

  it('never returns an external CDN url', () => {
    expect(itemIconUrl(3153)).not.toMatch(/^https?:/);
    expect(spellIconUrl(4)).not.toMatch(/^https?:/);
  });
});
