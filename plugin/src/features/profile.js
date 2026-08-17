// Riot ID and friends.

export const SAVE_ALIAS = '/lol-summoner/v1/save-alias';
export const FRIENDS_ROUTE = '/lol-chat/v1/friends';

/// Splits "Name#TAG" on the LAST hash.
///
/// Riot IDs allow a '#' inside the display name, so splitting on the first one
/// would cut a legitimate name in half and save the wrong thing.
export function splitRiotId(raw) {
  const text = String(raw ?? '').trim();
  const at = text.lastIndexOf('#');
  if (at <= 0) return null;
  const gameName = text.slice(0, at).trim();
  const tagLine = text.slice(at + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

export function makeRiotId({ lcu }) {
  return {
    async save(raw) {
      const parts = splitRiotId(raw);
      if (!parts) {
        return { ok: false, reason: 'enter it as name#tag' };
      }
      try {
        const res = await lcu.post(SAVE_ALIAS, parts);
        if (res && res.ok === false) {
          // Availability, cooldowns and banned words are Riot's rules to
          // enforce, and their message is more accurate than a guess here.
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}

const OFFLINE = new Set(['offline', 'mobile']);

export function normaliseFriends(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const name = f.gameName || f.name || '';
      const tag = f.gameTag || '';
      return {
        id: f.id || f.puuid || name,
        name,
        riotId: tag ? `${name}#${tag}` : name,
        availability: f.availability || 'offline',
        online: !OFFLINE.has(f.availability),
        note: f.note || '',
        statusMessage: f.statusMessage || '',
        group: f.groupName || '',
      };
    })
    .filter((f) => f.name)
    // Online first: an alphabetical list buries the people you can actually
    // play with under everyone who is not there.
    .sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));
}

/// Removes every friend, one call each -- the client has no bulk endpoint.
///
/// Keeps going after a failure rather than stopping at the first: aborting
/// halfway would leave the list partly cleared with no indication of how far
/// it got, and the caller could not tell the user what actually happened.
/// Returns counts so the UI can report both.
export async function removeAllFriends({ lcu, friends }) {
  let removed = 0;
  let failed = 0;

  for (const f of friends || []) {
    try {
      const res = await lcu.delete(`${FRIENDS_ROUTE}/${f.id}`);
      if (res && res.ok === false) failed += 1;
      else removed += 1;
    } catch {
      failed += 1;
    }
  }

  return { removed, failed };
}

export async function loadFriends(lcu) {
  try {
    return normaliseFriends(await lcu.get(FRIENDS_ROUTE));
  } catch {
    return [];
  }
}
