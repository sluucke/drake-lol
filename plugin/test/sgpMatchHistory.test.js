import { describe, it, expect, vi } from 'vitest';
import {
  queueIdToTag,
  resolveSgpServerId,
  sgpMatchHistoryUrl,
  normalizeMatchGames,
  fetchQueueMatchHistory,
} from '../src/features/sgpMatchHistory.js';

describe('sgpMatchHistory', () => {
  it('builds queue tags and BR match-history urls', () => {
    expect(queueIdToTag(420)).toBe('q_420');
    expect(resolveSgpServerId({ platformId: 'BR1' }, {})).toBe('BR1');
    expect(sgpMatchHistoryUrl('BR1', 'abc', { startIndex: 0, count: 180, tag: 'q_420' })).toBe(
      'https://usw2-red.pp.sgp.pvp.net/match-history-query/v1/products/lol/player/abc/SUMMARY?startIndex=0&count=180&tag=q_420',
    );
  });

  it('normalizes summary games into native match shape', () => {
    const games = normalizeMatchGames({
      games: [
        {
          json: {
            queueId: 420,
            seasonId: 25,
            gameCreation: 1,
            participants: [{ puuid: 'abc', championId: 11, win: true, kills: 8, deaths: 2, assists: 4 }],
          },
        },
      ],
    });

    expect(games[0].queueId).toBe(420);
    expect(games[0].participants[0].championId).toBe(11);
    expect(games[0].participants[0].stats.win).toBe(true);
  });

  it('drops unused match fields while keeping the focused player', () => {
    const games = normalizeMatchGames(
      {
        games: [
          {
            json: {
              queueId: 420,
              seasonId: 25,
              gameCreation: 1,
              mapId: 11,
              gameVersion: '14.1',
              participants: [
                {
                  puuid: 'abc',
                  championId: 11,
                  win: true,
                  kills: 8,
                  deaths: 2,
                  assists: 4,
                  challenges: { kda: 9 },
                  perks: { huge: true },
                },
                {
                  puuid: 'other',
                  championId: 22,
                  win: false,
                  challenges: { kda: 1 },
                },
              ],
            },
          },
        ],
      },
      'abc',
    );

    expect(games[0].mapId).toBeUndefined();
    expect(games[0].gameVersion).toBeUndefined();
    expect(games[0].participants).toHaveLength(1);
    expect(games[0].participants[0].puuid).toBe('abc');
    expect(games[0].participants[0].challenges).toBeUndefined();
    expect(games[0].participants[0].stats.kills).toBe(8);
  });

  it('bypasses HTTP cache so the local player W/L refreshes each queue', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ games: [] }),
    }));

    await fetchQueueMatchHistory({
      lcu: { get: async () => ({}) },
      fetchImpl,
      puuid: 'abc',
      queueId: 420,
      count: 50,
      sgp: { accessToken: 'tok', serverId: 'BR1' },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.cache).toBe('no-store');
  });
});
