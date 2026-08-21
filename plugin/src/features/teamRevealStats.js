import { resolveChampSelectPuuid } from './champSelectPuuid.js';
import { formatRiotId, SUMMONER_BY_PUUID_ROUTE, SUMMONER_BY_ID_ROUTE } from './reveal.js';
import { createSgpContext, fetchQueueMatchHistory, normalizeMatchGames } from './sgpMatchHistory.js';

export const TEAM_REVEAL_SAMPLE_SIZE = 50;
export const TEAM_REVEAL_SAMPLE_SIZES = [20, 50, 100];
export const TEAM_REVEAL_SEASON_SAMPLE_SIZE = 100;
export const TEAM_REVEAL_SEASON_MAX = 300;
export const TEAM_REVEAL_NATIVE_HISTORY_MAX = 100;
export const TEAM_REVEAL_FETCH_CONCURRENCY = 1;
export const TEAM_REVEAL_FETCH_CONCURRENCIES = [1, 2, 3, 5];
export const TEAM_REVEAL_RECENT_GAMES = 5;
export const LAST_12H_MS = 12 * 60 * 60 * 1000;

export const MATCH_POOL_RANKED_BOTH = 'ranked_both';
export const MATCH_POOL_CURRENT_QUEUE = 'current_queue';
export const MATCH_POOL_ANY = 'any';

export const RANKED_QUEUE_BY_ID = {
  420: 'RANKED_SOLO_5x5',
  440: 'RANKED_FLEX_SR',
};

export const RANKED_SOLO = 'RANKED_SOLO_5x5';
export const RANKED_FLEX = 'RANKED_FLEX_SR';

export function normalizeMatchPool(value, fallback = MATCH_POOL_RANKED_BOTH) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === MATCH_POOL_RANKED_BOTH || raw === MATCH_POOL_CURRENT_QUEUE || raw === MATCH_POOL_ANY) {
    return raw;
  }
  return fallback;
}

export function normalizeSampleSize(value, fallback = TEAM_REVEAL_SAMPLE_SIZE) {
  const n = Number(value) || 0;
  return TEAM_REVEAL_SAMPLE_SIZES.includes(n) ? n : fallback;
}

export function normalizeFetchConcurrency(value, fallback = TEAM_REVEAL_FETCH_CONCURRENCY) {
  const n = Number(value) || 0;
  return TEAM_REVEAL_FETCH_CONCURRENCIES.includes(n) ? n : fallback;
}

export function filterMatchEntriesByPool(entries, queueId, pool) {
  const list = Array.isArray(entries) ? entries : [];
  const mode = normalizeMatchPool(pool);
  const qid = Number(queueId) || 0;
  if (mode === MATCH_POOL_ANY) return list;
  if (mode === MATCH_POOL_RANKED_BOTH) {
    return list.filter((entry) => Boolean(RANKED_QUEUE_BY_ID[Number(entry?.queueId) || 0]));
  }
  if (!qid) return list;
  return list.filter((entry) => Number(entry?.queueId) === qid);
}

export function recommendFetchConcurrency({ lastMs, lastConcurrency } = {}) {
  const prev = normalizeFetchConcurrency(lastConcurrency);
  const ms = Number(lastMs) || 0;
  if (ms <= 0) return prev;
  if (ms > 15000 && prev > 1) {
    const idx = TEAM_REVEAL_FETCH_CONCURRENCIES.indexOf(prev);
    return TEAM_REVEAL_FETCH_CONCURRENCIES[Math.max(0, idx - 1)];
  }
  if (ms >= 8000 && prev === 1) return 2;
  return prev;
}

export function estimateRevealDurationMs({
  concurrency,
  lastMs,
  lastConcurrency,
} = {}) {
  const next = normalizeFetchConcurrency(concurrency);
  const prev = normalizeFetchConcurrency(lastConcurrency);
  const ms = Number(lastMs) || 0;
  if (ms > 0 && prev > 0) {
    return Math.round(ms * (prev / next));
  }
  return Math.round(Math.ceil(5 / next) * 3500);
}
export function readAssignedPosition(player) {
  const raw = String(player?.assignedPosition ?? player?.position ?? '').trim().toUpperCase();
  if (!raw || raw === 'UNSELECTED') return '';
  return raw;
}

