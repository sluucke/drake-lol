import { describe, it, expect, vi } from 'vitest';
import {
  normalizeOpggLane,
  buildOpggMatchupUrl,
  normalizeOpggMatchup,
  fetchOpggMatchup,
} from '../src/features/opggMatchup.js';

describe('normalizeOpggLane', () => {
  it('normalizes standard lane names correctly', () => {
    expect(normalizeOpggLane('TOP')).toBe('top');
    expect(normalizeOpggLane('top')).toBe('top');
    expect(normalizeOpggLane('JUNGLE')).toBe('jungle');
    expect(normalizeOpggLane('jg')).toBe('jungle');
    expect(normalizeOpggLane('MID')).toBe('mid');
    expect(normalizeOpggLane('MIDDLE')).toBe('mid');
    expect(normalizeOpggLane('mid')).toBe('mid');
    expect(normalizeOpggLane('ADC')).toBe('adc');
    expect(normalizeOpggLane('BOTTOM')).toBe('adc');
    expect(normalizeOpggLane('bot')).toBe('adc');
    expect(normalizeOpggLane('SUPPORT')).toBe('support');
    expect(normalizeOpggLane('UTILITY')).toBe('support');
    expect(normalizeOpggLane('supp')).toBe('support');
    expect(normalizeOpggLane('sup')).toBe('support');
  });

  it('handles empty or unrecognized lanes safely', () => {
    expect(normalizeOpggLane('')).toBe('');
    expect(normalizeOpggLane(null)).toBe('');
    expect(normalizeOpggLane(undefined)).toBe('');
    expect(normalizeOpggLane('custom_lane')).toBe('custom_lane');
  });
});

describe('buildOpggMatchupUrl', () => {
  it('builds matchup counter URL with enemy champion and lane', () => {
    const url = buildOpggMatchupUrl({
      championId: 103,
      enemyChampionId: 84,
      lane: 'MID',
      region: 'global',
    });
    expect(url).toBe('https://lol-web-api.op.gg/api/v1.0/internal/bypass/champions/global/103/counters/84?lane=mid');
  });

  it('builds counter URL when enemy champion is not provided', () => {
    const url = buildOpggMatchupUrl({
      championId: 103,
      lane: 'MIDDLE',
    });
    expect(url).toBe('https://lol-web-api.op.gg/api/v1.0/internal/bypass/champions/global/103/counters?lane=mid');
  });

  it('uses custom region if provided', () => {
    const url = buildOpggMatchupUrl({
      championId: 1,
      enemyChampionId: 2,
      lane: 'TOP',
      region: 'kr',
    });
    expect(url).toBe('https://lol-web-api.op.gg/api/v1.0/internal/bypass/champions/kr/1/counters/2?lane=top');
  });
});

