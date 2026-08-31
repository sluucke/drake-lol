const CHAMPION_ALIAS_MAP = {
  wukong: 'monkeyking',
  monkeyking: 'monkeyking',
  'nunu & willump': 'nunu',
  'nunu and willump': 'nunu',
  nunuwillump: 'nunu',
  nunowillump: 'nunu',
  nunu: 'nunu',
  'renata glasc': 'renata',
  renataglasc: 'renata',
  renata: 'renata',
};

const MCP_CHAMPION_NAME_MAP = {
  "Cho'Gath": 'CHOGATH',
  "Kai'Sa": 'KAISA',
  "Kha'Zix": 'KHAZIX',
  "Kog'Maw": 'KOG_MAW',
  "Rek'Sai": 'REK_SAI',
  "Vel'Koz": 'VEL_KOZ',
  "Bel'Veth": 'BELVETH',
  "K'Sante": 'KSANTE',
  Wukong: 'MONKEY_KING',
  MonkeyKing: 'MONKEY_KING',
  'Nunu & Willump': 'NUNU',
  'Nunu and Willump': 'NUNU',
  Nunu: 'NUNU',
  'Renata Glasc': 'RENATA',
  Renata: 'RENATA',
  'Dr. Mundo': 'DR_MUNDO',
  DrMundo: 'DR_MUNDO',
  LeBlanc: 'LEBLANC',
};