function playerIdentityKey(player) {
  const puuid = String(player?.puuid || '').trim();
  if (puuid) return `p:${puuid}`;
  const summonerId = Number(player?.summonerId) || 0;
  if (summonerId) return `s:${summonerId}`;
  const obf = String(player?.obfuscatedPuuid || player?.obf || '').trim();
  if (obf) return `o:${obf}`;
  const riotId = String(player?.riotId || formatRiotId(player) || '')
    .trim()
    .toLowerCase();
  if (riotId) return `r:${riotId}`;
  return '';
}

export function remapSnapshotToSession(snapshot, session) {
  if (!Array.isArray(snapshot) || !snapshot.length) {
    return { rows: snapshot || [], changed: false, ok: false };
  }
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  if (!team.length) return { rows: snapshot, changed: false, ok: false };

  const byIdentity = new Map();
  for (const row of snapshot) {
    const key = playerIdentityKey(row);
    if (key) byIdentity.set(key, row);
  }

  const localCellId = Number(session?.localPlayerCellId ?? -1);
  let changed = false;
  const rows = [];
  for (let index = 0; index < team.length; index += 1) {
    const player = team[index];
    const cellId = Number(player?.cellId ?? index);
    const key = playerIdentityKey(player);
    const prev = key ? byIdentity.get(key) : null;
    if (!prev) return { rows: snapshot, changed: false, ok: false };
    const assignedPosition = readAssignedPosition(player);
    const isLocalPlayer = cellId === localCellId;
    if (
      Number(prev.cellId) !== cellId ||
      (prev.assignedPosition || '') !== assignedPosition ||
      Boolean(prev.isLocalPlayer) !== isLocalPlayer
    ) {
      changed = true;
    }
    rows.push({
      ...prev,
      cellId,
      assignedPosition,
      isLocalPlayer,
    });
  }

  if (rows.length !== snapshot.length) return { rows: snapshot, changed: false, ok: false };
  rows.sort((a, b) => a.cellId - b.cellId);
  return { rows, changed, ok: true };
}

export function readLobbyKey(session) {
  if (!session) return '';
  const gameId = session.gameId ?? session.gameData?.gameId;
  if (gameId != null && Number(gameId) !== 0) return `game:${gameId}`;
  const chat =
    session.chatDetails?.chatRoomName ??
    session.chatDetails?.multiUserChatId ??
    session.chatDetails?.mucJwtDto?.channelClaim;
  if (chat) return `chat:${chat}`;
  if (session.counter != null && session.counter >= 0) return `counter:${session.counter}`;
  return '';
}

export function matchHistoryRoute(puuid, sampleSize = TEAM_REVEAL_SAMPLE_SIZE) {
  return `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=${sampleSize}`;
}

export function rankedStatsRoute(puuid) {
  return `/lol-ranked/v1/ranked-stats/${puuid}`;
}

export function leagueLaddersRoute(puuid) {
  return `/lol-ranked/v1/league-ladders/${puuid}`;
}

export function currentSeasonRoute() {
  return '/lol-seasons/v1/season/product/LOL';
}

export function readCurrentSeasonId(payload) {
  if (!payload) return 0;
  if (typeof payload.seasonId === 'number') return payload.seasonId;
  const seasons = Array.isArray(payload)
    ? payload
    : payload.seasons || payload.currentSplitSeasons || payload.splitSeasons || [];
  for (const season of seasons) {
    if (season?.isActive || season?.active) {
      return readNumber(season.id ?? season.seasonId);
    }
  }
  if (!seasons.length) return 0;
  const sorted = [...seasons].sort(
    (a, b) => readNumber(b.id ?? b.seasonId) - readNumber(a.id ?? a.seasonId),
  );
  return readNumber(sorted[0]?.id ?? sorted[0]?.seasonId);
}

function readGameSeasonId(game) {
  return readNumber(game?.seasonId ?? game?.gameSeasonId ?? game?.season?.id ?? game?.season?.seasonId);
}

export function formatWl(wins, losses, winRate) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const total = w + l;
  const rate = winRate ?? (total ? Math.round((w / total) * 100) : 0);
  return `${w}W/${l}L · ${rate}%`;
}

export function formatWlPair(wins, losses) {
  return `${wins ?? 0}W/${losses ?? 0}L`;
}

export function readRankedQueueType(queueId) {
  return RANKED_QUEUE_BY_ID[Number(queueId)] || '';
}

