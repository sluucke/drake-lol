import { describe, it, expect, vi } from 'vitest';
import {
  parseMcpLeaderboard,
  parsePlayerBuild,
  fetchChampionLeaderboard,
  fetchPlayerBuild,
} from '../src/features/topPlayers.js';

const LEADERBOARD_TEXT =
  'Leaderboard(1,Summoner(1,"a","b","c","Hide on bush","KR1",null,"x","y",1,"z",' +
  '[LeagueStat("RANKED_SOLO_5x5",TierInfo("CHALLENGER",1,1543,null),320,210,';

const MATCHES_TEXT =
  'Participant(Summoner(1,"a"),157,"MID","x","y",[3153,6673,3031,3006],[4,14],' +
  'Rune(8000,8008,8400),[1,2],Stats(1,2,3,"WIN"';

function jsonRpc(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: { content: [{ text }] } }),
  };
}

describe('parseMcpLeaderboard', () => {
  it('extracts ranked players with win rate and games', () => {
    const players = parseMcpLeaderboard(LEADERBOARD_TEXT, 'KR');
    expect(players.length).toBe(1);
    expect(players[0]).toMatchObject({
      ranking: 1,
      name: 'Hide on bush#KR1',
      region: 'KR',
      played: 530,
    });
    expect(players[0].winRate).toBeCloseTo(60.4, 1);
    expect(players[0].tier).toContain('Challenger');
  });

  it('returns an empty list for junk input', () => {
    expect(parseMcpLeaderboard('', 'KR')).toEqual([]);
    expect(parseMcpLeaderboard(null, 'KR')).toEqual([]);
    expect(parseMcpLeaderboard('no leaderboard here', 'KR')).toEqual([]);
  });
});

describe('parsePlayerBuild', () => {
  it('pulls items and rune pages for the requested champion', () => {
    const build = parsePlayerBuild(MATCHES_TEXT, 157);
    expect(build.items).toEqual([3153, 6673, 3031, 3006]);
    expect(build.runePages.length).toBe(1);
    expect(build.runePages[0]).toMatchObject({ primaryStyleId: 8000, subStyleId: 8400 });
    expect(build.runePages[0].selectedPerkIds).toEqual([8008]);
  });

  it('ignores matches on other champions', () => {
    expect(parsePlayerBuild(MATCHES_TEXT, 103)).toEqual({ runePages: [], items: [] });
  });

  it('returns empty structures for junk input', () => {
    expect(parsePlayerBuild('', 157)).toEqual({ runePages: [], items: [] });
    expect(parsePlayerBuild(null, 157)).toEqual({ runePages: [], items: [] });
  });
});

describe('fetchChampionLeaderboard', () => {
  it('returns ok with players on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRpc(LEADERBOARD_TEXT));
    const res = await fetchChampionLeaderboard({ championName: 'Yasuo', region: 'kr' }, { fetchFn });
    expect(res.ok).toBe(true);
    expect(res.data.length).toBe(1);
    expect(res.reason).toBe('');
  });

  it('degrades with a reason when the request fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    const res = await fetchChampionLeaderboard({ championName: 'Yasuo' }, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.data).toEqual([]);
    expect(res.reason).toBeTruthy();
  });

  it('degrades when the response carries no players', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRpc('nothing useful'));
    const res = await fetchChampionLeaderboard({ championName: 'Yasuo' }, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('degrades without a champion name instead of calling out', async () => {
    const fetchFn = vi.fn();
    const res = await fetchChampionLeaderboard({ championName: '' }, { fetchFn });
    expect(res.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('fetchPlayerBuild', () => {
  it('returns the parsed build for the champion', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRpc(MATCHES_TEXT));
    const res = await fetchPlayerBuild(
      { riotId: 'Hide on bush#KR1', region: 'kr', championId: 157 },
      { fetchFn }
    );
    expect(res.ok).toBe(true);
    expect(res.data.items).toEqual([3153, 6673, 3031, 3006]);
  });

  it('degrades when the player has no games on that champion', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRpc(MATCHES_TEXT));
    const res = await fetchPlayerBuild({ riotId: 'x#KR1', region: 'kr', championId: 103 }, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('sends game name and tag line split from the riot id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonRpc(MATCHES_TEXT));
    await fetchPlayerBuild({ riotId: 'Hide on bush#KR1', region: 'kr', championId: 157 }, { fetchFn });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.params.arguments.game_name).toBe('Hide on bush');
    expect(body.params.arguments.tag_line).toBe('KR1');
  });
});
