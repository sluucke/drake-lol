const TAG = '[Drake]';

export const ITEM_SETS_ROUTE = (summonerId) => `/lol-item-sets/v1/item-sets/${summonerId}/sets`;
export const MY_SELECTION_ROUTE = '/lol-champ-select/v1/session/my-selection';
export const DRAKE_SET_MARKER = 'Drake ·';

const BLOCK_ORDER = [
  { bucket: 'starter', type: 'Starter Items' },
  { bucket: 'core', type: 'Core Build' },
  { bucket: 'boots', type: 'Boots' },
  { bucket: 'last', type: 'Final Items' },
];

function countIds(ids) {
  const counts = new Map();
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function blockFromCounts(counts, type, limit) {
  if (!counts.size) return null;
  const entries = [...counts.entries()];
  const capped = typeof limit === 'number' ? entries.slice(0, limit) : entries;
  return {
    type,
    items: capped.map(([id, count]) => ({ id: String(id), count })),
  };
}

// starter/core/boots: each `Build` entry is one alternative *full build*, so
// only the first (most-played) entry's ids are used, with per-entry
// duplicate ids (e.g. two control wards) preserved as a count.
function toBlock(entries, type) {
  const first = Array.isArray(entries) ? entries[0] : null;
  const ids = Array.isArray(first?.ids) ? first.ids : [];
  if (!ids.length) return null;
  return blockFromCounts(countIds(ids), type);
}

const LAST_ITEMS_LIMIT = 6;

// last: buildData.js normalizes last_items into up to 12 separate
// single-item entries meant for the Item Trend strip, not alternative full
// builds. Flatten and de-duplicate the ids across every entry instead of
// taking only the first entry's (single-item) ids.
function toLastItemsBlock(entries, type) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const flatIds = entries.flatMap((entry) => (Array.isArray(entry?.ids) ? entry.ids : []));
  if (!flatIds.length) return null;

  const uniqueIds = [];
  const seen = new Set();
  for (const raw of flatIds) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }

  const counts = new Map(uniqueIds.map((id) => [id, 1]));
  return blockFromCounts(counts, type, LAST_ITEMS_LIMIT);
}

export function buildItemSet({ championId, championName, build } = {}) {
  const id = Number(championId) || 0;
  const items = build?.items;
  if (!items || typeof items !== 'object') return null;

  const blocks = [];
  for (const { bucket, type } of BLOCK_ORDER) {
    const block = bucket === 'last' ? toLastItemsBlock(items[bucket], type) : toBlock(items[bucket], type);
    if (block) blocks.push(block);
  }
  if (!blocks.length) return null;

  return {
    title: `${DRAKE_SET_MARKER} ${championName || `Champion ${id}`}`,
    type: 'custom',
    map: 'any',
    mode: 'any',
    priority: false,
    sortrank: 1,
    associatedChampions: id > 0 ? [id] : [],
    associatedMaps: [],
    blocks,
  };
}

export async function applyItemSet(lcu, summonerId, itemSet) {
  const id = Number(summonerId) || 0;
  if (!lcu || typeof lcu.get !== 'function' || typeof lcu.put !== 'function') {
    return { success: false, error: 'LCU client is required' };
  }
  if (!id) return { success: false, error: 'Summoner id is required' };
  if (!itemSet) return { success: false, error: 'No item set to apply' };

  let existing;
  try {
    const res = await lcu.get(ITEM_SETS_ROUTE(id));
    existing = res && typeof res === 'object' ? res : { itemSets: [] };
  } catch (err) {
    console.warn(TAG, 'item set read failed:', err?.message || err);
    return { success: false, error: 'Could not read existing item sets' };
  }

  try {
    const kept = (Array.isArray(existing.itemSets) ? existing.itemSets : []).filter(
      (set) => !String(set?.title || '').includes(DRAKE_SET_MARKER)
    );

    const payload = {
      ...existing,
      accountId: existing.accountId ?? id,
      timestamp: Date.now(),
      itemSets: [...kept, itemSet],
    };

    const res = await lcu.put(ITEM_SETS_ROUTE(id), payload);
    if (res && res.ok === false) {
      return { success: false, error: `Client rejected the item set (${res.status})` };
    }
    return { success: true };
  } catch (err) {
    console.warn(TAG, 'item set apply failed:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to apply item set' };
  }
}

export async function applySummonerSpells(lcu, { spell1Id, spell2Id } = {}) {
  const first = Number(spell1Id) || 0;
  const second = Number(spell2Id) || 0;

  if (!lcu || typeof lcu.patch !== 'function') {
    return { success: false, error: 'LCU client is required' };
  }
  if (!first || !second) return { success: false, error: 'Two summoner spells are required' };
  if (first === second) return { success: false, error: 'Summoner spells must differ' };

  try {
    const res = await lcu.patch(MY_SELECTION_ROUTE, { spell1Id: first, spell2Id: second });
    if (res && res.ok === false) {
      return { success: false, error: `Client rejected the spells (${res.status})` };
    }
    return { success: true };
  } catch (err) {
    console.warn(TAG, 'summoner spell apply failed:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to apply summoner spells' };
  }
}