function readQueueId(session) {
  const fromQueue = session?.gameData?.queue;
  return Number(fromQueue?.id ?? fromQueue?.queueId ?? session?.gameData?.queueId ?? 0) || 0;
}

function readGames(payload, puuid = '') {
  return normalizeMatchGames(payload, puuid);
}

export function seasonHistoryCount(rank, fallback = TEAM_REVEAL_SEASON_SAMPLE_SIZE) {
  const wins = rank?.wins || 0;
  const losses = rank?.losses || 0;
  const total = wins + losses;
  if (wins > 0 && losses === 0) {
    return Math.min(Math.max(Math.ceil(wins / 0.55), fallback), TEAM_REVEAL_SEASON_MAX);
  }
  if (total <= 0) return fallback;
  return Math.min(Math.max(total, fallback), TEAM_REVEAL_SEASON_MAX);
}

function readGameQueueId(game) {
  return Number(game?.queueId ?? game?.gameQueueConfigId ?? game?.queue?.id ?? 0) || 0;
}

function pickParticipant(game, puuid) {
  const participants = Array.isArray(game?.participants) ? game.participants : [];
  return (
    participants.find((p) => p?.puuid === puuid || p?.playerPuuid === puuid || p?.summoner?.puuid === puuid) ||
    null
  );
}

function readWin(game, participant) {
  const raw = participant?.stats?.win ?? participant?.win ?? game?.win;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === 'string') return raw.toLowerCase() === 'win' || raw.toLowerCase() === 'true';
  return false;
}

function readNumber(value) {
  return Number(value) || 0;
}

function readChampionId(game, participant) {
  return readNumber(participant?.championId ?? participant?.champion?.id ?? game?.championId);
}

function readTimestamp(game) {
  return (
    readNumber(game?.gameCreation) ||
    readNumber(game?.gameCreationDate) ||
    readNumber(game?.gameEndTimestamp) ||
    readNumber(game?.gameStartTime) ||
    0
  );
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function readCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function rankEntryScore(entry) {
  if (!entry) return -1;
  return readCount(entry.losses) * 100 + readCount(entry.games);
}

function listRankedQueueEntries(payload) {
  const out = [];
  const queueMap = payload?.queueMap && typeof payload.queueMap === 'object' ? payload.queueMap : {};
  for (const [key, entry] of Object.entries(queueMap)) {
    if (!entry || typeof entry !== 'object') continue;
    out.push({ ...entry, queueType: entry.queueType || key });
  }
  for (const entry of Array.isArray(payload?.queues) ? payload.queues : []) {
    if (!entry || typeof entry !== 'object') continue;
    out.push(entry);
  }
  return out;
}

function pickQueueEntry(payload, queueType) {
  const matched = listRankedQueueEntries(payload).filter(
    (entry) => String(entry.queueType || '') === queueType,
  );
  if (!matched.length) return payload?.queueMap?.[queueType] || null;
  matched.sort((a, b) => rankEntryScore(b) - rankEntryScore(a));
  return matched[0];
}

function readQueueRank(entry) {
  if (!entry) {
    return {
      tier: '',
      division: '',
      lp: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      hasRank: false,
    };
  }
  const wins = readCount(entry.wins ?? entry.currentSeasonWinsForRewards);
  const games = readCount(entry.games);
  const parsedLosses = entry.losses != null && entry.losses !== ''
    ? readCount(entry.losses)
    : entry.loss != null && entry.loss !== ''
      ? readCount(entry.loss)
      : null;
  const losses = parsedLosses != null && !(parsedLosses === 0 && games > wins)
    ? parsedLosses
    : games >= wins && games > 0
      ? games - wins
      : parsedLosses ?? 0;
  const total = wins + losses;
  const tier = String(entry.tier || '').trim();
  const division = String(entry.division || entry.rank || '').trim();
  return {
    tier,
    division,
    lp: readCount(entry.leaguePoints),
    wins,
    losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    hasRank: Boolean(tier && tier !== 'NONE' && tier !== 'UNRANKED') || total > 0,
  };
}

export function readRankedQueues(rankedPayload) {
  return {
    solo: readQueueRank(pickQueueEntry(rankedPayload, RANKED_SOLO)),
    flex: readQueueRank(pickQueueEntry(rankedPayload, RANKED_FLEX)),
  };
}

function emptyPlayerStats() {
  return {
    wins: 0,
    losses: 0,
    winRate: 0,
    kda: 0,
    last12hWins: 0,
    last12hLosses: 0,
    mostPlayedChampionId: 0,
    mostPlayedCount: 0,
    matchesUsed: 0,
    queueScopedMatches: 0,
    recentGames: [],
    pickedChampionId: 0,
    pickedGames: 0,
    pickedWins: 0,
    pickedLosses: 0,
    pickedWinRate: 0,
  };
}

function emptyPickedChampionStats() {
  return {
    pickedChampionId: 0,
    pickedGames: 0,
    pickedWins: 0,
    pickedLosses: 0,
    pickedWinRate: 0,
  };
}

function emptySeasonMain() {
  return {
    seasonMostPlayedChampionId: 0,
    seasonMostPlayedCount: 0,
    seasonMostPlayedWins: 0,
    seasonMostPlayedLosses: 0,
    seasonMostPlayedWinRate: 0,
  };
}

function makeRevealRow({
  cellId,
  puuid,
  riotId,
  isLocalPlayer,
  rankedQueueType,
  ranks,
  assignedPosition = '',
  stats = emptyPlayerStats(),
  seasonMain = emptySeasonMain(),
  season,
}) {
  return {
    cellId,
    puuid,
    riotId,
    isLocalPlayer,
    rankedQueueType,
    assignedPosition,
    soloRank: ranks.solo,
    flexRank: ranks.flex,
    ...stats,
    ...seasonMain,
    ...season,
  };
}

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () => worker());
  if (workers.length) await Promise.all(workers);
  return results;
}

