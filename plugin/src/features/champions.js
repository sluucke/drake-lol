







export const SUMMARY_ROUTE = '/lol-game-data/assets/v1/champion-summary.json';

export function iconUrl(championId) {
  return `/lol-game-data/assets/v1/champion-icons/${championId}.png`;
}







const VARIANT_ID_FLOOR = 60000;

export function normaliseChampions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    
    .filter((c) => c && c.id > 0 && c.id < VARIANT_ID_FLOOR && c.name)
    .map((c) => ({ id: c.id, name: c.name, alias: c.alias || c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}




function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchChampions(list, query) {
  const q = fold(query).trim();
  if (!q) return list;
  return list.filter((c) => fold(c.name).includes(q) || fold(c.alias).includes(q));
}

export async function loadChampions(lcu) {
  try {
    return normaliseChampions(await lcu.get(SUMMARY_ROUTE));
  } catch {
    
    
    return [];
  }
}
