const TAG = '[Drake]';

export const ITEMS_ROUTE = '/lol-game-data/assets/v1/items.json';
export const SUMMONER_SPELLS_ROUTE = '/lol-game-data/assets/v1/summoner-spells.json';

const items = new Map();
const spells = new Map();
let loaded = false;
let loading = null;

function ingest(target, list) {
  if (!Array.isArray(list)) return 0;
  let count = 0;
  for (const entry of list) {
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

export async function loadGameAssets(lcu) {
  if (loaded) return true;
  if (loading) return loading;

  loading = (async () => {
    try {
      const [itemList, spellList] = await Promise.all([
        lcu.get(ITEMS_ROUTE),
        lcu.get(SUMMONER_SPELLS_ROUTE),
      ]);
      const itemCount = ingest(items, itemList);
      ingest(spells, spellList);
      loaded = itemCount > 0;
      if (!loaded) console.warn(TAG, 'game assets loaded but contained no items');
      return loaded;
    } catch (err) {
      console.warn(TAG, 'failed to load game assets:', err?.message || err);
      resetGameAssets();
      return false;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

function iconFor(map, id, fallbackRoute) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return '';
  const entry = map.get(num);
  if (entry?.iconPath) return entry.iconPath;
  return `${fallbackRoute}/${num}.png`;
}

function nameFor(map, id, prefix) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return '';
  return map.get(num)?.name || `${prefix} ${num}`;
}

export function itemIconUrl(id) {
  return iconFor(items, id, '/lol-game-data/assets/v1/item-icons');
}

export function spellIconUrl(id) {
  return iconFor(spells, id, '/lol-game-data/assets/v1/summoner-spell-icons');
}

export function itemName(id) {
  return nameFor(items, id, 'Item');
}

export function spellName(id) {
  return nameFor(spells, id, 'Spell');
}
