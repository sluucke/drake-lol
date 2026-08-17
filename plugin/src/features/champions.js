// The champion list, from the client itself.
//
// `/lol-game-data/assets/v1/champion-summary.json` and the icons beside it are
// served same-origin by the client (measured: 200, 237 entries). That beats
// CommunityDragon on every axis that matters here -- no network dependency, no
// version skew against the running client, and names already in the user's
// locale.

export const SUMMARY_ROUTE = '/lol-game-data/assets/v1/champion-summary.json';

export function iconUrl(championId) {
  return `/lol-game-data/assets/v1/champion-icons/${championId}.png`;
}

/// Where the LoL Classic ("Jade") variants start.
///
/// Measured in the live client: 63 entries sit at id >= 60000 with a `Jade_`
/// alias, each duplicating a real champion's display name -- two "Master Yi"
/// cells in the grid, one of which is not pickable in a normal game. Real
/// champion ids reach 950 today, so the gap is wide and the cut is safe.
const VARIANT_ID_FLOOR = 60000;

export function normaliseChampions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    // id -1 is the "None" placeholder the client uses for an empty slot.
    .filter((c) => c && c.id > 0 && c.id < VARIANT_ID_FLOOR && c.name)
    .map((c) => ({ id: c.id, name: c.name, alias: c.alias || c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/// Accent- and case-insensitive, matching both the localised name and the
/// English alias: a pt-BR client shows translated names while players still
/// type the English ones.
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
    // The client is not up yet, or the route moved. An empty grid with a
    // search box is a survivable failure; throwing into the panel is not.
    return [];
  }
}
