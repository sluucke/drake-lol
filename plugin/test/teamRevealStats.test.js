import { describe, it, expect, vi } from 'vitest';
import { obfuscateChampSelectPuuid } from '../src/features/champSelectPuuid.js';
import {
  buildTeamRevealSnapshot,
  buildSeasonChampionStats,
  formatWl,
  formatWlPair,
  rankedStatsRoute,
  leagueLaddersRoute,
  matchHistoryRoute,
  readCurrentSeasonId,
  readRankedQueues,
  readAssignedPosition,
  readLobbyKey,
  seasonHistoryCount,
} from '../src/features/teamRevealStats.js';

const NOW = new Date('2026-08-18T14:00:00.000Z').getTime();
const QUEUE_ID = 420;
const PUUID_A = '01234567-89ab-cdef-0123-456789abcdef';
const PUUID_B = '89abcdef-0123-4567-89ab-cdef01234567';

function game({
  puuid,
  queueId = QUEUE_ID,
  hoursAgo = 1,
  championId = 1,
  win = true,
  kills = 1,
  deaths = 1,
  assists = 1,
  seasonId = 0,
}) {
  return {
    gameCreation: NOW - hoursAgo * 60 * 60 * 1000,
    queueId,
    seasonId,
    participants: [
      {
        puuid,
        championId,
        stats: { win, kills, deaths, assists },
      },
    ],
  };
}

describe('formatWl', () => {
  it('labels wins and losses', () => {
    expect(formatWl(8, 2, 80)).toBe('8W/2L · 80%');
    expect(formatWlPair(3, 1)).toBe('3W/1L');
  });
});

describe('readAssignedPosition', () => {
  it('reads champ select lane from assignedPosition', () => {
    expect(readAssignedPosition({ assignedPosition: 'JUNGLE' })).toBe('JUNGLE');
    expect(readAssignedPosition({ assignedPosition: 'utility' })).toBe('UTILITY');
    expect(readAssignedPosition({ assignedPosition: 'UNSELECTED' })).toBe('');
    expect(readAssignedPosition({})).toBe('');
  });
});

describe('readLobbyKey', () => {
  it('prefers game id for lobby identity', () => {
    expect(readLobbyKey({ gameId: 123456789 })).toBe('game:123456789');
    expect(readLobbyKey({ chatDetails: { chatRoomName: 'room-a' }, gameId: 99 })).toBe('game:99');
  });

  it('falls back to chat room when game id is missing', () => {
    expect(readLobbyKey({ chatDetails: { chatRoomName: 'room-a' } })).toBe('chat:room-a');
    expect(readLobbyKey({ counter: 3 })).toBe('counter:3');
  });
});