function readSeasonStats(ranks, queueType) {
  const empty = {
    seasonWins: 0,
    seasonLosses: 0,
    seasonWinRate: 0,
    seasonTier: '',
    seasonDivision: '',
    seasonLp: 0,
    hasSeason: false,
  };
  if (!queueType) return empty;
  const rank = queueType === RANKED_FLEX ? ranks.flex : queueType === RANKED_SOLO ? ranks.solo : null;
  if (!rank) return empty;
  return {
    seasonWins: rank.wins,
    seasonLosses: rank.losses,
    seasonWinRate: rank.winRate,
    seasonTier: rank.tier,
    seasonDivision: rank.division,
    seasonLp: rank.lp,
    hasSeason: rank.hasRank,
  };
}

function resolveParticipantByIdentity(game, puuid) {
  const identities = Array.isArray(game?.participantIdentities) ? game.participantIdentities : [];
  const participants = Array.isArray(game?.participants) ? game.participants : [];
  const identity = identities.find((entry) => {
    const player = entry?.player || {};
    const idPuuid = player?.puuid || player?.playerPuuid || player?.summoner?.puuid;
    return idPuuid === puuid;
  });
  if (!identity?.participantId) return null;
  return participants.find((entry) => Number(entry?.participantId) === Number(identity.participantId)) || null;
}

function resolveParticipant(game, puuid) {
  return pickParticipant(game, puuid) || resolveParticipantByIdentity(game, puuid);
}

function listParticipantEntries(games, puuid) {
  const entries = [];
  for (const game of games) {
    const participant = resolveParticipant(game, puuid);
    if (!participant) continue;
    entries.push({
      game,
      participant,
      queueId: readGameQueueId(game),
    });
  }
  return entries;
}

function summarizeEntries(selected, now) {
  let wins = 0;
  let losses = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let last12hWins = 0;
  let last12hLosses = 0;
  const championCounts = new Map();
  const windowStart = now - LAST_12H_MS;

  for (const entry of selected) {
    const game = entry.game;
    const participant = entry.participant;

    const didWin = readWin(game, participant);
    if (didWin) wins += 1;
    else losses += 1;

    kills += readNumber(participant?.stats?.kills ?? participant?.kills);
    deaths += readNumber(participant?.stats?.deaths ?? participant?.deaths);
    assists += readNumber(participant?.stats?.assists ?? participant?.assists);

    const playedAt = readTimestamp(game);
    if (playedAt >= windowStart && playedAt <= now) {
      if (didWin) last12hWins += 1;
      else last12hLosses += 1;
    }

    const championId = readChampionId(game, participant);
    if (championId) {
      championCounts.set(championId, (championCounts.get(championId) || 0) + 1);
    }
  }

  const total = wins + losses;
  let mostPlayedChampionId = 0;
  let mostPlayedCount = 0;
  for (const [championId, count] of championCounts.entries()) {
    const bestCount = championCounts.get(mostPlayedChampionId) || 0;
    if (!mostPlayedChampionId || count > bestCount || (count === bestCount && championId < mostPlayedChampionId)) {
      mostPlayedChampionId = championId;
      mostPlayedCount = count;
    }
  }

  return {
    wins,
    losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    kda: deaths ? round2((kills + assists) / deaths) : round2(kills + assists),
    last12hWins,
    last12hLosses,
    mostPlayedChampionId,
    mostPlayedCount,
    matchesUsed: selected.length,
    queueScopedMatches: selected.length,
  };
}

