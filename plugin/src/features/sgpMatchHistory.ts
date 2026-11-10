import type { FetchLike, Lcu } from '../lcu';
import type { HttpFetch } from './proxyFetch';

export const ENTITLEMENTS_ROUTE = '/entitlements/v1/token';
export const CHAT_ME_ROUTE = '/lol-chat/v1/me';

const SGP_SERVERS: Record<string, { matchHistory: string }> = {
  TW2: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  SG2: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  PH2: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  VN2: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  TH2: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  JP1: { matchHistory: 'https://apne1-red.pp.sgp.pvp.net' },
  KR: { matchHistory: 'https://apne1-red.pp.sgp.pvp.net' },
  NA1: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  BR1: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  LA1: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  LA2: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  OC1: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  EUW: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net' },
  EUN1: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net' },
  TR1: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net' },
  RU: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net' },
  PBE: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  EUC1: { matchHistory: 'https://euc1-red.pp.sgp.pvp.net' },
  USW2: { matchHistory: 'https://usw2-red.pp.sgp.pvp.net' },
  APSE1: { matchHistory: 'https://apse1-red.pp.sgp.pvp.net' },
  APNE1: { matchHistory: 'https://apne1-red.pp.sgp.pvp.net' },
  TENCENT_HN1: { matchHistory: 'https://hn1-k8s-sgp.lol.qq.com:21019' },
  TENCENT_HN10: { matchHistory: 'https://hn10-k8s-sgp.lol.qq.com:21019' },
  TENCENT_TJ100: { matchHistory: 'https://tj100-sgp.lol.qq.com:21019' },
  TENCENT_TJ101: { matchHistory: 'https://tj101-sgp.lol.qq.com:21019' },
  TENCENT_NJ100: { matchHistory: 'https://nj100-sgp.lol.qq.com:21019' },
  TENCENT_GZ100: { matchHistory: 'https://gz100-sgp.lol.qq.com:21019' },
  TENCENT_CQ100: { matchHistory: 'https://cq100-sgp.lol.qq.com:21019' },
  TENCENT_BGP2: { matchHistory: 'https://bgp2-k8s-sgp.lol.qq.com:21019' },
  TENCENT_PBE: { matchHistory: 'https://pbe-sgp.lol.qq.com:21019' },
  TENCENT_PREPBE: { matchHistory: 'https://prepbe-sgp.lol.qq.com:21019' },
};

const PLATFORM_ID_TO_SGP_KEY: Record<string, string> = {
  EUW1: 'EUW',
  EUN: 'EUN1',
  EUNE: 'EUN1',
  EUN1: 'EUN1',
  RU1: 'RU',
  NA: 'NA1',
  OCE: 'OC1',
  BR1: 'BR1',
  JP1: 'JP1',
  KR: 'KR',
  LA1: 'LA1',
  LA2: 'LA2',
  OC1: 'OC1',
  TR1: 'TR1',
  TW2: 'TW2',
  SG2: 'SG2',
  PH2: 'PH2',
  VN2: 'VN2',
  TH2: 'TH2',
  PBE: 'PBE',
};

const TENCENT_PLATFORM_IDS = new Set([
  'HN1', 'HN2', 'HN3', 'HN4', 'HN5', 'HN6', 'HN7', 'HN8', 'HN9',
  'HN10', 'HN11', 'HN12', 'HN13', 'HN14', 'HN15', 'HN16', 'HN17', 'HN18', 'HN19',
  'WT1', 'WT2', 'WT3', 'WT4', 'WT5', 'WT6', 'WT7',
  'EDU1',
  'BGP1', 'BGP2',
  'NJ100', 'GZ100', 'CQ100', 'TJ100', 'TJ101',
  'PBE', 'PREPBE',
]);

export interface EntitlementsToken {
  accessToken?: string;
  issuer?: string;
}

export interface ChatMe {
  platformId?: string;
  puuid?: string;
}

export interface SgpContext {
  accessToken: string;
  serverId: string;
}

interface RawPuuidHolder {
  puuid?: string;
  playerPuuid?: string;
  summoner?: { puuid?: string };
}