describe('buildTeamRevealSnapshot', () => {
  it('returns ally rows sorted by cellId', async () => {
    const lcu = { get: vi.fn(async () => ({ games: { games: [] } })) };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [
        { cellId: 3, gameName: 'B', tagLine: 'BR', puuid: PUUID_B },
        { cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A },
      ],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out.map((row) => row.cellId)).toEqual([1, 3]);
  });

  it('includes assignedPosition from session players', async () => {
    const lcu = { get: vi.fn(async () => ({ games: { games: [] } })) };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [
        { cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A, assignedPosition: 'TOP' },
        { cellId: 2, gameName: 'B', tagLine: 'BR', puuid: PUUID_B, assignedPosition: 'UTILITY' },
      ],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out.find((row) => row.cellId === 1)?.assignedPosition).toBe('TOP');
    expect(out.find((row) => row.cellId === 2)?.assignedPosition).toBe('UTILITY');
  });

  it('backfills hidden riot id via deobfuscated puuid lookup', async () => {
    const obfuscated = obfuscateChampSelectPuuid(PUUID_A);
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/lol-summoner/v2/summoners/puuid/')) {
          return { gameName: 'HiddenReal', tagLine: 'TAG' };
        }
        return { games: { games: [] } };
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 2, gameName: '', tagLine: '', nameVisibilityType: 'HIDDEN', obfuscatedPuuid: obfuscated }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].riotId).toBe('HiddenReal#TAG');
  });

  it('computes queue-scoped W/L, winrate, KDA, last-12h, and most-played champ', async () => {
    const history = [
      game({ puuid: PUUID_A, queueId: QUEUE_ID, hoursAgo: 1, championId: 12, win: true, kills: 8, deaths: 4, assists: 6 }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, hoursAgo: 2, championId: 12, win: false, kills: 3, deaths: 2, assists: 7 }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, hoursAgo: 12, championId: 22, win: true, kills: 5, deaths: 0, assists: 7 }),
      game({ puuid: PUUID_A, queueId: 440, hoursAgo: 1, championId: 99, win: false, kills: 0, deaths: 5, assists: 1 }),
    ];
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: history } };
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW, sampleSize: 20 });

    expect(out[0].wins).toBe(2);
    expect(out[0].losses).toBe(1);
    expect(out[0].winRate).toBe(67);
    expect(out[0].kda).toBe(6);
    expect(out[0].last12hWins).toBe(2);
    expect(out[0].last12hLosses).toBe(1);
    expect(out[0].mostPlayedChampionId).toBe(12);
    expect(lcu.get).toHaveBeenCalledWith(
      `/lol-match-history/v1/products/lol/${PUUID_A}/matches?begIndex=0&endIndex=100`,
    );
  });

  it('includes the last 5 queue games with champ and KDA', async () => {
    const history = [
      game({ puuid: PUUID_A, hoursAgo: 1, championId: 11, win: true, kills: 8, deaths: 2, assists: 4 }),
      game({ puuid: PUUID_A, hoursAgo: 2, championId: 22, win: false, kills: 1, deaths: 6, assists: 3 }),
      game({ puuid: PUUID_A, hoursAgo: 3, championId: 12, win: true, kills: 5, deaths: 5, assists: 5 }),
      game({ puuid: PUUID_A, hoursAgo: 4, championId: 99, win: true, kills: 10, deaths: 1, assists: 2 }),
      game({ puuid: PUUID_A, hoursAgo: 5, championId: 1, win: false, kills: 0, deaths: 8, assists: 1 }),
      game({ puuid: PUUID_A, hoursAgo: 6, championId: 2, win: true, kills: 9, deaths: 0, assists: 9 }),
      game({ puuid: PUUID_A, queueId: 440, hoursAgo: 0.5, championId: 77, win: true, kills: 20, deaths: 0, assists: 20 }),
    ];
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: history } };
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].recentGames).toEqual([
      { championId: 11, win: true, kills: 8, deaths: 2, assists: 4 },
      { championId: 22, win: false, kills: 1, deaths: 6, assists: 3 },
      { championId: 12, win: true, kills: 5, deaths: 5, assists: 5 },
      { championId: 99, win: true, kills: 10, deaths: 1, assists: 2 },
      { championId: 1, win: false, kills: 0, deaths: 8, assists: 1 },
    ]);
  });

  it('computes season main champion with win rate from season-filtered history', async () => {
    const history = [
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 15, championId: 12, win: true }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 15, championId: 12, win: true }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 15, championId: 12, win: false }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 14, championId: 99, win: true }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 14, championId: 99, win: true }),
      game({ puuid: PUUID_A, queueId: QUEUE_ID, seasonId: 14, championId: 99, win: true }),
    ];
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: history } };
        if (route.includes('/lol-seasons/')) return { seasons: [{ id: 15, isActive: true }] };
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].seasonMostPlayedChampionId).toBe(12);
    expect(out[0].seasonMostPlayedCount).toBe(3);
    expect(out[0].seasonMostPlayedWins).toBe(2);
    expect(out[0].seasonMostPlayedLosses).toBe(1);
    expect(out[0].seasonMostPlayedWinRate).toBe(67);
  });

  it('sizes season history from ranked W/L instead of the native 100-game cap', () => {
    expect(seasonHistoryCount({ wins: 107, losses: 73 })).toBe(180);
  });

  it('loads season main from queue-tagged history beyond 100 games', async () => {
    const yiGames = Array.from({ length: 118 }, (_, index) =>
      game({ puuid: PUUID_A, championId: 11, win: index % 2 === 0, hoursAgo: index + 1, seasonId: 25 }),
    );
    const otherGames = Array.from({ length: 62 }, (_, index) =>
      game({ puuid: PUUID_A, championId: 22, win: true, hoursAgo: 200 + index, seasonId: 25 }),
    );
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        games: [...yiGames, ...otherGames].map((entry) => ({ json: entry })),
      }),
    }));
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/entitlements/v1/token') return { accessToken: 'tok' };
        if (route === '/lol-chat/v1/me') return { platformId: 'BR1' };
        if (route.includes('/matches')) return { games: { games: yiGames.slice(0, 66) } };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'DIAMOND',
                division: 'IV',
                leaguePoints: 12,
                wins: 107,
                losses: 73,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, fetchImpl, now: NOW });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://usw2-red.pp.sgp.pvp.net/match-history-query/v1/products/lol/player/01234567-89ab-cdef-0123-456789abcdef/SUMMARY?startIndex=0&count=180&tag=q_420',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
    expect(out[0].seasonMostPlayedChampionId).toBe(11);
    expect(out[0].seasonMostPlayedCount).toBe(118);
  });

  it('buildSeasonChampionStats breaks ties by lowest champion id', () => {
    const games = [
      game({ puuid: PUUID_A, championId: 20, win: true }),
      game({ puuid: PUUID_A, championId: 20, win: true }),
      game({ puuid: PUUID_A, championId: 11, win: false }),
      game({ puuid: PUUID_A, championId: 11, win: false }),
    ];
    const out = buildSeasonChampionStats(games, PUUID_A, QUEUE_ID, 0);
    expect(out.seasonMostPlayedChampionId).toBe(11);
  });

  it('readCurrentSeasonId prefers active season', () => {
    expect(readCurrentSeasonId({ seasons: [{ id: 14 }, { id: 15, isActive: true }] })).toBe(15);
  });

  it('breaks most-played ties by lowest champion id', async () => {
    const history = [
      game({ puuid: PUUID_A, championId: 20, win: true }),
      game({ puuid: PUUID_A, championId: 20, win: true }),
      game({ puuid: PUUID_A, championId: 11, win: false }),
      game({ puuid: PUUID_A, championId: 11, win: false }),
    ];
    const lcu = {
      get: vi.fn(async () => ({ games: { games: history } })),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].mostPlayedChampionId).toBe(11);
  });

  it('handles zero-death samples without dividing by zero', async () => {
    const history = [game({ puuid: PUUID_A, championId: 9, kills: 7, assists: 5, deaths: 0, win: true })];
    const lcu = {
      get: vi.fn(async () => ({ games: { games: history } })),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].kda).toBe(12);
  });

  it('resolves puuid and riot id from summonerId fallback', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/lol-summoner/v1/summoners/77') {
          return { puuid: PUUID_A, gameName: 'Fallback', tagLine: 'BR1' };
        }
        if (route.includes('/matches')) return { games: { games: [game({ puuid: PUUID_A, win: true })] } };
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 7, summonerId: 77 }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].riotId).toBe('Fallback#BR1');
    expect(out[0].wins).toBe(1);
    expect(lcu.get).toHaveBeenCalledWith('/lol-summoner/v1/summoners/77');
  });

  it('falls back to unfiltered sample when queue-filtered sample is empty', async () => {
    const history = [
      game({ puuid: PUUID_A, queueId: 450, win: true, kills: 6, deaths: 3, assists: 4 }),
      game({ puuid: PUUID_A, queueId: 450, win: false, kills: 1, deaths: 4, assists: 2 }),
    ];
    const lcu = {
      get: vi.fn(async () => ({ games: { games: history } })),
    };
    const session = {
      gameData: { queue: { id: 9999 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].wins).toBe(1);
    expect(out[0].losses).toBe(1);
    expect(out[0].winRate).toBe(50);
    expect(out[0].kda).toBe(1.86);
  });

  it('reads other-player ranked W/L from queues when queueMap omits losses', () => {
    const out = readRankedQueues({
      queueMap: {
        RANKED_SOLO_5x5: {
          queueType: 'RANKED_SOLO_5x5',
          tier: 'DIAMOND',
          division: 'IV',
          leaguePoints: 12,
          wins: 107,
        },
      },
      queues: [
        {
          queueType: 'RANKED_SOLO_5x5',
          tier: 'DIAMOND',
          division: 'IV',
          leaguePoints: 12,
          wins: 107,
          losses: 73,
        },
      ],
    });

    expect(out.solo.wins).toBe(107);
    expect(out.solo.losses).toBe(73);
    expect(out.solo.winRate).toBe(59);
    expect(out.solo.tier).toBe('DIAMOND');
  });

  it('derives ranked losses from games when losses is missing', () => {
    const out = readRankedQueues({
      queueMap: {
        RANKED_SOLO_5x5: {
          tier: 'DIAMOND',
          rank: 'IV',
          wins: 107,
          games: 180,
        },
      },
    });

    expect(out.solo.division).toBe('IV');
    expect(out.solo.wins).toBe(107);
    expect(out.solo.losses).toBe(73);
    expect(out.solo.winRate).toBe(59);
  });

  it('ignores placeholder zero losses when games count is present', () => {
    const out = readRankedQueues({
      queueMap: {
        RANKED_SOLO_5x5: {
          tier: 'DIAMOND',
          division: 'IV',
          wins: 107,
          losses: 0,
          games: 180,
        },
      },
    });

    expect(out.solo.wins).toBe(107);
    expect(out.solo.losses).toBe(73);
  });

  it('does not call league ladders when ranked-stats omits losses', async () => {
    const games = [
      ...Array.from({ length: 107 }, (_, index) =>
        game({ puuid: PUUID_A, win: true, hoursAgo: index + 1, seasonId: 25 }),
      ),
      ...Array.from({ length: 73 }, (_, index) =>
        game({ puuid: PUUID_A, win: false, hoursAgo: 108 + index, seasonId: 25 }),
      ),
    ];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ games: games.map((entry) => ({ json: entry })) }),
    }));
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/entitlements/v1/token') return { accessToken: 'tok' };
        if (route === '/lol-chat/v1/me') return { platformId: 'BR1' };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'DIAMOND',
                division: 'IV',
                leaguePoints: 12,
                wins: 107,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: 420 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, fetchImpl, now: NOW });

    expect(lcu.get).not.toHaveBeenCalledWith(leagueLaddersRoute(PUUID_A));
    expect(out[0].soloRank.tier).toBe('DIAMOND');
    expect(out[0].soloRank.wins).toBe(107);
    expect(out[0].wins).toBe(20);
    expect(out[0].losses).toBe(0);
    expect(out[0].matchesUsed).toBe(20);
  });

  it('reuses match-history auth across teammates', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ games: [] }),
    }));
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/entitlements/v1/token') return { accessToken: 'tok' };
        if (route === '/lol-chat/v1/me') return { platformId: 'BR1' };
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [
        { cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A },
        { cellId: 2, gameName: 'B', tagLine: 'BR', puuid: PUUID_B },
      ],
    };

    await buildTeamRevealSnapshot({ session, lcu, fetchImpl, now: NOW });

    expect(lcu.get.mock.calls.filter(([route]) => route === '/entitlements/v1/token')).toHaveLength(1);
    expect(lcu.get.mock.calls.filter(([route]) => route === '/lol-chat/v1/me')).toHaveLength(1);
  });

  it('stops snapshot work when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const lcu = { get: vi.fn(async () => ({})) };
    const session = {
      gameData: { queue: { id: QUEUE_ID } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({
      session,
      lcu,
      now: NOW,
      signal: controller.signal,
    });

    expect(out).toEqual([]);
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('reports rank rows before match history finishes', async () => {
    const progress = [];
    const fetchImpl = vi.fn(async () => {
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0][0].soloRank.tier).toBe('DIAMOND');
      expect(progress[0][0].riotId).toBe('A#BR');
      return { ok: true, json: async () => ({ games: [] }) };
    });
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/entitlements/v1/token') return { accessToken: 'tok' };
        if (route === '/lol-chat/v1/me') return { platformId: 'BR1' };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'DIAMOND',
                division: 'IV',
                leaguePoints: 12,
                wins: 107,
                losses: 73,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: 420 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    await buildTeamRevealSnapshot({
      session,
      lcu,
      fetchImpl,
      now: NOW,
      onProgress: (rows) => progress.push(rows),
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(progress[0][0].seasonMostPlayedCount || 0).toBe(0);
  });

  it('caps native match-history fallback at 100 games', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: [] } };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'DIAMOND',
                division: 'IV',
                wins: 107,
                losses: 73,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: 420 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(lcu.get).toHaveBeenCalledWith(matchHistoryRoute(PUUID_A, 100));
    expect(lcu.get).not.toHaveBeenCalledWith(matchHistoryRoute(PUUID_A, 180));
  });

  it('loads season ranked W/L for ranked queues', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: [] } };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'PLATINUM',
                division: 'III',
                leaguePoints: 42,
                wins: 120,
                losses: 98,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: 420 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(lcu.get).toHaveBeenCalledWith(rankedStatsRoute(PUUID_A));
    expect(out[0].seasonWins).toBe(120);
    expect(out[0].seasonLosses).toBe(98);
    expect(out[0].seasonWinRate).toBe(55);
    expect(out[0].seasonTier).toBe('PLATINUM');
    expect(out[0].hasSeason).toBe(true);
    expect(out[0].rankedQueueType).toBe('RANKED_SOLO_5x5');
    expect(out[0].soloRank.tier).toBe('PLATINUM');
    expect(out[0].soloRank.wins).toBe(120);
    expect(out[0].flexRank.hasRank).toBe(false);
  });

  it('loads solo and flex ranks for every player', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: [] } };
        if (route === rankedStatsRoute(PUUID_A)) {
          return {
            queueMap: {
              RANKED_SOLO_5x5: {
                tier: 'GOLD',
                division: 'II',
                leaguePoints: 55,
                wins: 40,
                losses: 38,
              },
              RANKED_FLEX_SR: {
                tier: 'SILVER',
                division: 'I',
                leaguePoints: 12,
                wins: 10,
                losses: 8,
              },
            },
          };
        }
        return {};
      }),
    };
    const session = {
      gameData: { queue: { id: 450 } },
      myTeam: [{ cellId: 1, gameName: 'A', tagLine: 'BR', puuid: PUUID_A }],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(lcu.get).toHaveBeenCalledWith(rankedStatsRoute(PUUID_A));
    expect(out[0].soloRank.tier).toBe('GOLD');
    expect(out[0].soloRank.winRate).toBe(51);
    expect(out[0].flexRank.tier).toBe('SILVER');
    expect(out[0].flexRank.wins).toBe(10);
  });

  it('does not fetch a separate local match history for shared games', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route.includes('/matches')) return { games: { games: [] } };
        if (route.includes('/ranked-stats/')) return { queueMap: {} };
        return {};
      }),
    };
    const session = {
      localPlayerCellId: 0,
      gameData: { queue: { id: 420 } },
      myTeam: [
        { cellId: 0, gameName: 'Me', tagLine: 'BR', puuid: PUUID_A },
        { cellId: 1, gameName: 'Mate', tagLine: 'BR', puuid: PUUID_B },
      ],
    };

    const out = await buildTeamRevealSnapshot({ session, lcu, now: NOW });

    expect(out[0].isLocalPlayer).toBe(true);
    expect(out[1].isLocalPlayer).toBe(false);
    expect(lcu.get).not.toHaveBeenCalledWith(matchHistoryRoute(PUUID_A, 50));
    expect(out[0].sharedGames).toBeUndefined();
    expect(out[1].sharedGames).toBeUndefined();
  });
});