export function buildPickedChampionStats(
  games,
  puuid,
  championId,
  queueId,
  pool = MATCH_POOL_RANKED_BOTH,
) {
  const empty = emptyPickedChampionStats();
  const id = readNumber(championId);
  if (!puuid || !id) return empty;
  const selected = filterMatchEntriesByPool(listParticipantEntries(games, puuid), queueId, pool).filter(
    (entry) => readChampionId(entry.game, entry.participant) === id,
  );
  let wins = 0;
  let losses = 0;
  for (const entry of selected) {
    if (readWin(entry.game, entry.participant)) wins += 1;
    else losses += 1;
  }
  const total = wins + losses;
  return {
    pickedChampionId: id,
    pickedGames: total,
    pickedWins: wins,
    pickedLosses: losses,
    pickedWinRate: total ? Math.round((wins / total) * 100) : 0,
  };
}

function buildPlayerStats(
  games,
  puuid,
  queueId,
  now,
  {
    recentPool = MATCH_POOL_RANKED_BOTH,
    last5Pool = MATCH_POOL_CURRENT_QUEUE,
    sampleSize = TEAM_REVEAL_SAMPLE_SIZE,
    pickedChampionId = 0,
  } = {},
) {
  const entries = listParticipantEntries(games, puuid);
  const byRecent = filterMatchEntriesByPool(entries, queueId, recentPool).sort(
    (a, b) => readTimestamp(b.game) - readTimestamp(a.game),
  );
  const recentSelected = byRecent.slice(0, sampleSize);
  const last5Selected = filterMatchEntriesByPool(entries, queueId, last5Pool);
  const summary = summarizeEntries(recentSelected, now);
  const picked = buildPickedChampionStats(games, puuid, pickedChampionId, queueId, recentPool);

  return {
    ...summary,
    ...picked,
    recentGames: listRecentGames(last5Selected),
  };
}

function listRecentGames(entries, limit = TEAM_REVEAL_RECENT_GAMES) {
  const ordered = [...entries].sort((a, b) => readTimestamp(b.game) - readTimestamp(a.game));
  return ordered.slice(0, limit).map((entry) => ({
    championId: readChampionId(entry.game, entry.participant),
    win: readWin(entry.game, entry.participant),
    kills: readNumber(entry.participant?.stats?.kills ?? entry.participant?.kills),
    deaths: readNumber(entry.participant?.stats?.deaths ?? entry.participant?.deaths),
    assists: readNumber(entry.participant?.stats?.assists ?? entry.participant?.assists),
  }));
}

function pickMostPlayedChampion(championStats) {
  let championId = 0;
  let games = 0;
  for (const [id, stat] of championStats.entries()) {
    const count = stat.wins + stat.losses;
    if (!championId || count > games || (count === games && id < championId)) {
      championId = id;
      games = count;
    }
  }
  return { championId, games };
}

function listScopedEntries(games, puuid, queueId) {
  const entries = [];
  for (const game of games) {
    const participant = resolveParticipant(game, puuid);
    if (!participant) continue;
    entries.push({
      game,
      participant,
      queueId: readGameQueueId(game),
    });
  }
  const queueScoped = queueId ? entries.filter((entry) => !entry.queueId || entry.queueId === queueId) : entries;
  return queueScoped.length > 0 ? queueScoped : entries;
}

