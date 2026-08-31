import { describe, it, expect, vi } from 'vitest';
import {
  normalizeChampionSlug,
  normalizeLeagueOfGraphsLane,
  buildLeagueOfGraphsUrl,
  parseTopPlayers,
  parseProBuilds,
  fetchLeagueOfGraphsData,
} from '../src/features/leagueOfGraphs.js';

describe('normalizeChampionSlug', () => {
  it('normalizes standard champion names and names with punctuation', () => {
    expect(normalizeChampionSlug("Cho'Gath")).toBe('chogath');
    expect(normalizeChampionSlug('Dr. Mundo')).toBe('drmundo');
    expect(normalizeChampionSlug('Dr.Mundo')).toBe('drmundo');
    expect(normalizeChampionSlug('Lee Sin')).toBe('leesin');
    expect(normalizeChampionSlug("Kog'Maw")).toBe('kogmaw');
    expect(normalizeChampionSlug("Kai'Sa")).toBe('kaisa');
    expect(normalizeChampionSlug("Vel'Koz")).toBe('velkoz');
    expect(normalizeChampionSlug("Kha'Zix")).toBe('khazix');
    expect(normalizeChampionSlug("Bel'Veth")).toBe('belveth');
    expect(normalizeChampionSlug("Rek'Sai")).toBe('reksai');
    expect(normalizeChampionSlug("K'Sante")).toBe('ksante');
    expect(normalizeChampionSlug('Jarvan IV')).toBe('jarvaniv');
    expect(normalizeChampionSlug('Miss Fortune')).toBe('missfortune');
    expect(normalizeChampionSlug('Twisted Fate')).toBe('twistedfate');
    expect(normalizeChampionSlug('Aurelion Sol')).toBe('aurelionsol');
    expect(normalizeChampionSlug('Master Yi')).toBe('masteryi');
  });

  it('handles aliases and special champion name mappings', () => {
    expect(normalizeChampionSlug('Wukong')).toBe('monkeyking');
    expect(normalizeChampionSlug('MonkeyKing')).toBe('monkeyking');
    expect(normalizeChampionSlug('monkeyking')).toBe('monkeyking');
    expect(normalizeChampionSlug('Nunu & Willump')).toBe('nunu');
    expect(normalizeChampionSlug('Nunu and Willump')).toBe('nunu');
    expect(normalizeChampionSlug('Nunu')).toBe('nunu');
    expect(normalizeChampionSlug('Renata Glasc')).toBe('renata');
    expect(normalizeChampionSlug('Renata')).toBe('renata');
  });

  it('handles empty and invalid inputs safely', () => {
    expect(normalizeChampionSlug('')).toBe('');
    expect(normalizeChampionSlug(null)).toBe('');
    expect(normalizeChampionSlug(undefined)).toBe('');
    expect(normalizeChampionSlug('   ')).toBe('');
  });
});

describe('normalizeLeagueOfGraphsLane', () => {
  it('normalizes standard lane identifiers', () => {
    expect(normalizeLeagueOfGraphsLane('TOP')).toBe('top');
    expect(normalizeLeagueOfGraphsLane('top')).toBe('top');
    expect(normalizeLeagueOfGraphsLane('JUNGLE')).toBe('jungle');
    expect(normalizeLeagueOfGraphsLane('jg')).toBe('jungle');
    expect(normalizeLeagueOfGraphsLane('MID')).toBe('middle');
    expect(normalizeLeagueOfGraphsLane('MIDDLE')).toBe('middle');
    expect(normalizeLeagueOfGraphsLane('mid')).toBe('middle');
    expect(normalizeLeagueOfGraphsLane('ADC')).toBe('adc');
    expect(normalizeLeagueOfGraphsLane('BOTTOM')).toBe('adc');
    expect(normalizeLeagueOfGraphsLane('bot')).toBe('adc');
    expect(normalizeLeagueOfGraphsLane('SUPPORT')).toBe('support');
    expect(normalizeLeagueOfGraphsLane('UTILITY')).toBe('support');
    expect(normalizeLeagueOfGraphsLane('supp')).toBe('support');
    expect(normalizeLeagueOfGraphsLane('sup')).toBe('support');
  });

  it('handles empty or unrecognized lane values', () => {
    expect(normalizeLeagueOfGraphsLane('')).toBe('');
    expect(normalizeLeagueOfGraphsLane(null)).toBe('');
    expect(normalizeLeagueOfGraphsLane(undefined)).toBe('');
    expect(normalizeLeagueOfGraphsLane('custom')).toBe('custom');
  });
});

