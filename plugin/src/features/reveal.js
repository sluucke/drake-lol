import { resolveChampSelectPuuid } from './champSelectPuuid.js';

export const CHAMP_SELECT_ROUTE = '/lol-champ-select/v1/session';

export const SUMMONER_BY_PUUID_ROUTE = (puuid) => `/lol-summoner/v2/summoners/puuid/${puuid}`;
export const SUMMONER_BY_ID_ROUTE = (summonerId) => `/lol-summoner/v1/summoners/${summonerId}`;

export const PROVIDERS = [
  { id: 'porofessor', label: 'Porofessor' },
  { id: 'opgg', label: 'OP.GG' },
];

export function formatRiotId({ gameName, tagLine } = {}) {
  const name = (gameName || '').trim();
  if (!name) return '';
  const tag = (tagLine || '').trim();
  return tag ? `${name}#${tag}` : name;
}

export function collectNames(players) {
  if (!Array.isArray(players)) return [];
  const names = [];
  for (const p of players) {
    const id = formatRiotId(p);
    if (!id) continue;
    names.push(id);
  }
  return names;
}

export function lobbyPlayers(session) {
  if (!session) return [];
  return [...(session.myTeam || []), ...(session.theirTeam || [])].filter(
    (p) =>
      p &&
      (formatRiotId(p) || p.puuid || p.obfuscatedPuuid || p.summonerId),
  );
}

export async function resolvePlayerName(player, lcu) {
  const direct = formatRiotId(player);
  if (direct) return direct;

  const puuid = resolveChampSelectPuuid(player);
  if (puuid) {
    try {
      const summoner = await lcu.get(SUMMONER_BY_PUUID_ROUTE(puuid));
      const resolved = formatRiotId(summoner);
      if (resolved) return resolved;
    } catch {
    }
  }

  if (player.summonerId) {
    try {
      const summoner = await lcu.get(SUMMONER_BY_ID_ROUTE(player.summonerId));
      return formatRiotId(summoner);
    } catch {
      return '';
    }
  }

  return '';
}

export async function resolveLobbyNames(session, lcu) {
  const names = [];
  const seen = new Set();

  for (const player of lobbyPlayers(session)) {
    const name = await resolvePlayerName(player, lcu);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

export function buildRevealUrl(provider, region, names) {
  const r = String(region || '').toLowerCase();
  const encoded = encodeURIComponent(names.join(','));
  if (provider === 'opgg') {
    return `https://www.op.gg/multisearch/${r}?summoners=${encoded}`;
  }
  return `https://porofessor.gg/pregame/${r}/${encoded}/soloqueue/season`;
}

export function makeReveal({ lcu, region, open }) {
  return {
    async reveal(provider) {
      let session;
      try {
        session = await lcu.get(CHAMP_SELECT_ROUTE);
      } catch {
        return { ok: false, reason: 'you have to be in champ select to reveal a lobby' };
      }

      const names = await resolveLobbyNames(session, lcu);
      if (names.length === 0) {
        return { ok: false, reason: 'you have to be in champ select to reveal a lobby' };
      }

      open(buildRevealUrl(provider, region, names));
      return { ok: true, count: names.length };
    },
  };
}