export function buildSeasonChampionStats(games, puuid, queueId, seasonId) {
  const empty = {
    seasonMostPlayedChampionId: 0,
    seasonMostPlayedCount: 0,
    seasonMostPlayedWins: 0,
    seasonMostPlayedLosses: 0,
    seasonMostPlayedWinRate: 0,
  };
  if (!puuid) return empty;

  const scoped = listScopedEntries(games, puuid, queueId);
  const hasSeasonOnGames = scoped.some((entry) => readGameSeasonId(entry.game) > 0);
  const seasonScoped =
    hasSeasonOnGames && seasonId
      ? scoped.filter((entry) => readGameSeasonId(entry.game) === seasonId)
      : scoped;
  const selected = seasonScoped.length > 0 ? seasonScoped : scoped;
  const championStats = new Map();

  for (const entry of selected) {
    const championId = readChampionId(entry.game, entry.participant);
    if (!championId) continue;
    const stat = championStats.get(championId) || { wins: 0, losses: 0 };
    if (readWin(entry.game, entry.participant)) stat.wins += 1;
    else stat.losses += 1;
    championStats.set(championId, stat);
  }

  const { championId, games: gamesPlayed } = pickMostPlayedChampion(championStats);
  if (!championId) return empty;

  const best = championStats.get(championId);
  const wins = best.wins;
  const losses = best.losses;
  return {
    seasonMostPlayedChampionId: championId,
    seasonMostPlayedCount: gamesPlayed,
    seasonMostPlayedWins: wins,
    seasonMostPlayedLosses: losses,
    seasonMostPlayedWinRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
  };
}

async function resolveIdentity(player, lcu) {
  const direct = formatRiotId(player);
  if (direct && player?.puuid) return { riotId: direct, puuid: player.puuid };

  const resolvedPuuid = resolveChampSelectPuuid(player);
  if (direct && resolvedPuuid) return { riotId: direct, puuid: resolvedPuuid };
  if (direct) return { riotId: direct, puuid: '' };

  if (resolvedPuuid) {
    try {
      const resolved = await lcu.get(SUMMONER_BY_PUUID_ROUTE(resolvedPuuid));
      return {
        riotId: formatRiotId(resolved),
        puuid: resolved?.puuid || resolvedPuuid,
      };
    } catch {
      return { riotId: '', puuid: resolvedPuuid };
    }
  }

  if (!player?.summonerId) return { riotId: '', puuid: '' };
  try {
    const resolved = await lcu.get(SUMMONER_BY_ID_ROUTE(player.summonerId));
    return {
      riotId: formatRiotId(resolved),
      puuid: resolved?.puuid || '',
    };
  } catch {
    return { riotId: '', puuid: '' };
  }
}

async function getSafe(lcu, route) {
  try {
    return await lcu.get(route);
  } catch {
    return null;
  }
}

function readPickedChampionId(player) {
  return (
    readNumber(player?.championId) ||
    readNumber(player?.selectedChampionId) ||
    readNumber(player?.championPickIntent)
  );
}