export interface RawMatchStats {
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface RawMatchParticipant extends RawPuuidHolder {
  participantId?: number;
  championId?: number;
  champion?: { id?: number };
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
  stats?: RawMatchStats | null;
}

export interface RawParticipantIdentity {
  participantId?: number;
  player?: RawPuuidHolder | null;
}

export interface RawMatchGame {
  json?: RawMatchGame | null;
  queueId?: number;
  gameQueueConfigId?: number;
  queue?: { id?: number };
  seasonId?: number;
  gameSeasonId?: number;
  season?: { id?: number; seasonId?: number };
  gameCreation?: number;
  gameCreationDate?: string;
  gameEndTimestamp?: number;
  gameStartTime?: number;
  championId?: number;
  win?: boolean;
  participants?: (RawMatchParticipant | null)[];
  participantIdentities?: RawParticipantIdentity[];
}

export type MatchHistoryPayload =
  | RawMatchGame[]
  | { games?: RawMatchGame[] | { games?: RawMatchGame[] } }
  | null
  | undefined;

export interface SlimParticipant {
  puuid: string;
  participantId: number | undefined;
  championId: number;
  win: boolean | undefined;
  kills: number | undefined;
  deaths: number | undefined;
  assists: number | undefined;
  stats: RawMatchStats;
}

export interface SlimIdentity {
  participantId: number | undefined;
  player: { puuid: string };
}

export interface SlimMatchGame {
  queueId: number | undefined;
  seasonId: number | undefined;
  gameCreation: number | undefined;
  gameCreationDate: string | undefined;
  gameEndTimestamp: number | undefined;
  gameStartTime: number | undefined;
  championId: number | undefined;
  win: boolean | undefined;
  participants: SlimParticipant[];
  participantIdentities: SlimIdentity[];
}

export interface FetchQueueMatchHistoryOptions {
  lcu?: Pick<Lcu, 'get'> | null;
  fetchImpl?: FetchLike | HttpFetch;
  puuid: string;
  queueId?: number | string;
  count?: number;
  sgp?: SgpContext | null;
  signal?: AbortSignal;
}

export function queueIdToTag(queueId: unknown): string {
  const id = Number(queueId) || 0;
  return id > 0 ? `q_${id}` : '';
}

function normalizeSgpServerKey(rawCode: unknown): string {
  const code = String(rawCode || '').toUpperCase();
  const mapped = PLATFORM_ID_TO_SGP_KEY[code] || code;
  return SGP_SERVERS[mapped] ? mapped : '';
}

function serverIdFromPlatformId(platformId: unknown): string {
  const id = String(platformId || '').toUpperCase();
  if (!id) return '';
  if (TENCENT_PLATFORM_IDS.has(id)) return normalizeSgpServerKey(`TENCENT_${id}`);
  return normalizeSgpServerKey(id);
}

function serverIdFromIssuer(issuer: unknown): string {
  const value = String(issuer || '');
  const tencentMatch = value.match(/https?:\/\/([a-z0-9]+)(?:-[a-z0-9]+)*\.lol\.qq\.com/i);
  if (tencentMatch) return normalizeSgpServerKey(`TENCENT_${tencentMatch[1].toUpperCase()}`);
  const externalMatch =
    value.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.lol\.sgp\.pvp\.net/i) ||
    value.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.(?:lol\.)?sgp\.pvp\.net/i) ||
    value.match(/https?:\/\/([a-z0-9]+)-/i);
  if (externalMatch) return normalizeSgpServerKey(externalMatch[1].toUpperCase());
  return '';
}

export function resolveSgpServerId(
  chatMe: ChatMe | null | undefined,
  token: EntitlementsToken | null | undefined,
): string {
  return serverIdFromPlatformId(chatMe?.platformId) || serverIdFromIssuer(token?.issuer) || '';
}

export function sgpMatchHistoryUrl(
  serverId: string,
  puuid: string,
  { startIndex = 0, count = 100, tag = '' }: { startIndex?: number; count?: number; tag?: string } = {},
): string {
  const base = SGP_SERVERS[serverId]?.matchHistory;
  if (!base || !puuid) return '';
  const params = new URLSearchParams();
  params.set('startIndex', String(startIndex));
  params.set('count', String(count));
  if (tag) params.set('tag', tag);
  return `${base}/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?${params}`;
}

function readPuuid(entry: RawPuuidHolder | null | undefined): string {
  return entry?.puuid || entry?.playerPuuid || entry?.summoner?.puuid || '';
}

function slimParticipant(participant: RawMatchParticipant | null): SlimParticipant | null {
  if (!participant) return null;
  const stats: RawMatchStats = participant.stats && typeof participant.stats === 'object' ? participant.stats : {};
  const win = participant.win ?? stats.win;
  const kills = participant.kills ?? stats.kills;
  const deaths = participant.deaths ?? stats.deaths;
  const assists = participant.assists ?? stats.assists;
  return {
    puuid: readPuuid(participant),
    participantId: participant.participantId,
    championId: participant.championId || participant.champion?.id || 0,
    win,
    kills,
    deaths,
    assists,
    stats: { win, kills, deaths, assists },
  };
}