describe('buildLeagueOfGraphsUrl', () => {
  it('builds valid League of Graphs build URLs with lane', () => {
    expect(buildLeagueOfGraphsUrl({ championName: "Cho'Gath", lane: 'TOP' })).toBe(
      'https://www.leagueofgraphs.com/champions/builds/chogath/top'
    );
    expect(buildLeagueOfGraphsUrl({ championName: 'Wukong', lane: 'JUNGLE' })).toBe(
      'https://www.leagueofgraphs.com/champions/builds/monkeyking/jungle'
    );
    expect(buildLeagueOfGraphsUrl({ championName: 'Ahri', lane: 'MID' })).toBe(
      'https://www.leagueofgraphs.com/champions/builds/ahri/middle'
    );
  });

  it('builds URL without lane when lane is not provided', () => {
    expect(buildLeagueOfGraphsUrl({ championName: 'Lee Sin' })).toBe(
      'https://www.leagueofgraphs.com/champions/builds/leesin'
    );
  });

  it('returns empty string when champion name is missing or invalid', () => {
    expect(buildLeagueOfGraphsUrl({})).toBe('');
    expect(buildLeagueOfGraphsUrl({ championName: '' })).toBe('');
    expect(buildLeagueOfGraphsUrl(null)).toBe('');
  });
});

