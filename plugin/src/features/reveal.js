// Lobby reveal: look the current champ-select lobby up on a scouting site.
//
// URL shapes are carried over verbatim from lol-profiler-tool, which had them
// working against both sites.

export const CHAMP_SELECT_ROUTE = '/lol-champ-select/v1/session';

export const PROVIDERS = [
  { id: 'porofessor', label: 'Porofessor' },
  { id: 'opgg', label: 'OP.GG' },
];

export function collectNames(players) {
  if (!Array.isArray(players)) return [];
  const names = [];
  for (const p of players) {
    const gameName = (p && p.gameName) || '';
    // Champ select fills names in asynchronously, so a player can appear with
    // a blank one. An empty slot in the joined query breaks the whole search.
    if (!gameName) continue;
    const tag = (p && p.tagLine) || '';
    names.push(tag ? `${gameName}#${tag}` : gameName);
  }
  return names;
}

export function buildRevealUrl(provider, region, names) {
  const r = String(region || '').toLowerCase();
  // encodeURIComponent, not a raw join: the '#' in a Riot ID would otherwise
  // start the URL fragment and silently drop every name after the first.
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

      const names = collectNames(session && session.myTeam);
      if (names.length === 0) {
        return { ok: false, reason: 'you have to be in champ select to reveal a lobby' };
      }

      open(buildRevealUrl(provider, region, names));
      return { ok: true, count: names.length };
    },
  };
}