function slimIdentity(identity: RawParticipantIdentity): SlimIdentity {
  const player = identity?.player || {};
  return {
    participantId: identity.participantId,
    player: { puuid: readPuuid(player) },
  };
}

function participantMatches(participant: RawMatchParticipant | null, puuid: string): boolean {
  return Boolean(puuid) && readPuuid(participant) === puuid;
}

function identityMatches(identity: RawParticipantIdentity, puuid: string): boolean {
  return Boolean(puuid) && readPuuid(identity?.player || {}) === puuid;
}

function slimMatchGame(entry: RawMatchGame | null | undefined, focusPuuid = ''): SlimMatchGame | null {
  if (!entry) return null;
  const json = entry.json && typeof entry.json === 'object' ? entry.json : entry;
  let participants = Array.isArray(json.participants) ? json.participants : [];
  let identities = Array.isArray(json.participantIdentities) ? json.participantIdentities : [];
  if (focusPuuid) {
    const focused = participants.filter(
      (participant): participant is RawMatchParticipant => participantMatches(participant, focusPuuid),
    );
    if (focused.length) {
      participants = focused;
      const keepIds = new Set(focused.map((participant) => Number(participant.participantId)).filter(Boolean));
      identities = identities.filter(
        (identity) =>
          identityMatches(identity, focusPuuid) || keepIds.has(Number(identity.participantId)),
      );
    }
  }
  return {
    queueId: json.queueId ?? json.gameQueueConfigId ?? json.queue?.id,
    seasonId: json.seasonId ?? json.gameSeasonId ?? json.season?.id ?? json.season?.seasonId,
    gameCreation: json.gameCreation,
    gameCreationDate: json.gameCreationDate,
    gameEndTimestamp: json.gameEndTimestamp,
    gameStartTime: json.gameStartTime,
    championId: json.championId,
    win: json.win,
    participants: participants.map(slimParticipant).filter((p): p is SlimParticipant => Boolean(p)),
    participantIdentities: identities.map(slimIdentity),
  };
}

export function normalizeMatchGames(payload: MatchHistoryPayload, focusPuuid = ''): SlimMatchGame[] {
  const games = Array.isArray(payload) ? undefined : payload?.games;
  const list: RawMatchGame[] = Array.isArray(payload)
    ? payload
    : games && !Array.isArray(games) && Array.isArray(games.games)
      ? games.games
      : Array.isArray(games)
        ? games
        : [];
  return list.map((entry) => slimMatchGame(entry, focusPuuid)).filter((g): g is SlimMatchGame => Boolean(g));
}

export async function createSgpContext(lcu: Pick<Lcu, 'get'> | null | undefined): Promise<SgpContext | null> {
  if (!lcu?.get) return null;
  try {
    const token = await lcu.get<EntitlementsToken | null>(ENTITLEMENTS_ROUTE);
    if (!token?.accessToken) return null;
    let chatMe: ChatMe | null = null;
    try {
      chatMe = await lcu.get<ChatMe | null>(CHAT_ME_ROUTE);
    } catch {
    }
    const serverId = resolveSgpServerId(chatMe, token);
    if (!sgpMatchHistoryUrl(serverId, 'x')) return null;
    return { accessToken: token.accessToken, serverId };
  } catch {
    return null;
  }
}

export async function fetchQueueMatchHistory({
  lcu,
  fetchImpl = fetch,
  puuid,
  queueId,
  count,
  sgp = null,
  signal,
}: FetchQueueMatchHistoryOptions): Promise<SlimMatchGame[]> {
  if (!puuid || signal?.aborted) return [];
  try {
    const ctx = sgp === undefined ? await createSgpContext(lcu) : sgp;
    if (!ctx?.accessToken || !ctx.serverId || signal?.aborted) return [];
    const url = sgpMatchHistoryUrl(ctx.serverId, puuid, {
      startIndex: 0,
      count,
      tag: queueIdToTag(queueId),
    });
    if (!url) return [];
    const resp = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
      cache: 'no-store',
      signal,
    });
    if (!resp?.ok) return [];
    return normalizeMatchGames((await resp.json()) as MatchHistoryPayload, puuid);
  } catch {
    return [];
  }
}