describe('normalizeOpggMatchup', () => {
  it('normalizes full valid matchup data', () => {
    const sampleData = {
      data: {
        win_rate: 0.5142,
        total_matches: 1250,
        skills: ['Q', 'E', 'W'],
        core_items: [6632, 3078, 3053],
        starter_items: [1055, 2003],
        runes: {
          primaryStyleId: 8000,
          subStyleId: 8100,
          selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5003],
        },
      },
    };

    const result = normalizeOpggMatchup(sampleData);

    expect(result).toEqual({
      winRate: 51.42,
      totalMatches: 1250,
      skills: ['Q', 'E', 'W'],
      coreItems: [6632, 3078, 3053],
      startingItems: [1055, 2003],
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5003],
        winRate: null,
      },
      runePages: [
        {
          primaryStyleId: 8000,
          subStyleId: 8100,
          selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5003],
          winRate: null,
        },
      ],
      hasData: true,
    });
  });

  it('normalizes nested OP.GG counter structures with rune_pages and item builds', () => {
    const raw = {
      data: {
        summary: {
          win_rate: '52.35%',
          total_matches: '850',
        },
        skill_masteries: [
          { order: [1, 3, 2] },
        ],
        core_item_builds: [
          { ids: [3157, 3089, 3135] },
        ],
        starter_item_builds: [
          { ids: [1056, 2003, 2003] },
        ],
        rune_pages: [
          {
            primary_page_id: 8100,
            secondary_page_id: 8300,
            primary_rune_ids: [8112, 8143, 8138, 8105],
            secondary_rune_ids: [8304, 8345],
            stat_mod_ids: [5008, 5008, 5002],
          },
        ],
      },
    };

    const result = normalizeOpggMatchup(raw);

    expect(result.winRate).toBe(52.35);
    expect(result.totalMatches).toBe(850);
    expect(result.skills).toEqual(['Q', 'E', 'W']);
    expect(result.coreItems).toEqual([3157, 3089, 3135]);
    expect(result.startingItems).toEqual([1056, 2003, 2003]);
    expect(result.runes).toEqual({
      primaryStyleId: 8100,
      subStyleId: 8300,
      selectedPerkIds: [8112, 8143, 8138, 8105, 8304, 8345, 5008, 5008, 5002],
      winRate: null,
    });
    expect(result.hasData).toBe(true);
  });

  it('calculates win rate from wins and plays when explicit win_rate is absent', () => {
    const raw = {
      data: {
        win: 60,
        play: 120,
      },
    };

    const result = normalizeOpggMatchup(raw);
    expect(result.winRate).toBe(50);
    expect(result.totalMatches).toBe(120);
    expect(result.hasData).toBe(true);
  });

  it('handles skill string syntax like "Q > E > W"', () => {
    const raw = {
      skills: 'Q > E > W',
    };

    const result = normalizeOpggMatchup(raw);
    expect(result.skills).toEqual(['Q', 'E', 'W']);
    expect(result.hasData).toBe(true);
  });

  it('selects matching enemy champion when data is an array', () => {
    const raw = {
      data: [
        { opponent_champion_id: 266, win_rate: 0.48, total_matches: 100 },
        { opponent_champion_id: 103, win_rate: 0.55, total_matches: 250 },
      ],
    };

    const result = normalizeOpggMatchup(raw, { enemyChampionId: 103 });
    expect(result.winRate).toBe(55);
    expect(result.totalMatches).toBe(250);
  });

  it('handles partial and empty data cleanly', () => {
    const emptyResult = {
      winRate: null,
      totalMatches: null,
      skills: [],
      coreItems: [],
      startingItems: [],
      runes: null,
      runePages: [],
      hasData: false,
    };

    expect(normalizeOpggMatchup(null)).toEqual(emptyResult);
    expect(normalizeOpggMatchup(undefined)).toEqual(emptyResult);
    expect(normalizeOpggMatchup({})).toEqual(emptyResult);
    expect(normalizeOpggMatchup({ data: {} })).toEqual(emptyResult);
    expect(normalizeOpggMatchup({ data: [] })).toEqual(emptyResult);
    expect(normalizeOpggMatchup('invalid_string')).toEqual(emptyResult);
  });

  it('filters out invalid item IDs and runes', () => {
    const raw = {
      core_items: ['3078', 0, -5, 'invalid', null, 3053],
      runes: {
        primaryStyleId: '0',
        subStyleId: '0',
        selectedPerkIds: [null, -1, 'abc'],
      },
    };

    const result = normalizeOpggMatchup(raw);
    expect(result.coreItems).toEqual([3078, 3053]);
    expect(result.runes).toBeNull();
  });
});