describe('parseTopPlayers', () => {
  it('parses realistic League of Graphs ranking table HTML', () => {
    const htmlFixture = `
      <table class="data_table bestPlayersTable">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Tier</th>
            <th>Winrate</th>
            <th>Played</th>
          </tr>
        </thead>
        <tbody>
          <tr data-ranking="1">
            <td class="rank">1</td>
            <td class="summoner">
              <a href="/summoner/euw/Naayil-EUW">
                <div class="name">Naayil<span class="tag">#EUW</span></div>
              </a>
              <i class="region">EUW</i>
            </td>
            <td class="tier">
              <span class="tierName">Challenger</span>
            </td>
            <td class="winrate">
              <span class="percentage">72.6%</span>
            </td>
            <td class="games">
              <span>62</span>
            </td>
          </tr>
          <tr data-ranking="2">
            <td class="rank">2</td>
            <td class="summoner">
              <a href="/summoner/kr/Hide+on+bush-KR1">
                <div class="name">Hide on bush<span class="tag">#KR1</span></div>
              </a>
              <i class="region">KR</i>
            </td>
            <td class="tier">
              <img src="/img/grandmaster.png" alt="GrandMaster" title="GrandMaster" />
            </td>
            <td class="winrate">
              <span class="percentage">68.4%</span>
            </td>
            <td class="games">
              <span>145 games</span>
            </td>
          </tr>
          <tr data-ranking="3">
            <td class="rank">3</td>
            <td class="summoner">
              <a href="/summoner/na/Doublelift-NA1">
                <div class="name">Doublelift<span class="tag">#NA1</span></div>
              </a>
            </td>
            <td class="tier">
              <span class="tierName">Master</span>
            </td>
            <td class="winrate">
              <span class="percentage">65.0%</span>
            </td>
            <td class="games">
              <span>98</span>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const players = parseTopPlayers(htmlFixture);
    expect(players).toHaveLength(3);

    expect(players[0]).toEqual({
      name: 'Naayil#EUW',
      region: 'EUW',
      tier: 'Challenger',
      winRate: 72.6,
      played: 62,
      ranking: 1,
    });

    expect(players[1]).toEqual({
      name: 'Hide on bush#KR1',
      region: 'KR',
      tier: 'GrandMaster',
      winRate: 68.4,
      played: 145,
      ranking: 2,
    });

    expect(players[2]).toEqual({
      name: 'Doublelift#NA1',
      region: 'NA',
      tier: 'Master',
      winRate: 65,
      played: 98,
      ranking: 3,
    });
  });

  it('limits returned players to top 5', () => {
    let rows = '';
    for (let i = 1; i <= 8; i++) {
      rows += `
        <tr data-ranking="${i}">
          <td class="rank">${i}</td>
          <td><a href="/summoner/euw/Player${i}-EUW"><span class="name">Player${i}#EUW</span></a></td>
          <td class="tier">Challenger</td>
          <td class="winrate">${70 - i}%</td>
          <td class="games">${50 + i}</td>
        </tr>
      `;
    }
    const html = `<table>${rows}</table>`;
    const players = parseTopPlayers(html);

    expect(players).toHaveLength(5);
    expect(players[0].ranking).toBe(1);
    expect(players[4].ranking).toBe(5);
  });

  it('handles empty and malformed HTML gracefully', () => {
    expect(parseTopPlayers('')).toEqual([]);
    expect(parseTopPlayers(null)).toEqual([]);
    expect(parseTopPlayers(undefined)).toEqual([]);
    expect(parseTopPlayers('<div>No players found</div>')).toEqual([]);
    expect(parseTopPlayers('<table><thead><tr><th>Header</th></tr></thead></table>')).toEqual([]);
  });
});

describe('parseProBuilds', () => {
  it('parses core items, skill order, and win rate from HTML', () => {
    const htmlFixture = `
      <div class="coreItems">
        <div class="item-icons">
          <img src="//lolg-cdn.porofessor.gg/img/d/items/14.24/3078.png" alt="Trinity Force" />
          <img src="//lolg-cdn.porofessor.gg/img/d/items/14.24/3053.png" alt="Sterak's Gage" />
          <img src="//lolg-cdn.porofessor.gg/img/d/items/14.24/6632.png" alt="Divine Sunderer" />
        </div>
        <div class="winrate">54.8%</div>
      </div>
      <div class="skillOrder">
        <div class="skills-order">Q &gt; E &gt; W</div>
      </div>
    `;

    const proBuild = parseProBuilds(htmlFixture);
    expect(proBuild).toEqual({
      items: [3078, 3053, 6632],
      skills: ['Q', 'E', 'W'],
      winRate: 54.8,
    });
  });

  it('parses item data attributes and skill arrows', () => {
    const htmlFixture = `
      <div class="proBuilds">
        <div data-item-id="3157"></div>
        <div data-item-id="3089"></div>
        <div data-item-id="3135"></div>
        <span class="winrate">58.2%</span>
      </div>
      <div class="skill-priority">W > Q > E</div>
    `;

    const proBuild = parseProBuilds(htmlFixture);
    expect(proBuild).toEqual({
      items: [3157, 3089, 3135],
      skills: ['W', 'Q', 'E'],
      winRate: 58.2,
    });
  });

  it('handles empty or malformed HTML cleanly', () => {
    expect(parseProBuilds('')).toEqual({
      items: [],
      skills: [],
      winRate: null,
    });
    expect(parseProBuilds(null)).toEqual({
      items: [],
      skills: [],
      winRate: null,
    });
    expect(parseProBuilds('<div>Nothing here</div>')).toEqual({
      items: [],
      skills: [],
      winRate: null,
    });
  });
});

describe('fetchLeagueOfGraphsData', () => {
  it('fetches and returns parsed data on success', async () => {
    const mockHtml = `
      <table class="bestPlayersTable">
        <tr data-ranking="1">
          <td class="rank">1</td>
          <td>
            <a href="/summoner/euw/Naayil-EUW">
              <span class="name">Naayil#EUW</span>
            </a>
          </td>
          <td class="tier"><span class="tierName">Challenger</span></td>
          <td class="winrate">74.2%</td>
          <td class="games">85</td>
        </tr>
      </table>
      <div class="coreItems">
        <img src="/items/14.24/3078.png" />
        <img src="/items/14.24/3053.png" />
        <span class="winrate">56.5%</span>
      </div>
      <div class="skills-order">Q &gt; W &gt; E</div>
    `;

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    });

    const res = await fetchLeagueOfGraphsData({
      championName: "Cho'Gath",
      lane: 'TOP',
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://www.leagueofgraphs.com/champions/builds/chogath/top',
      expect.any(Object)
    );

    expect(res.hasData).toBe(true);
    expect(res.topPlayers).toHaveLength(1);
    expect(res.topPlayers[0].name).toBe('Naayil#EUW');
    expect(res.topPlayers[0].tier).toBe('Challenger');
    expect(res.topPlayers[0].winRate).toBe(74.2);
    expect(res.topPlayers[0].played).toBe(85);
    expect(res.proBuild.items).toEqual([3078, 3053]);
    expect(res.proBuild.skills).toEqual(['Q', 'W', 'E']);
    expect(res.proBuild.winRate).toBe(56.5);
  });

  it('handles HTTP error responses safely', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await fetchLeagueOfGraphsData({
      championName: 'NonExistentChamp',
      fetchFn,
    });

    expect(res).toEqual({
      topPlayers: [],
      proBuild: {
        items: [],
        skills: [],
        winRate: null,
      },
      hasData: false,
    });
  });

  it('handles network exceptions safely', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const res = await fetchLeagueOfGraphsData({
      championName: 'Ahri',
      lane: 'MID',
      fetchFn,
    });

    expect(res.hasData).toBe(false);
    expect(res.topPlayers).toEqual([]);
    expect(res.proBuild.items).toEqual([]);
  });

  it('handles invalid or missing parameters safely', async () => {
    const resNoChamp = await fetchLeagueOfGraphsData({ championName: '' });
    expect(resNoChamp.hasData).toBe(false);

    const resNoFetch = await fetchLeagueOfGraphsData({
      championName: 'Ahri',
      fetchFn: null,
    });
    expect(resNoFetch.hasData).toBe(false);
  });
});
