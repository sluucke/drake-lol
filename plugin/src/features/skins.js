// Profile background art.
//
// This is what the old app called "banner": the splash behind your profile,
// set by skin id. `bannerIdSelected` in chat presence is a different, much
// smaller thing (an accent number) with no published id list, so the skin
// route is the one that can actually be driven from a picker.
//
// Both the list and the artwork come from the client itself, same-origin --
// 2146 skins, no CDN, no version skew.

export const SKINS_ROUTE = '/lol-game-data/assets/v1/skins.json';
export const PROFILE_ROUTE = '/lol-summoner/v1/current-summoner/summoner-profile';

function fold(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function normaliseSkins(raw) {
  // skins.json is an object keyed by id, not an array. An Array.isArray guard
  // alone would quietly produce an empty picker.
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw)
    .filter((s) => s && s.id && s.name && s.tilePath)
    .map((s) => ({ id: s.id, name: s.name, tile: s.tilePath }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchSkins(list, query) {
  const q = fold(query).trim();
  if (!q) return list;
  return list.filter((s) => fold(s.name).includes(q));
}

export async function loadSkins(lcu) {
  try {
    return normaliseSkins(await lcu.get(SKINS_ROUTE));
  } catch {
    return [];
  }
}

export function makeBackground({ lcu }) {
  return {
    async set(skinId) {
      try {
        // Number, not string: the client rejects a quoted id.
        const res = await lcu.post(PROFILE_ROUTE, {
          key: 'backgroundSkinId',
          value: Number(skinId),
        });
        if (res && res.ok === false) {
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
