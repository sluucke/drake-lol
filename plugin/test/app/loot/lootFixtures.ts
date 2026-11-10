import { normalizeLoot, parseSkinMeta } from '../../../src/features/loot';
import type { LootItem } from '../../../src/features/loot';

const RAW = [
  { lootId: 'CHAMPION_RENTAL_103', type: 'CHAMPION_RENTAL', itemDesc: 'Ahri', count: 2, disenchantValue: 1260, disenchantLootName: 'CURRENCY_champion', itemStatus: 'OWNED', storeItemId: 103, tilePath: '/lol-game-data/a/ahri.jpg' },
  { lootId: 'CHAMPION_RENTAL_22', type: 'CHAMPION_RENTAL', itemDesc: 'Ashe', count: 1, disenchantValue: 90, disenchantLootName: 'CURRENCY_champion', itemStatus: 'OWNED', storeItemId: 22 },
  { lootId: 'CHAMPION_RENTAL_1', type: 'CHAMPION_RENTAL', itemDesc: 'Annie', count: 1, disenchantValue: 90, disenchantLootName: 'CURRENCY_champion', itemStatus: 'NONE', storeItemId: 1 },
  { lootId: 'CHAMPION_SKIN_RENTAL_1001', type: 'SKIN_RENTAL', itemDesc: 'Goth Annie', count: 3, disenchantValue: 156, disenchantLootName: 'CURRENCY_cosmetic', itemStatus: 'NONE', storeItemId: 1001, parentStoreItemId: 1 },
  { lootId: 'CHAMPION_SKIN_RENTAL_103015', type: 'SKIN_RENTAL', itemDesc: 'Spirit Blossom Ahri', count: 1, disenchantValue: 270, disenchantLootName: 'CURRENCY_cosmetic', itemStatus: 'OWNED', storeItemId: 103015, parentStoreItemId: 103 },
];

const SKINS = {
  1001: { id: 1001, name: 'Goth Annie', isLegacy: true, rarity: 'kNoRarity' },
  103015: { id: 103015, name: 'Spirit Blossom Ahri', isLegacy: false, rarity: 'kLegendary' },
};

export function lootItems(): LootItem[] {
  return normalizeLoot(RAW, { skins: parseSkinMeta(SKINS) });
}
