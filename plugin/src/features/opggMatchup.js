const SKILL_INDEX_MAP = {
  1: 'Q',
  2: 'W',
  3: 'E',
  4: 'R',
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

export function normalizeOpggLane(lane) {
  const normalized = String(lane || '').trim().toUpperCase();
  switch (normalized) {
    case 'TOP':
      return 'top';
    case 'JUNGLE':
    case 'JG':
      return 'jungle';
    case 'MID':
    case 'MIDDLE':
      return 'mid';
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

export function buildOpggMatchupUrl({ championId, lane, enemyChampionId, region = 'global' } = {}) {
  const reg = String(region || 'global').trim().toLowerCase();
  const champId = Number(championId) || 0;
  const enemyId = Number(enemyChampionId) || 0;
  const normalizedLane = normalizeOpggLane(lane);
  const base = `https://lol-web-api.op.gg/api/v1.0/internal/bypass/champions/${reg}/${champId}`;
  const query = normalizedLane && normalizedLane !== 'none' ? `?lane=${encodeURIComponent(normalizedLane)}` : '';

  if (enemyId > 0) {
    return `${base}/counters/${enemyId}${query}`;
  }
  return `${base}/counters${query}`;
}

function extractItemIds(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const itemIds = [];

  for (const entry of list) {
    if (typeof entry === 'number' || (typeof entry === 'string' && entry.trim() !== '')) {
      const num = Number(entry);
      if (Number.isInteger(num) && num > 0) {
        itemIds.push(num);
      }
    } else if (entry && typeof entry === 'object') {
      if (Array.isArray(entry.ids)) {
        itemIds.push(...extractItemIds(entry.ids));
      } else if (Array.isArray(entry.item_ids)) {
        itemIds.push(...extractItemIds(entry.item_ids));
      } else if (entry.id !== undefined || entry.item_id !== undefined) {
        const num = Number(entry.id ?? entry.item_id);
        if (Number.isInteger(num) && num > 0) {
          itemIds.push(num);
        }
      }
    }
  }

  return itemIds;
}

function normalizeSkillEntry(entry) {
  if (typeof entry === 'number') {
    return SKILL_INDEX_MAP[entry] || String(entry);
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    if (trimmed.includes('>') || trimmed.includes(',') || trimmed.includes('/')) {
      return trimmed
        .split(/[>,/]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    return trimmed.toUpperCase();
  }
  if (entry && typeof entry === 'object') {
    const val = entry.id ?? entry.key ?? entry.name ?? entry.skill;
    return val !== undefined ? normalizeSkillEntry(val) : null;
  }
  return null;
}

function extractSkills(target) {
  const rawSkills =
    target?.skills ??
    target?.skill_masteries ??
    target?.skill_order ??
    target?.skill_builds ??
    target?.skill_levels;

  if (!rawSkills) return [];

  const rawList = Array.isArray(rawSkills) ? rawSkills : [rawSkills];
  const out = [];

  for (const item of rawList) {
    if (item && typeof item === 'object' && (Array.isArray(item.order) || Array.isArray(item.ids) || Array.isArray(item.skills))) {
      const subList = item.order || item.ids || item.skills;
      for (const sub of subList) {
        const normalized = normalizeSkillEntry(sub);
        if (Array.isArray(normalized)) {
          out.push(...normalized);
        } else if (normalized) {
          out.push(normalized);
        }
      }
      if (out.length > 0) break;
    } else {
      const normalized = normalizeSkillEntry(item);
      if (Array.isArray(normalized)) {
        out.push(...normalized);
      } else if (normalized) {
        out.push(normalized);
      }
    }
  }

  return out;
}

function extractRunePages(target) {
  const rawRunes = target?.runes ?? target?.rune_pages ?? target?.rune_builds ?? target?.rune;
  if (!rawRunes) return [];

  const list = Array.isArray(rawRunes) ? rawRunes : [rawRunes];
  const pages = [];

  for (const runeObj of list) {
    if (!runeObj || typeof runeObj !== 'object') continue;

    const primaryStyleId =
      Number(
        runeObj.primaryStyleId ??
          runeObj.primary_style_id ??
          runeObj.primary_page_id ??
          runeObj.page_id ??
          runeObj.primary_page?.id ??
          runeObj.primary_style?.id
      ) || 0;

    const subStyleId =
      Number(
        runeObj.subStyleId ??
          runeObj.sub_style_id ??
          runeObj.secondary_style_id ??
          runeObj.secondary_page_id ??
          runeObj.secondary_page?.id ??
          runeObj.secondary_style?.id
      ) || 0;

    let perkList = [];
    const directPerks = runeObj.selectedPerkIds ?? runeObj.selected_perk_ids ?? runeObj.perk_ids;

    if (Array.isArray(directPerks)) {
      perkList = directPerks;
    } else {
      const primaryRunes = runeObj.primary_rune_ids ?? runeObj.primary_perk_ids ?? runeObj.primary_runes ?? [];
      const secondaryRunes = runeObj.secondary_rune_ids ?? runeObj.secondary_perk_ids ?? runeObj.secondary_runes ?? [];
      const statMods = runeObj.stat_mod_ids ?? runeObj.stat_mods ?? runeObj.stat_shards ?? runeObj.shard_ids ?? [];
      perkList = [...extractItemIds(primaryRunes), ...extractItemIds(secondaryRunes), ...extractItemIds(statMods)];
    }

    const selectedPerkIds = perkList
      .map((id) => (typeof id === 'object' && id ? Number(id.id ?? id.perk_id) : Number(id)))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (primaryStyleId > 0 && subStyleId > 0 && selectedPerkIds.length > 0) {
      const winRate = extractWinRate(runeObj);
      pages.push({
        primaryStyleId,
        subStyleId,
        selectedPerkIds,
        winRate,
      });
    }
  }

  return pages;
}

function extractRunes(target) {
  const pages = extractRunePages(target);
  return pages.length > 0 ? pages[0] : null;
}

function extractWinRate(target) {
  const raw =
    target?.win_rate ??
    target?.winRate ??
    target?.summary?.win_rate ??
    target?.summary?.winRate ??
    target?.play?.win_rate ??
    target?.play?.winRate ??
    target?.meta?.win_rate ??
    target?.meta?.winRate;

  if (raw !== undefined && raw !== null) {
    const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!Number.isNaN(parsed)) {
      const pct = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
      return Math.round(pct * 100) / 100;
    }
  }

  const win = target?.win ?? target?.wins ?? target?.summary?.win ?? target?.summary?.wins;
  const play =
    target?.play ??
    target?.play_count ??
    target?.total_matches ??
    target?.totalMatches ??
    target?.games ??
    target?.summary?.play ??
    target?.summary?.total_matches;

  if (typeof win === 'number' && typeof play === 'number' && play > 0) {
    const pct = (win / play) * 100;
    return Math.round(pct * 100) / 100;
  }

  return null;
}

function extractTotalMatches(target) {
  const raw =
    target?.total_matches ??
    target?.totalMatches ??
    target?.match_count ??
    target?.play_count ??
    target?.play ??
    target?.games ??
    target?.summary?.total_matches ??
    target?.summary?.totalMatches ??
    target?.summary?.play ??
    target?.summary?.match_count ??
    target?.meta?.total_matches ??
    target?.meta?.play;

  if (raw !== undefined && raw !== null) {
    const num = Number.parseInt(raw, 10);
    if (!Number.isNaN(num) && num >= 0) {
      return num;
    }
  }

  return null;
}

const STYLE_NAME_TO_ID = {
  precision: 8000,
  domination: 8100,
  sorcery: 8200,
  inspiration: 8300,
  resolve: 8400,
};

function resolveStyleId(rawNameOrId) {
  if (!rawNameOrId) return 0;
  const num = Number(rawNameOrId);
  if ([8000, 8100, 8200, 8300, 8400].includes(num)) return num;
  const key = String(rawNameOrId).trim().toLowerCase();
  return STYLE_NAME_TO_ID[key] || 0;
}

export function extractMcpRunePages(text) {
  if (!text || typeof text !== 'string') return [];

  const pages = [];
  const runeBlockRegex = /Runes\(([\s\S]*?)\)(?=[,\)\s]|$)/gi;
  let match;

  while ((match = runeBlockRegex.exec(text)) !== null) {
    const content = match[1];

    const arrayMatches = [...content.matchAll(/\[([^\]]*)\]/g)];
    if (arrayMatches.length < 2) continue;

    const numberArrays = arrayMatches
      .map((m) =>
        m[1]
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
      .filter((arr) => arr.length > 0);

    if (numberArrays.length < 2) continue;

    const primaryPerks = numberArrays[0];
    const subPerks = numberArrays[1];
    const statMods = numberArrays[2] || [];

    const stringMatches = [...content.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    let primaryStyleId = 0;
    let primaryStyleName = '';
    let subStyleId = 0;
    let subStyleName = '';

    if (stringMatches.length >= 2) {
      primaryStyleName = stringMatches[0];
      primaryStyleId = resolveStyleId(primaryStyleName);
      subStyleName = stringMatches[1];
      subStyleId = resolveStyleId(subStyleName);
    }

    if (!primaryStyleId || !subStyleId) {
      const styleIdMatches = [...content.matchAll(/\b(8000|8100|8200|8300|8400)\b/g)].map((m) =>
        Number(m[1])
      );
      if (styleIdMatches.length >= 2) {
        if (!primaryStyleId) primaryStyleId = styleIdMatches[0];
        if (!subStyleId) subStyleId = styleIdMatches[1];
      } else if (styleIdMatches.length === 1 && !primaryStyleId) {
        primaryStyleId = styleIdMatches[0];
      }
    }

    let winRate = null;
    let totalPlays = null;

    const statsMatch = content.match(/,\s*(\d{1,8})\s*,\s*(\d{1,8})\s*,\s*([0-9.]+)\s*$/);
    if (statsMatch) {
      totalPlays = Number(statsMatch[1]);
      const rawWr = Number(statsMatch[3]);
      if (rawWr > 0 && rawWr <= 1) {
        winRate = Math.round(rawWr * 1000) / 10;
      } else if (rawWr > 1 && rawWr <= 100) {
        winRate = Math.round(rawWr * 10) / 10;
      }
    } else {
      const decimalMatch = content.match(/(?:,\s*|\b)(0\.\d{2,6}|[1-9]\d?\.\d{1,2})\b/);
      if (decimalMatch) {
        const val = Number(decimalMatch[1]);
        if (val > 0 && val <= 1) {
          winRate = Math.round(val * 1000) / 10;
        } else if (val > 1 && val <= 100) {
          winRate = Math.round(val * 10) / 10;
        }
      }
    }

    if (primaryStyleId > 0 && subStyleId > 0 && primaryPerks.length > 0) {
      pages.push({
        primaryStyleId,
        primaryStyleName,
        subStyleId,
        subStyleName,
        selectedPerkIds: [...primaryPerks, ...subPerks, ...statMods],
        winRate,
        totalPlays,
      });
    }
  }

  return pages;
}

export function parseOpggMcpAnalysis(text, { championId, enemyChampionId } = {}) {
  const emptyResult = {
    winRate: null,
    totalMatches: null,
    isCounterMatchup: false,
    skills: [],
    coreItems: [],
    startingItems: [],
    runes: null,
    runePages: [],
    hasData: false,
  };

  if (!text || typeof text !== 'string') {
    return emptyResult;
  }

  const runePages = extractMcpRunePages(text);
  const runes = runePages[0] || null;

  // Core items: Find all CoreItems matches and pick the one with most items (the 3-item core build)
  let coreItems = [];
  const allCoreMatches = [...text.matchAll(/CoreItems\(\[([\d,\s]+)\]/gi)];
  if (allCoreMatches.length > 0) {
    let best = [];
    for (const cm of allCoreMatches) {
      const items = cm[1]
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
      if (items.length > best.length) {
        best = items;
      }
    }
    coreItems = best;
  }

  // Skills: Parse skill masteries (e.g. Q > E > W)
  let skills = [];
  const skillsMatch =
    text.match(/SkillMasteries\(\[([^\]]+)\]/i) ||
    text.match(/Skills\(\[([^\]]+)\]/i) ||
    text.match(/SkillOrder\(\[([^\]]+)\]/i);

  if (skillsMatch) {
    skills = skillsMatch[1]
      .split(',')
      .map((s) => {
        const clean = s.trim().replace(/^['"]|['"]$/g, '');
        const num = Number(clean);
        if (Number.isInteger(num) && SKILL_INDEX_MAP[num]) {
          return SKILL_INDEX_MAP[num];
        }
        return clean.toUpperCase();
      })
      .filter((s) => ['Q', 'W', 'E', 'R'].includes(s));
  }

  // WinRate & TotalMatches vs enemy counter or overall
  let winRate = null;
  let totalMatches = null;
  let isCounterMatchup = false;

  if (enemyChampionId && Number(enemyChampionId) > 0) {
    const targetEnemyId = Number(enemyChampionId);
    const counterRegex =
      /StrongCounter\((\d+),\s*"([^"]*)",\s*(\d+),\s*(\d+),\s*([0-9.]+),\s*([0-9.]+)/g;
    let cm;
    while ((cm = counterRegex.exec(text)) !== null) {
      if (Number(cm[1]) === targetEnemyId) {
        totalMatches = Number(cm[3]);
        winRate = Math.round(Number(cm[5]) * 1000) / 10;
        isCounterMatchup = true;
        break;
      }
    }
  }

  if (winRate === null) {
    const avgStatsMatch = text.match(/AverageStats\((\d+),\s*([0-9.]+)/i);
    if (avgStatsMatch) {
      totalMatches = Number(avgStatsMatch[1]);
      winRate = Math.round(Number(avgStatsMatch[2]) * 1000) / 10;
    }
  }

  const hasData = Boolean(
    winRate !== null ||
      totalMatches !== null ||
      skills.length > 0 ||
      coreItems.length > 0 ||
      runes !== null
  );

  return {
    winRate,
    totalMatches,
    isCounterMatchup,
    skills,
    coreItems,
    startingItems: [],
    runes,
    runePages,
    hasData,
  };
}

export function normalizeOpggMatchup(rawJson, { championId, enemyChampionId } = {}) {
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

  if (!rawJson || typeof rawJson !== 'object') {
    return emptyResult;
  }

  // If this is a text response or MCP response object
  if (typeof rawJson.text === 'string') {
    return parseOpggMcpAnalysis(rawJson.text, { championId, enemyChampionId });
  }

  if (Array.isArray(rawJson.result?.content) && rawJson.result.content[0]?.text) {
    return parseOpggMcpAnalysis(rawJson.result.content[0].text, { championId, enemyChampionId });
  }

  let target = rawJson.data ?? rawJson;

  if (Array.isArray(target)) {
    if (enemyChampionId) {
      const match = target.find((item) => {
        const id = Number(item?.opponent_champion_id ?? item?.champion_id ?? item?.enemy_champion_id);
        return id === Number(enemyChampionId);
      });
      target = match || target[0] || {};
    } else {
      target = target[0] || {};
    }
  }

  if (!target || typeof target !== 'object') {
    return emptyResult;
  }

  const winRate = extractWinRate(target);
  const totalMatches = extractTotalMatches(target);
  const skills = extractSkills(target);

  const rawCore =
    target.core_items ??
    target.coreItems ??
    target.core_item_builds ??
    target.item_builds ??
    target.items;
  const coreItems = extractItemIds(rawCore);

  const rawStarting =
    target.starter_items ??
    target.starting_items ??
    target.startingItems ??
    target.starter_item_builds ??
    target.start_items;
  const startingItems = extractItemIds(rawStarting);

  const runePages = extractRunePages(target);
  const runes = runePages[0] || null;

  const hasData = Boolean(
    winRate !== null ||
    totalMatches !== null ||
    skills.length > 0 ||
    coreItems.length > 0 ||
    startingItems.length > 0 ||
    runes !== null
  );

  return {
    winRate,
    totalMatches,
    skills,
    coreItems,
    startingItems,
    runes,
    runePages,
    hasData,
  };
}

const TAG = '[Drake]';
const OP_GG_MCP_URL = 'https://mcp-api.op.gg/mcp';

export async function fetchOpggMatchup({
  championId,
  championName,
  lane,
  enemyChampionId,
  region = 'global',
  fetchFn = globalThis.fetch,
  timeout = 6000,
} = {}) {
  if (typeof fetchFn !== 'function') {
    return normalizeOpggMatchup(null, { championId, enemyChampionId });
  }

  const mcpName = formatMcpChampionName(championName || championId);
  const mcpPosition = normalizeOpggLane(lane);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  console.log(TAG, `fetching OP.GG matchup via MCP API: ${mcpName} (${mcpPosition || 'auto'}) vs ${enemyChampionId || 'all'}`);

  const primaryPos =
    mcpPosition && mcpPosition !== 'none' && mcpPosition !== 'unknown' ? mcpPosition : '';
  const positionsToTry = primaryPos
    ? [primaryPos, ...['jungle', 'top', 'mid', 'adc', 'support'].filter((p) => p !== primaryPos)]
    : ['jungle', 'mid', 'top', 'adc', 'support'];

  try {
    for (const pos of positionsToTry) {
      if (controller?.signal?.aborted) break;
      try {
        const res = await fetchFn(OP_GG_MCP_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'lol_get_champion_analysis',
              arguments: {
                game_mode: 'ranked',
                champion: mcpName,
                position: pos,
                lang: 'en_US',
              },
            },
          }),
          signal: controller?.signal,
        });

        if (res && res.ok) {
          const data = await res.json();
          const contentText = data?.result?.content?.[0]?.text || '';
          if (contentText) {
            let parsed = parseOpggMcpAnalysis(contentText, { championId, enemyChampionId });
            
            // If lane matchup guide has additional rune options for this position
            if (parsed.hasData && enemyChampionId && Number(enemyChampionId) > 0) {
              try {
                const guideRes = await fetchFn(OP_GG_MCP_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                      name: 'lol_get_lane_matchup_guide',
                      arguments: {
                        my_champion: mcpName,
                        opponent_champion: formatMcpChampionName(enemyChampionId),
                        position: pos,
                        lang: 'en_US',
                      },
                    },
                  }),
                  signal: controller?.signal,
                });
                if (guideRes && guideRes.ok) {
                  const guideData = await guideRes.json();
                  const guideText = guideData?.result?.content?.[0]?.text || '';
                  if (guideText) {
                    const parsedGuide = JSON.parse(guideText);
                    const guideRunes = extractRunePages(parsedGuide.data);
                    if (guideRunes.length > 0) {
                      parsed.runePages = guideRunes;
                      parsed.runes = guideRunes[0];
                    }
                  }
                }
              } catch {}
            }

            if (parsed.hasData) {
              console.log(
                TAG,
                `OP.GG matchup loaded: ${mcpName} (${pos}) vs ${enemyChampionId || 'all'} (${parsed.winRate != null ? `${parsed.winRate}% WR` : 'no WR'})`
              );
              return parsed;
            }
          }
        }
      } catch (innerErr) {
        if (controller?.signal?.aborted) break;
      }
    }

    return normalizeOpggMatchup(null, { championId, enemyChampionId });
  } catch (err) {
    console.warn(TAG, 'OP.GG fetch error:', err?.message || err);
    return normalizeOpggMatchup(null, { championId, enemyChampionId });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