export async function buildTeamRevealSnapshot({
  session,
  lcu,
  fetchImpl = fetch,
  sampleSize = TEAM_REVEAL_SAMPLE_SIZE,
  seasonSampleSize = TEAM_REVEAL_SEASON_SAMPLE_SIZE,
  recentPool = MATCH_POOL_RANKED_BOTH,
  last5Pool = MATCH_POOL_CURRENT_QUEUE,
  fetchConcurrency = TEAM_REVEAL_FETCH_CONCURRENCY,
  now = Date.now(),
  onProgress,
  signal,
}) {
  if (signal?.aborted) return [];
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  const localCellId = Number(session?.localPlayerCellId ?? -1);
  const queueId = readQueueId(session);
  const rankedQueueType = readRankedQueueType(queueId);
  const sample = normalizeSampleSize(sampleSize);
  const concurrency = normalizeFetchConcurrency(fetchConcurrency);
  const recentMode = normalizeMatchPool(recentPool);
  const last5Mode = normalizeMatchPool(last5Pool, MATCH_POOL_CURRENT_QUEUE);
  const historyQueueId =
    recentMode === MATCH_POOL_CURRENT_QUEUE && last5Mode === MATCH_POOL_CURRENT_QUEUE ? queueId : 0;

  const [seasonPayload, sgp] = await Promise.all([
    getSafe(lcu, currentSeasonRoute()),
    createSgpContext(lcu),
  ]);
  const currentSeasonId = readCurrentSeasonId(seasonPayload);
  if (signal?.aborted) return [];

  const shells = await mapPool(team, concurrency, async (player, index) => {
    const cellId = Number(player?.cellId ?? index);
    const identity = await resolveIdentity(player, lcu);
    const puuid = identity.puuid;
    const riotId = identity.riotId;
    let rankedPayload = null;
    if (puuid) {
      try {
        rankedPayload = await lcu.get(rankedStatsRoute(puuid));
      } catch {
      }
    }
    const ranks = readRankedQueues(rankedPayload);
    await yieldUi();
    return makeRevealRow({
      cellId,
      puuid,
      riotId,
      isLocalPlayer: cellId === localCellId,
      rankedQueueType,
      assignedPosition: readAssignedPosition(player),
      ranks,
      season: readSeasonStats(ranks, rankedQueueType),
      stats: {
        ...emptyPlayerStats(),
        ...buildPickedChampionStats([], puuid, readPickedChampionId(player), queueId, recentMode),
      },
    });
  });

  shells.sort((a, b) => a.cellId - b.cellId);
  if (signal?.aborted) return [];
  if (typeof onProgress === 'function') onProgress(shells);
  if (signal?.aborted) return [];

  const byCellPlayer = new Map(team.map((player) => [Number(player?.cellId), player]));

  const rows = await mapPool(shells, concurrency, async (shell) => {
    if (signal?.aborted) return shell;
    await yieldUi();
    if (signal?.aborted) return shell;
    const puuid = shell.puuid;
    let games = [];
    const rankedForQueue = queueId === 440 ? shell.flexRank : shell.soloRank;
    const historyCount = Math.max(
      sample * (historyQueueId ? 1 : 3),
      seasonHistoryCount(rankedForQueue, seasonSampleSize),
    );
    if (puuid) {
      games = await fetchQueueMatchHistory({
        lcu,
        fetchImpl,
        puuid,
        queueId: historyQueueId,
        count: historyCount,
        sgp,
        signal,
      });
      if (!games.length && historyQueueId === 0 && queueId) {
        games = await fetchQueueMatchHistory({
          lcu,
          fetchImpl,
          puuid,
          queueId,
          count: historyCount,
          sgp,
          signal,
        });
      }
      if (!games.length) {
        try {
          games = readGames(
            await lcu.get(matchHistoryRoute(puuid, Math.min(historyCount, TEAM_REVEAL_NATIVE_HISTORY_MAX))),
            puuid,
          );
        } catch {
        }
      }
    }
    const ranks = { solo: shell.soloRank, flex: shell.flexRank };
    const player = byCellPlayer.get(Number(shell.cellId));
    const pickedChampionId = readPickedChampionId(player);
    const stats = puuid
      ? buildPlayerStats(games, puuid, queueId, now, {
          recentPool: recentMode,
          last5Pool: last5Mode,
          sampleSize: sample,
          pickedChampionId,
        })
      : emptyPlayerStats();
    const seasonMain = puuid
      ? buildSeasonChampionStats(games, puuid, queueId, currentSeasonId)
      : emptySeasonMain();
    await yieldUi();
    return {
      ...makeRevealRow({
        cellId: shell.cellId,
        puuid,
        riotId: shell.riotId,
        isLocalPlayer: shell.isLocalPlayer,
        rankedQueueType,
        assignedPosition: shell.assignedPosition,
        ranks,
        stats,
        seasonMain,
        season: readSeasonStats(ranks, rankedQueueType),
      }),
      historyGames: games,
    };
  });

  if (signal?.aborted) return [];
  return rows;
}

export function refreshPickedChampionOnRows(rows, session, recentPool = MATCH_POOL_RANKED_BOTH) {
  if (!Array.isArray(rows) || !rows.length) return { rows: rows || [], changed: false };
  const queueId = readQueueId(session);
  const recentMode = normalizeMatchPool(recentPool);
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  const byCell = new Map(team.map((player) => [Number(player?.cellId), player]));
  let changed = false;
  const next = rows.map((row) => {
    const player = byCell.get(Number(row.cellId));
    const pickedChampionId = readPickedChampionId(player);
    if (pickedChampionId === Number(row.pickedChampionId || 0)) return row;
    changed = true;
    const picked = buildPickedChampionStats(
      row.historyGames || [],
      row.puuid,
      pickedChampionId,
      queueId,
      recentMode,
    );
    return { ...row, ...picked };
  });
  return { rows: next, changed };
}