describe('fetchOpggMatchup', () => {
  it('returns normalized data on successful fetch', async () => {
    const mockMcpText =
      'LolGetChampionAnalysis("AHRI","MID",Data(Summary(103,false,false,AverageStats(5000,0.52,0.1,0.03,2.5,1,1,TierData(1,1,1,1)),[],[]),"AP",[StrongCounter(84,"Akali",340,184,0.542,0.458,0.542)],[],Synergies([],[],[],[]),CoreItems([3078,3053,6632],["Triforce"],100,50,0.5),[],CoreItems([3020],["Sorcs"],100,50,0.5),CoreItems([1055],["Dorans"],100,50,0.5),[],[],[],[],CoreItems([4,14],[4,14],100,50,0.5),Runes(8112,8000,"Precision",[8010,9111,9104,8014],[],8400,"Resolve",[8446,8451],[],[5005,5008,5001],[],100,50,0.5),Skills(["Q","W","E"],100,50,0.5),[],SkillMasteries(["E","W","Q"],100,50,0.5,[]),Trends(1,1,Win("1",0.5,1,""),Win("1",0.5,1,""),Win("1",0.5,1,""))))';

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          content: [{ type: 'text', text: mockMcpText }],
        },
      }),
    });

    const res = await fetchOpggMatchup({
      championId: 103,
      championName: 'Ahri',
      lane: 'MID',
      enemyChampionId: 84,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://mcp-api.op.gg/mcp',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(res.winRate).toBe(54.2);
    expect(res.totalMatches).toBe(340);
    expect(res.isCounterMatchup).toBe(true);
    expect(res.skills).toEqual(['E', 'W', 'Q']);
    expect(res.coreItems).toEqual([3078, 3053, 6632]);
    expect(res.runes.primaryStyleId).toBe(8000);
    expect(res.hasData).toBe(true);
  });

  it('loads default champion runes, skill order, and core items when no enemy is selected', async () => {
    const mockMcpText =
      'LolGetChampionAnalysis("MASTER_YI","JUNGLE",Data(Summary(11,false,false,AverageStats(15000,0.518,0.1,0.03,2.5,1,1,TierData(1,1,1,1)),[],[]),"AD",[],[],Synergies([],[],[],[]),CoreItems([1055],["Dorans"],100,50,0.5),CoreItems([3153,3124,3091],["BotRK"],100,50,0.5),Runes(8000,8000,"Precision",[8010,9111,9104,8014],[],8100,"Domination",[8135,8139],[],[5005,5008,5001],[],100,50,0.5),SkillMasteries(["Q","E","W"],100,50,0.5,[])))';

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          content: [{ type: 'text', text: mockMcpText }],
        },
      }),
    });

    const res = await fetchOpggMatchup({
      championId: 11,
      championName: 'Master Yi',
      lane: 'JUNGLE',
      enemyChampionId: 0,
      fetchFn,
    });

    expect(res.winRate).toBe(51.8);
    expect(res.totalMatches).toBe(15000);
    expect(res.isCounterMatchup).toBe(false);
    expect(res.skills).toEqual(['Q', 'E', 'W']);
    expect(res.coreItems).toEqual([3153, 3124, 3091]);
    expect(res.runes.primaryStyleId).toBe(8000);
    expect(res.runes.subStyleId).toBe(8100);
    expect(res.runes.selectedPerkIds).toEqual([
      8010, 9111, 9104, 8014, 8135, 8139, 5005, 5008, 5001,
    ]);
    expect(res.hasData).toBe(true);
  });

  it('extracts multiple rune pages from MCP response with win rates and Grisly Mementos (8140)', async () => {
    const mockMcpText =
      'LolGetChampionAnalysis("AHRI","MID",Data(AverageStats(10000,0.525),Runes(8010,8000,"Precision",[8010,9111,9104,8014],[8000],8400,"Resolve",[8446,8451],[8400],[5005,5008,5001],[5000],8000,4320,0.54),Runes(8112,8100,"Domination",[8112,8139,8140,8106],[8100],8000,"Precision",[9111,8014],[8000],[5008,5008,5001],[5000],2000,1020,0.51),CoreItems([3078,3053,6632]),SkillMasteries(["Q","E","W"])))';

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          content: [{ type: 'text', text: mockMcpText }],
        },
      }),
    });

    const res = await fetchOpggMatchup({
      championId: 103,
      championName: 'Ahri',
      lane: 'MID',
      enemyChampionId: 0,
      fetchFn,
    });

    expect(res.runePages).toHaveLength(2);
    expect(res.runePages[0].primaryStyleId).toBe(8000);
    expect(res.runePages[0].subStyleId).toBe(8400);
    expect(res.runePages[0].winRate).toBe(54);

    expect(res.runePages[1].primaryStyleId).toBe(8100);
    expect(res.runePages[1].subStyleId).toBe(8000);
    expect(res.runePages[1].selectedPerkIds).toContain(8140);
    expect(res.runePages[1].winRate).toBe(51);
  });

  it('tries fallback positions when initial position has no data', async () => {
    const emptyMcp = {
      ok: true,
      status: 200,
      json: async () => ({
        result: { content: [{ type: 'text', text: '' }] },
      }),
    };
    const validMcp = {
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          content: [
            {
              type: 'text',
              text: 'LolGetChampionAnalysis("MASTER_YI","JUNGLE",Data(AverageStats(12000,0.52),Runes(1,8000,"Precision",[8010],[],8100,"Domination",[8135],[],[5005]),CoreItems([3153,3124,3091]),SkillMasteries(["Q","E","W"])))',
            },
          ],
        },
      }),
    };

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(emptyMcp) // fails on MID
      .mockResolvedValueOnce(validMcp); // succeeds on JUNGLE fallback

    const res = await fetchOpggMatchup({
      championId: 11,
      championName: 'Master Yi',
      lane: 'MID',
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(res.hasData).toBe(true);
    expect(res.skills).toEqual(['Q', 'E', 'W']);
  });

  it('handles non-200 HTTP responses gracefully', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await fetchOpggMatchup({
      championId: 99999,
      lane: 'MID',
      fetchFn,
    });

    expect(res).toEqual({
      winRate: null,
      totalMatches: null,
      skills: [],
      coreItems: [],
      startingItems: [],
      runes: null,
      runePages: [],
      hasData: false,
    });
  });

  it('handles HTTP 500 server error gracefully', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const res = await fetchOpggMatchup({
      championId: 103,
      lane: 'MID',
      fetchFn,
    });

    expect(res.hasData).toBe(false);
  });

  it('handles network exceptions gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error / connection refused'));

    const res = await fetchOpggMatchup({
      championId: 103,
      lane: 'MID',
      fetchFn,
    });

    expect(res).toEqual({
      winRate: null,
      totalMatches: null,
      skills: [],
      coreItems: [],
      startingItems: [],
      runes: null,
      runePages: [],
      hasData: false,
    });
  });

  it('handles JSON parsing errors gracefully', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const res = await fetchOpggMatchup({
      championId: 103,
      lane: 'MID',
      fetchFn,
    });

    expect(res.hasData).toBe(false);
  });

  it('handles missing or invalid fetchFn gracefully', async () => {
    const res = await fetchOpggMatchup({
      championId: 103,
      lane: 'MID',
      fetchFn: null,
    });

    expect(res.hasData).toBe(false);
  });
});