export function formatMcpChampionName(name) {
  if (!name && name !== 0) return '';
  const raw = String(name).trim();
  if (MCP_CHAMPION_NAME_MAP[raw]) {
    return MCP_CHAMPION_NAME_MAP[raw];
  }
  return raw
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

export function normalizeChampionSlug(championName) {
  if (!championName && championName !== 0) return '';
  const raw = String(championName).trim().toLowerCase();
  if (!raw) return '';

  if (CHAMPION_ALIAS_MAP[raw]) {
    return CHAMPION_ALIAS_MAP[raw];
  }

  const stripped = raw.replace(/[^a-z0-9]/g, '');
  if (CHAMPION_ALIAS_MAP[stripped]) {
    return CHAMPION_ALIAS_MAP[stripped];
  }

  return stripped;
}

export function normalizeLeagueOfGraphsLane(lane) {
  const normalized = String(lane || '').trim().toUpperCase();
  switch (normalized) {
    case 'TOP':
      return 'top';
    case 'JUNGLE':
    case 'JG':
      return 'jungle';
    case 'MID':
    case 'MIDDLE':
      return 'middle';
    case 'ADC':
    case 'BOTTOM':
    case 'BOT':
      return 'adc';
    case 'SUPPORT':
    case 'UTILITY':
    case 'SUPP':
    case 'SUP':
      return 'support';
    default:
      return normalized.toLowerCase();
  }
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRegionFromText(text) {
  if (!text) return '';
  const match = text.match(/\b(EUW|KR|NA|EUNE|BR|LAN|LAS|OCE|TR|RU|JP|VN|TW|SG|TH|PH|MEA)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function extractTierFromText(text) {
  if (!text) return null;
  const match = text.match(/\b(Challenger|GrandMaster|Grandmaster|Master|Diamond|Emerald|Platinum|Gold|Silver|Bronze|Iron)\b/i);
  if (!match) return null;
  const tier = match[1];
  if (tier.toLowerCase() === 'grandmaster') return 'GrandMaster';
  return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
}

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
    if (players.length >= 5) break;
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

export function parseTopPlayers(htmlText) {
  if (typeof htmlText !== 'string' || !htmlText.trim()) {
    return [];
  }

  if (htmlText.includes('Leaderboard(') && htmlText.includes('Summoner(')) {
    return parseMcpLeaderboard(htmlText);
  }

  const rowMatches = htmlText.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!rowMatches) {
    return [];
  }

  const players = [];

  for (const rowHtml of rowMatches) {
    if (players.length >= 5) break;

    if (/<th\b[^>]*>/i.test(rowHtml) && !/<td\b[^>]*>/i.test(rowHtml)) {
      continue;
    }

    const rankAttrMatch = rowHtml.match(/data-ranking=["']?(\d+)["']?/i);
    const rankCellMatch = rowHtml.match(/<td[^>]*class=["'][^"']*rank[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    let ranking = null;
    if (rankAttrMatch) {
      ranking = parseInt(rankAttrMatch[1], 10);
    } else if (rankCellMatch) {
      const num = parseInt(stripHtml(rankCellMatch[1]), 10);
      if (!Number.isNaN(num) && num > 0) {
        ranking = num;
      }
    }

    let name = '';
    let region = '';

    const nameCellMatch =
      rowHtml.match(/<a[^>]*href=["'][^"']*\/summoner\/([^"'/]+)\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
      rowHtml.match(/<a[^>]*href=["'][^"']*\/summoner\/([^"'/]+)\/([^"']+)["']/i);

    if (nameCellMatch) {
      region = (nameCellMatch[1] || '').toUpperCase();
      name = decodeURIComponent(nameCellMatch[2] || '')
        .replace(/\+/g, ' ')
        .replace(/-/g, '#');
      if (!name && nameCellMatch[3]) {
        name = stripHtml(nameCellMatch[3]);
      }
    } else {
      const summonerNameSpan = rowHtml.match(/<span[^>]*class=["'][^"']*name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      if (summonerNameSpan) {
        name = stripHtml(summonerNameSpan[1]);
      }
    }

    if (!name) {
      const tdList = rowHtml.match(/<td\b[^>]*>([\s\S]*?)<\/td>/gi) || [];
      for (const td of tdList) {
        const text = stripHtml(td);
        if (text && !/^\d+$/.test(text) && !/^\d+(\.\d+)?%$/.test(text) && !extractTierFromText(text)) {
          name = text;
          break;
        }
      }
    }

    if (!region) {
      region = extractRegionFromText(rowHtml) || 'GLOBAL';
    }

    const tier = extractTierFromText(rowHtml);

    let winRate = null;
    const wrMatch = rowHtml.match(/(\d+(?:\.\d+)?)\s*%/);
    if (wrMatch) {
      winRate = parseFloat(wrMatch[1]);
    }

    let totalGames = null;
    const gamesCellMatch = rowHtml.match(/<td[^>]*class=["'][^"']*games[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    if (gamesCellMatch) {
      const num = parseInt(stripHtml(gamesCellMatch[1]).replace(/[^\d]/g, ''), 10);
      if (!Number.isNaN(num) && num > 0) {
        totalGames = num;
      }
    }
    if (totalGames === null) {
      const gamesMatch = rowHtml.match(/(\d+)\s*(?:played|games|wins|matches)/i);
      if (gamesMatch) {
        totalGames = parseInt(gamesMatch[1], 10);
      }
    }

    if (name) {
      players.push({
        ranking: ranking || players.length + 1,
        name,
        region,
        tier,
        winRate,
        played: totalGames,
      });
    }
  }

  return players;
}

export function parseProBuilds(htmlText) {
  const emptyBuild = {
    items: [],
    skills: [],
    winRate: null,
  };

  if (typeof htmlText !== 'string' || !htmlText.trim()) {
    return emptyBuild;
  }

  const items = [];
  const itemMatches =
    htmlText.match(/data-item-id=["']?(\d+)["']?/gi) ||
    htmlText.match(/\/(\d{4,6})\.png/gi) ||
    htmlText.match(/items?\/[^\s"']*?(\d{4,6})\.png/gi) ||
    [];
  for (const m of itemMatches) {
    const num = parseInt(m.replace(/[^\d]/g, ''), 10);
    if (Number.isInteger(num) && num > 0 && !items.includes(num)) {
      items.push(num);
      if (items.length >= 6) break;
    }
  }

  const skills = [];
  const skillOrderSection =
    htmlText.match(/class=["'][^"']*skills?-?order[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    htmlText.match(/class=["'][^"']*skill-priority[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const searchSource = skillOrderSection ? skillOrderSection[1] : htmlText;
  const skillMatches = searchSource.match(/\b([QWER])\b/g);
  if (skillMatches) {
    for (const letter of skillMatches) {
      if (!skills.includes(letter)) {
        skills.push(letter);
      }
      if (skills.length >= 3) break;
    }
  }

  let winRate = null;
  const wrMatch =
    htmlText.match(/class=["'][^"']*(?:coreItems|proBuilds|build)[^"']*["'][\s\S]*?class=["'][^"']*win[rR]ate[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i) ||
    htmlText.match(/class=["'][^"']*win[rR]ate[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i);
  if (wrMatch) {
    const num = parseFloat(stripHtml(wrMatch[1]).replace('%', '').trim());
    if (!Number.isNaN(num)) {
      winRate = num;
    }
  }

  return {
    items,
    skills,
    winRate,
  };
}

export function buildLeagueOfGraphsUrl(options) {
  const championName = options?.championName;
  const lane = options?.lane;
  const slug = normalizeChampionSlug(championName);
  if (!slug) return '';
  const lanePath = normalizeLeagueOfGraphsLane(lane);
  if (lanePath) {
    return `https://www.leagueofgraphs.com/champions/builds/${slug}/${lanePath}`;
  }
  return `https://www.leagueofgraphs.com/champions/builds/${slug}`;
}

const TAG = '[Drake]';
const OP_GG_MCP_URL = 'https://mcp-api.op.gg/mcp';

export async function fetchLeagueOfGraphsData(options) {
  const championName = options?.championName;
  const lane = options?.lane;
  const fetchFn = options?.fetchFn !== undefined ? options.fetchFn : globalThis.fetch;
  const timeout = options?.timeout ?? 6000;
  const emptyResult = {
    topPlayers: [],
    proBuild: {
      items: [],
      skills: [],
      winRate: null,
    },
    hasData: false,
  };

  if (typeof fetchFn !== 'function' || !championName) {
    return emptyResult;
  }

  const url = buildLeagueOfGraphsUrl({ championName, lane });
  if (!url) {
    return emptyResult;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  console.log(TAG, `fetching League of Graphs: ${url}`);

  try {
    const res = await fetchFn(url, {
      signal: controller?.signal,
    });

    if (!res || !res.ok) {
      console.warn(TAG, `League of Graphs returned status ${res?.status} for:`, url);

      // Fallback: If League of Graphs blocked with 403 or error, query MCP Leaderboard
      const mcpName = formatMcpChampionName(championName);
      if (mcpName) {
        try {
          const mcpRes = await fetchFn(OP_GG_MCP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: 'lol_list_champion_leaderboard',
                arguments: { champion: mcpName, region: 'kr' },
              },
            }),
            signal: controller?.signal,
          });
          if (mcpRes && mcpRes.ok && typeof mcpRes.json === 'function') {
            const data = await mcpRes.json();
            const text = data?.result?.content?.[0]?.text || '';
            const topPlayers = parseMcpLeaderboard(text);
            if (topPlayers.length > 0) {
              console.log(TAG, `fallback leaderboard loaded: ${championName} - ${topPlayers.length} top players`);
              return {
                topPlayers,
                proBuild: { items: [], skills: [], winRate: null },
                hasData: true,
              };
            }
          }
        } catch {}
      }

      return emptyResult;
    }

    const htmlText = await res.text();
    const topPlayers = parseTopPlayers(htmlText);
    const proBuild = parseProBuilds(htmlText);

    const hasData = Boolean(
      topPlayers.length > 0 ||
      proBuild.items.length > 0 ||
      proBuild.skills.length > 0 ||
      proBuild.winRate !== null
    );

    console.log(
      TAG,
      `League of Graphs loaded: ${championName} (${lane || 'all'}) - ${topPlayers.length} top players`
    );

    return {
      topPlayers,
      proBuild,
      hasData,
    };
  } catch (err) {
    console.warn(TAG, 'League of Graphs fetch error:', err?.message || err);
    return emptyResult;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
