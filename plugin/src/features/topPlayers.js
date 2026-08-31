import { formatMcpChampionName } from './opggMatchup.js';

const TAG = '[Drake]';

export const OP_GG_MCP_URL = 'https://mcp-api.op.gg/mcp';

const LEADERBOARD_LIMIT = 5;

function fail(reason, empty) {
  return { ok: false, data: empty, reason };
}

function succeed(data) {
  return { ok: true, data, reason: '' };
}

// Moved verbatim from the former leagueOfGraphs.js. The regex encodes the
// MCP text layout; do not "simplify" it without a captured payload to test against.
export function parseMcpLeaderboard(text, defaultRegion = 'KR') {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const regionUpper = String(defaultRegion || 'KR').toUpperCase();

  const playerRegex =
    /Leaderboard\((\d+),Summoner\(\d+,"[^"]*","[^"]*","[^"]*","([^"]*)","([^"]*)",[^,]*,"[^"]*","[^"]*",\d+,"[^"]*",\[LeagueStat\("[^"]*",TierInfo\("([^"]*)",(\d+),(\d+),[^)]*\),(\d+),(\d+),/g;
  let pm;
  const players = [];

  while ((pm = playerRegex.exec(text)) !== null) {
    if (players.length >= LEADERBOARD_LIMIT) break;
    const rank = Number(pm[1]);
    const name = pm[2];
    const tag = pm[3];
    const tierName = pm[4];
    const div = Number(pm[5]);
    const lp = Number(pm[6]);
    const wins = Number(pm[7]) || 0;
    const losses = Number(pm[8]) || 0;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : null;
    const tierFormatted = tierName.charAt(0).toUpperCase() + tierName.slice(1).toLowerCase();
    const riotId = tag ? `${name}#${tag}` : name;

    players.push({
      ranking: rank,
      name: riotId,
      region: regionUpper,
      tier: `${tierFormatted} ${div} (${lp} LP)`,
      winRate,
      played: total > 0 ? total : null,
    });
  }

  return players;
}

// Extracted from teamRevealDom.handleFetchPlayerBuild. Same regex, now pure.
export function parsePlayerBuild(text, championId) {
  const empty = { runePages: [], items: [] };
  if (typeof text !== 'string' || !text.trim()) return empty;

  const champId = Number(championId) || 0;
  if (!champId) return empty;

  const participantRegex =
    /Participant\(Summoner\([^)]+\),(\d+),"([^"]*)","[^"]*","([^"]*)",\[([^\]]*)\],\[([^\]]*)\],Rune\((\d+),(\d+),(\d+)\),\[([^\]]*)\],Stats\([^)]*?"(WIN|LOSE)"/g;

  const runePages = [];
  let items = [];
  let match;

  while ((match = participantRegex.exec(text)) !== null) {
    if (Number(match[1]) !== champId) continue;

    const itemsStr = match[4];
    const primaryStyle = Number(match[6]);
    const primaryRune = Number(match[7]);
    const secondaryStyle = Number(match[8]);

    if (!items.length && itemsStr) {
      items = itemsStr
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    }

    if (primaryStyle > 0 && secondaryStyle > 0 && primaryRune > 0) {
      const already = runePages.some(
        (p) => p.primaryStyleId === primaryStyle && p.selectedPerkIds[0] === primaryRune
      );
      if (!already) {
        runePages.push({
          primaryStyleId: primaryStyle,
          subStyleId: secondaryStyle,
          selectedPerkIds: [primaryRune],
          winRate: null,
        });
      }
    }
  }

  return { runePages, items };
}

async function callMcp(name, args, { fetchFn, id }) {
  const res = await fetchFn(OP_GG_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  if (!res || !res.ok || typeof res.json !== 'function') {
    throw new Error(`MCP returned ${res?.status ?? 'no response'}`);
  }

  const data = await res.json();
  return data?.result?.content?.[0]?.text || '';
}

export async function fetchChampionLeaderboard(
  { championName, region = 'kr' } = {},
  { fetchFn = globalThis.fetch } = {}
) {
  const mcpName = formatMcpChampionName(championName);
  if (!mcpName) return fail('No champion selected', []);
  if (typeof fetchFn !== 'function') return fail('No network client available', []);

  try {
    const text = await callMcp(
      'lol_list_champion_leaderboard',
      { champion: mcpName, region: String(region || 'kr').toLowerCase(), lang: 'en_US' },
      { fetchFn, id: 3 }
    );
    const players = parseMcpLeaderboard(text, region);
    if (!players.length) return fail('No ranking data available', []);
    return succeed(players);
  } catch (err) {
    console.warn(TAG, 'leaderboard fetch failed:', err?.message || err);
    return fail('Ranking service unavailable', []);
  }
}

export async function fetchPlayerBuild(
  { riotId, region = 'kr', championId } = {},
  { fetchFn = globalThis.fetch } = {}
) {
  const empty = { runePages: [], items: [] };
  const parts = String(riotId || '').split('#');
  const gameName = parts[0] || '';
  const tagLine = parts[1] || '';

  if (!gameName) return fail('Invalid player name', empty);
  if (typeof fetchFn !== 'function') return fail('No network client available', empty);

  try {
    const text = await callMcp(
      'lol_list_summoner_matches',
      { game_name: gameName, tag_line: tagLine, region: String(region || 'kr').toLowerCase() },
      { fetchFn, id: 4 }
    );
    const build = parsePlayerBuild(text, championId);
    if (!build.items.length && !build.runePages.length) {
      return fail('No recent games on this champion', empty);
    }
    return succeed(build);
  } catch (err) {
    console.warn(TAG, 'player build fetch failed:', err?.message || err);
    return fail('Match history unavailable', empty);
  }
}
