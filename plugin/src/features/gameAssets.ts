import type { Lcu } from '../lcu';
import { gameDataUrl } from './assetUrl';
const TAG = '[Drake]';

export const ITEMS_ROUTE = '/lol-game-data/assets/v1/items.json';
export const SUMMONER_SPELLS_ROUTE = '/lol-game-data/assets/v1/summoner-spells.json';

export interface GameAssetEntry {
  name: string;
  iconPath: string;
}

interface RawGameAsset {
  id?: number | string;
  name?: string;
  iconPath?: string;
}

type AssetMap = Map<number, GameAssetEntry>;

const items: AssetMap = new Map();
const spells: AssetMap = new Map();
let loaded = false;
let loading: Promise<boolean> | null = null;

function ingest(target: AssetMap, list: unknown): number {
  if (!Array.isArray(list)) return 0;
  let count = 0;
  for (const entry of list as (RawGameAsset | null | undefined)[]) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    target.set(id, {
      name: String(entry?.name || ''),
      iconPath: String(entry?.iconPath || '').toLowerCase(),
    });
    count += 1;
  }
  return count;
}

export function resetGameAssets() {
  items.clear();
  spells.clear();
  loaded = false;
  loading = null;
}

export async function loadGameAssets(lcu: Pick<Lcu, 'get'>): Promise<boolean> {
  if (loaded) return true;
  if (loading) return loading;

  loading = (async () => {
    try {
      const [itemList, spellList] = await Promise.all([
        lcu.get<unknown>(ITEMS_ROUTE),
        lcu.get<unknown>(SUMMONER_SPELLS_ROUTE),
      ]);
      const itemCount = ingest(items, itemList);
      ingest(spells, spellList);
      loaded = itemCount > 0;
      if (!loaded) console.warn(TAG, 'game assets loaded but contained no items');
      return loaded;
    } catch (err) {
      console.warn(TAG, 'failed to load game assets:', (err as Error | null)?.message || err);
      resetGameAssets();
      return false;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

function iconFor(map: AssetMap, id: unknown, fallbackRoute: string): string {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return '';
  const entry = map.get(num);
  if (entry?.iconPath) return gameDataUrl(entry.iconPath);
  return gameDataUrl(`${fallbackRoute}/${num}.png`);
}

function nameFor(map: AssetMap, id: unknown, prefix: string): string {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return '';
  return map.get(num)?.name || `${prefix} ${num}`;
}

export function itemIconUrl(id: number | string | null | undefined): string {
  return iconFor(items, id, '/lol-game-data/assets/v1/item-icons');
}

export function spellIconUrl(id: number | string | null | undefined): string {
  return iconFor(spells, id, '/lol-game-data/assets/v1/summoner-spell-icons');
}

export function itemName(id: number | string | null | undefined): string {
  return nameFor(items, id, 'Item');
}

export function spellName(id: number | string | null | undefined): string {
  return nameFor(spells, id, 'Spell');
}
