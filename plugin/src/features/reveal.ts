import type { Lcu } from '../lcu';
import type { ChampSelectPlayer, ChampSelectSession } from './champSelect';
import { resolveChampSelectPuuid } from './champSelectPuuid';

export interface RiotIdParts {
  gameName?: string;
  tagLine?: string;
}

export interface SummonerRecord extends RiotIdParts {
  puuid?: string;
  summonerId?: number;
}

export type RevealProviderId = 'porofessor' | 'opgg';

export interface RevealProvider {
  id: RevealProviderId;
  label: string;
}

export interface RevealResult {
  ok: boolean;
  count?: number;
  reason?: string;
}

export interface Reveal {
  reveal(provider: string): Promise<RevealResult>;
}

export const CHAMP_SELECT_ROUTE = '/lol-champ-select/v1/session';

export const SUMMONER_BY_PUUID_ROUTE = (puuid: string): string => `/lol-summoner/v2/summoners/puuid/${puuid}`;
export const SUMMONER_BY_ID_ROUTE = (summonerId: number | string): string => `/lol-summoner/v1/summoners/${summonerId}`;

export const PROVIDERS: RevealProvider[] = [
  { id: 'porofessor', label: 'Porofessor' },
  { id: 'opgg', label: 'OP.GG' },
];

export function formatRiotId({ gameName, tagLine }: RiotIdParts = {}): string {
  const name = (gameName || '').trim();
  if (!name) return '';
  const tag = (tagLine || '').trim();
  return tag ? `${name}#${tag}` : name;
}

export function collectNames(players: RiotIdParts[] | null | undefined): string[] {
  if (!Array.isArray(players)) return [];
  const names: string[] = [];
  for (const p of players) {
    const id = formatRiotId(p);
    if (!id) continue;
    names.push(id);
  }
  return names;
}

export function lobbyPlayers(session: ChampSelectSession | null | undefined): ChampSelectPlayer[] {
  if (!session) return [];
  return [...(session.myTeam || []), ...(session.theirTeam || [])].filter(
    (p) =>
      p &&
      (formatRiotId(p) || p.puuid || p.obfuscatedPuuid || p.summonerId),
  );
}

export async function resolvePlayerName(player: ChampSelectPlayer, lcu: Pick<Lcu, 'get'>): Promise<string> {
  const direct = formatRiotId(player);
  if (direct) return direct;

  const puuid = resolveChampSelectPuuid(player);
  if (puuid) {
    try {
      const summoner = await lcu.get<SummonerRecord>(SUMMONER_BY_PUUID_ROUTE(puuid));
      const resolved = formatRiotId(summoner);
      if (resolved) return resolved;
    } catch {
    }
  }

  if (player.summonerId) {
    try {
      const summoner = await lcu.get<SummonerRecord>(SUMMONER_BY_ID_ROUTE(player.summonerId));
      return formatRiotId(summoner);
    } catch {
      return '';
    }
  }

  return '';
}

export async function resolveLobbyNames(
  session: ChampSelectSession | null | undefined,
  lcu: Pick<Lcu, 'get'>,
): Promise<string[]> {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const player of lobbyPlayers(session)) {
    const name = await resolvePlayerName(player, lcu);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

const REVEAL_REGION_SLUGS: Record<string, string> = {
  LA1: 'lan',
  LA2: 'las',
  LAN: 'lan',
  LAS: 'las',
  NA1: 'na',
  BR1: 'br',
  EUW1: 'euw',
  EUN1: 'eune',
  EUNE: 'eune',
  OC1: 'oce',
  OCE: 'oce',
  JP1: 'jp',
  TR1: 'tr',
  RU1: 'ru',
  PH2: 'sea',
  SG2: 'sea',
  TH2: 'sea',
  SEA: 'sea',
  TW2: 'tw',
  VN2: 'vn',
  ME1: 'me',
};

export function revealRegionSlug(region: string | null | undefined): string {
  const key = String(region || '').trim().toUpperCase();
  if (!key) return '';
  return REVEAL_REGION_SLUGS[key] || key.toLowerCase();
}

export function buildRevealUrl(provider: string, region: string | null | undefined, names: string[]): string {
  const r = revealRegionSlug(region);
  const encoded = encodeURIComponent(names.join(','));
  if (provider === 'opgg') {
    return `https://op.gg/lol/multisearch/${r}?summoners=${encoded}`;
  }
  return `https://porofessor.gg/pregame/${r}/${encoded}/soloqueue/season`;
}

export function makeReveal({
  lcu,
  region,
  open,
}: {
  lcu: Pick<Lcu, 'get'>;
  region: string | null | undefined;
  open: (url: string) => unknown;
}): Reveal {
  return {
    async reveal(provider: string): Promise<RevealResult> {
      let session: ChampSelectSession | null;
      try {
        session = await lcu.get<ChampSelectSession | null>(CHAMP_SELECT_ROUTE);
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
