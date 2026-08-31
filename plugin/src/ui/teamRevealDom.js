import { GAMEFLOW_PHASE_ROUTE } from '../features/dodge.js';
import { readGameflowPhase } from '../features/inGameIdle.js';
import {
  formatWl,
  formatWlPair,
  readAssignedPosition,
  readLobbyKey,
  remapSnapshotToSession,
  refreshPickedChampionOnRows,
} from '../features/teamRevealStats.js';
import { iconUrl } from '../features/champions.js';
import { roleIconUrl, roleLabel } from './roleIcons.js';
import { RANK_ICONS } from './assets.js';
import { collectRevealChatPairs, makeTeamRevealChat } from './teamRevealChat.js';
import { fetchOpggMatchup, formatMcpChampionName, normalizeOpggLane } from '../features/opggMatchup.js';
import { fetchLeagueOfGraphsData, parseMcpLeaderboard } from '../features/leagueOfGraphs.js';
import {
  applyRunePage,
  perkIconUrl,
  perkName,
  perkRelativePath,
  perkStyleIconUrl,
  perkStyleName,
  STYLE_ICONS,
} from '../features/runes.js';
import { readMapSide, formatMapSideBadge } from '../features/mapSide.js';
import { muteTeammates } from '../features/muteAll.js';
import { sendChampSelectMessage } from '../features/champSelectChat.js';

const ORIGINAL_NAME_KEY = 'drakeTeamRevealOriginal';
const APPLIED_KEY = 'drakeTeamRevealApplied';
const ORIGINAL_HTML_KEY = 'drakeTeamRevealOriginalHtml';
const ORIGINAL_STYLE_KEY = 'drakeTeamRevealOriginalStyle';
const ROOT_KEY = 'drakeRevealRoot';
const SPINNER_SVG = `<svg class="team-reveal-spinner-svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="8"/></svg>`;

export const STATUS_READY_MS = 8000;

function toLabelNode(row) {
  if (!row?.querySelector) return null;
  return (
    row.querySelector('[data-drake-summoner-name]') ||
    row.querySelector('.summoner-name') ||
    row.querySelector('[data-testid="summoner-name"]') ||
    row.querySelector('[data-testid*="summoner-name"]') ||
    row.querySelector('[class*="summoner-name"]') ||
    row.querySelector('[class*="summonerName"]')
  );
}

function readCellId(row) {
  return Number(row?.dataset?.cellId ?? row?.getAttribute?.('data-cell-id') ?? -1);
}

function readRowWl(row) {
  return {
    wins: row.wins,
    losses: row.losses,
    winRate: row.winRate,
  };
}

function hasMatchWl(row) {
  return Number(row?.matchesUsed) > 0 || Number(row?.wins) + Number(row?.losses) > 0;
}

function isLiveRevealSession(session) {
  return Boolean(session && Array.isArray(session.myTeam) && session.myTeam.length);
}

function formatRankLabel(rank) {
  if (!rank?.hasRank) return 'Unranked';
  const tier = String(rank.tier || '').trim();
  if (!tier || tier === 'NONE') return 'Unranked';
  const label = tier.charAt(0) + tier.slice(1).toLowerCase();
  const apex = tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER';
  const division = apex ? '' : ` ${rank.division || ''}`.trimEnd();
  const lp = rank.lp ? ` · ${rank.lp} LP` : '';
  return `${label}${division}${lp}`;
}

function rankIconSrc(tier) {
  const key = String(tier || '').trim().toUpperCase();
  if (!key || key === 'NONE') return RANK_ICONS.UNRANKED;
  return RANK_ICONS[key] || RANK_ICONS.UNRANKED;
}

function formatWlHtml(wins, losses, winRate) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const total = w + l;
  const rate = winRate ?? (total ? Math.round((w / total) * 100) : 0);
  return `<span class="wl-win">${w}W</span>/<span class="wl-loss">${l}L</span> · ${rate}%`;
}

function formatRowName(_maskedName, snapshot) {
  if (!hasMatchWl(snapshot)) return snapshot.riotId || '';
  const wl = readRowWl(snapshot);
  return `${snapshot.riotId} (${formatWl(wl.wins, wl.losses, wl.winRate)})`;
}

function formatCardRow(label, value) {
  return `<div class="team-reveal-card-row"><span class="team-reveal-card-label">${label}</span><span class="team-reveal-card-value">${value}</span></div>`;
}

function renderRoleIcon(position) {
  const src = roleIconUrl(position);
  if (!src) return '';
  const label = roleLabel(position);
  return `<img class="team-reveal-role-icon" src="${src}" alt="" title="${label}">`;
}

function renderRankBlock(label, rank) {
  const icon = rankIconSrc(rank?.tier);
  const rankText = formatRankLabel(rank);
  return `<div class="team-reveal-rank-block">
    <div class="team-reveal-rank-head">
      <img class="team-reveal-rank-icon" src="${icon}" alt="">
      <div class="team-reveal-rank-meta">
        <span class="team-reveal-rank-queue">${label}</span>
        <span class="team-reveal-rank-tier">${rankText}</span>
      </div>
    </div>
  </div>`;
}

function renderPickedChampion(row, getChampName) {
  const id = Number(row?.pickedChampionId) || 0;
  if (!id) return '';
  const name = getChampName(id) || 'Unknown';
  const games = Number(row?.pickedGames) || 0;
  const wr = Number(row?.pickedWinRate) || 0;
  const detail = games ? `${games}g · ${wr}%` : 'no games';
  return formatCardRow(
    'Picked',
    `<span class="team-reveal-champ"><img class="team-reveal-champ-icon" src="${iconUrl(id)}" alt=""><span>${name} · ${detail}</span></span>`,
  );
}

function renderSeasonMain(row, getChampName) {
  const id = Number(row?.seasonMostPlayedChampionId) || 0;
  if (!id) return '—';
  const name = getChampName(id) || 'Unknown';
  const count = row.seasonMostPlayedCount ? ` · ${row.seasonMostPlayedCount}g` : '';
  const wl = row.seasonMostPlayedCount
    ? ` · ${formatWlPair(row.seasonMostPlayedWins, row.seasonMostPlayedLosses)} · ${row.seasonMostPlayedWinRate}%`
    : '';
  return `<span class="team-reveal-champ">
    <img class="team-reveal-champ-icon" src="${iconUrl(id)}" alt="">
    <span>${name}${count}${wl}</span>
  </span>`;
}

function cardsContentSig(snapshot) {
  return JSON.stringify(
    snapshot.map((row) => ({
      cellId: row.cellId,
      riotId: row.riotId,
      assignedPosition: row.assignedPosition,
      isLocalPlayer: row.isLocalPlayer,
      wins: row.wins,
      losses: row.losses,
      kda: row.kda,
      soloRank: row.soloRank,
      flexRank: row.flexRank,
      seasonMostPlayedChampionId: row.seasonMostPlayedChampionId,
      seasonMostPlayedCount: row.seasonMostPlayedCount,
      seasonMostPlayedWinRate: row.seasonMostPlayedWinRate,
      pickedChampionId: row.pickedChampionId,
      pickedGames: row.pickedGames,
      pickedWinRate: row.pickedWinRate,
      recentGames: row.recentGames,
    })),
  );
}

function renderRecentGames(row, getChampName) {
  const games = Array.isArray(row?.recentGames) ? row.recentGames : [];
  if (!games.length) return '<span class="team-reveal-recent-empty">—</span>';
  return `<div class="team-reveal-recent-games">${games
    .map((game) => {
      const id = Number(game?.championId) || 0;
      const name = getChampName(id) || 'Unknown';
      const result = game.win ? 'is-win' : 'is-loss';
      const kda = `${game.kills ?? 0}/${game.deaths ?? 0}/${game.assists ?? 0}`;
      return `<div class="team-reveal-recent-game ${result}" title="${name} ${kda}">
        <img class="team-reveal-champ-icon" src="${iconUrl(id)}" alt="${name}">
        <span class="team-reveal-recent-kda">${kda}</span>
      </div>`;
    })
    .join('')}</div>`;
}

function renderAdvantageBadge(winRate) {
  if (winRate === null || winRate === undefined) return '';
  if (winRate >= 50.5) {
    return `<span class="team-reveal-advantage is-advantage">Advantage</span>`;
  }
  if (winRate <= 49.5) {
    return `<span class="team-reveal-advantage is-disadvantage">Disadvantage</span>`;
  }
  return `<span class="team-reveal-advantage is-even">Even</span>`;
}

function renderSkillsRow(skills) {
  if (!Array.isArray(skills) || !skills.length) return '<span class="team-reveal-recent-empty">—</span>';
  return `<div class="team-reveal-skills-row">${skills
    .map((s) => `<span class="team-reveal-skill-badge">${s}</span>`)
    .join('<span class="team-reveal-skill-arrow">&gt;</span>')}</div>`;
}

function renderItemsRow(items) {
  if (!Array.isArray(items) || !items.length) return '<span class="team-reveal-recent-empty">—</span>';
  return `<div class="team-reveal-items-row">${items
    .map(
      (id) =>
        `<span class="team-reveal-item-badge" title="Item ${id}"><img class="team-reveal-item-icon" src="https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${id}.png" alt="${id}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline';"><span class="team-reveal-item-fallback" style="display:none;">${id}</span></span>`,
    )
    .join('')}</div>`;
}

function renderTopPlayersTable(topPlayers, loadingBuildPlayer = '', currentViewedPlayer = '') {
  if (!Array.isArray(topPlayers) || !topPlayers.length) {
    return `<div class="team-reveal-empty-card">No ranking data available</div>`;
  }
  const rows = topPlayers
    .map(
      (p) => {
        const isCurrent = currentViewedPlayer && currentViewedPlayer === p.name;
        const isLoading = loadingBuildPlayer && loadingBuildPlayer === p.name;
        let btnText = 'View Build';
        let btnClass = 'team-reveal-view-build-btn';
        if (isLoading) {
          btnText = 'Loading…';
          btnClass += ' is-loading';
        } else if (isCurrent) {
          btnText = '✓ Viewing';
          btnClass += ' is-viewing';
        }

        return `<tr>
          <td class="col-rank">#${p.ranking ?? '—'}</td>
          <td class="col-name">${p.name || 'Unknown'}</td>
          <td class="col-region">${p.region || '—'}</td>
          <td class="col-tier">${p.tier || '—'}</td>
          <td class="col-winrate">${p.winRate != null ? `${p.winRate}%` : '—'}</td>
          <td class="col-played">${p.played != null ? `${p.played}g` : '—'}</td>
          <td class="col-action">
            <button type="button" class="${btnClass}" data-team-reveal-player-build="${p.name}" data-team-reveal-player-region="${p.region || 'kr'}" ${isLoading ? 'disabled' : ''}>${btnText}</button>
          </td>
        </tr>`;
      },
    )
    .join('');

  return `<table class="team-reveal-top-players-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th>Region</th>
        <th>Tier</th>
        <th>Win Rate</th>
        <th>Played</th>
        <th>Build</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function isStatShard(id) {
  const n = Number(id);
  return n >= 5000 && n < 6000;
}

function renderRunesCard(opgg, runeApplyStatus, selectedRuneSlot = 0) {
  const runePages =
    Array.isArray(opgg?.runePages) && opgg.runePages.length > 0
      ? opgg.runePages
      : opgg?.runes
      ? [opgg.runes]
      : [];

  if (!runePages.length) {
    return `<section class="team-reveal-runes-card">
      <div class="team-reveal-matchup-card-title">Recommended Runes (OP.GG)</div>
      <div class="team-reveal-empty-card">No rune recommendation available</div>
    </section>`;
  }

  const activeRunePage = runePages[selectedRuneSlot] || runePages[0];
  const primaryStyleId = activeRunePage.primaryStyleId;
  const subStyleId = activeRunePage.subStyleId;
  const allPerks = Array.isArray(activeRunePage.selectedPerkIds)
    ? activeRunePage.selectedPerkIds
    : [];

  const shards = allPerks.filter(isStatShard);
  const regularPerks = allPerks.filter((id) => !isStatShard(id));
  const keystoneId = regularPerks[0];
  const primaryMinors = regularPerks.slice(1, 4);
  const secondaryMinors = regularPerks.slice(4, 6);

  let slotTabsHtml = '';
  if (runePages.length > 1) {
    slotTabsHtml = `<div class="team-reveal-rune-slots">
      ${runePages
        .slice(0, 2)
        .map((page, idx) => {
          const isSelected = selectedRuneSlot === idx;
          const wrLabel = page.winRate != null ? `${page.winRate}% WR` : `Slot ${idx + 1}`;
          const kId = page.selectedPerkIds?.find((id) => !isStatShard(id));
          const kName = kId ? perkName(kId) : `Page ${idx + 1}`;
          return `<button type="button" class="team-reveal-rune-slot-btn ${
            isSelected ? 'is-selected' : ''
          }" data-team-reveal-rune-slot="${idx}">
            <span class="team-reveal-rune-slot-num">${idx + 1}</span>
            <span class="team-reveal-rune-slot-label">${kName} · ${wrLabel}</span>
          </button>`;
        })
        .join('')}
    </div>`;
  }

  let applyText = '⚡ Apply Runes';
  let applyClass = 'team-reveal-apply-runes-btn hextech-btn';
  if (runeApplyStatus === 'applying') {
    applyText = 'Applying…';
  } else if (runeApplyStatus === 'applied') {
    applyText = '✓ Applied';
    applyClass += ' is-applied';
  } else if (runeApplyStatus === 'failed') {
    applyText = 'Failed (Retry)';
  }

  const primaryStyleHtml = primaryStyleId
    ? `<div class="team-reveal-rune-tree-head">
        <img class="team-reveal-rune-style-icon" src="${perkStyleIconUrl(
          primaryStyleId
        )}" alt="${perkStyleName(primaryStyleId)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-style-path') || '');}" data-style-path="${STYLE_ICONS[primaryStyleId]?.replace('/lol-game-data/assets/v1/', '') || ''}">
        <span class="team-reveal-rune-style-name">${perkStyleName(primaryStyleId)}</span>
      </div>`
    : '';

  const secondaryStyleHtml = subStyleId
    ? `<div class="team-reveal-rune-tree-head">
        <img class="team-reveal-rune-style-icon" src="${perkStyleIconUrl(
          subStyleId
        )}" alt="${perkStyleName(subStyleId)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-style-path') || '');}" data-style-path="${STYLE_ICONS[subStyleId]?.replace('/lol-game-data/assets/v1/', '') || ''}">
        <span class="team-reveal-rune-style-name">${perkStyleName(subStyleId)}</span>
      </div>`
    : '';

  const keystoneHtml = keystoneId
    ? `<div class="team-reveal-keystone-slot" title="${perkName(keystoneId)}">
        <img class="team-reveal-keystone-icon" src="${perkIconUrl(
          keystoneId
        )}" alt="${perkName(keystoneId)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-perk-path') || '');}" data-perk-path="${perkRelativePath(keystoneId)}">
        <span class="team-reveal-keystone-name">${perkName(keystoneId)}</span>
      </div>`
    : '';

  const primaryMinorsHtml = primaryMinors
    .map(
      (id) =>
        `<div class="team-reveal-perk-slot" title="${perkName(id)}">
          <img class="team-reveal-perk-icon" src="${perkIconUrl(id)}" alt="${perkName(id)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-perk-path') || '');}" data-perk-path="${perkRelativePath(id)}">
        </div>`
    )
    .join('');

  const secondaryMinorsHtml = secondaryMinors
    .map(
      (id) =>
        `<div class="team-reveal-perk-slot" title="${perkName(id)}">
          <img class="team-reveal-perk-icon" src="${perkIconUrl(id)}" alt="${perkName(id)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-perk-path') || '');}" data-perk-path="${perkRelativePath(id)}">
        </div>`
    )
    .join('');

  const shardsHtml = shards
    .map(
      (id) =>
        `<div class="team-reveal-shard-slot" title="${perkName(id)}">
          <img class="team-reveal-shard-icon" src="${perkIconUrl(id)}" alt="${perkName(id)}" onerror="if(!this.dataset.cdn){this.dataset.cdn='1';this.src='https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/' + (this.getAttribute('data-perk-path') || '');}" data-perk-path="${perkRelativePath(id)}">
        </div>`
    )
    .join('');

  const cardWr =
    activeRunePage.winRate != null
      ? `<span class="team-reveal-rune-card-wr">${activeRunePage.winRate}% WR</span>`
      : '';

  return `<section class="team-reveal-runes-card">
    <div class="team-reveal-matchup-card-title">
      <span>Runes</span>
      ${cardWr}
    </div>
    ${slotTabsHtml}
    <div class="team-reveal-runes-display">
      <div class="team-reveal-rune-tree primary">
        ${primaryStyleHtml}
        <div class="team-reveal-rune-tree-items">
          ${keystoneHtml}
          <div class="team-reveal-primary-minors">${primaryMinorsHtml}</div>
        </div>
      </div>
      <div class="team-reveal-rune-tree secondary">
        ${secondaryStyleHtml}
        <div class="team-reveal-secondary-minors">${secondaryMinorsHtml}</div>
      </div>
      <div class="team-reveal-rune-tree shards">
        <div class="team-reveal-rune-tree-head">
          <span class="team-reveal-rune-style-name shards-title">Shards</span>
        </div>
        <div class="team-reveal-shards-row">${shardsHtml}</div>
      </div>
    </div>
    <button class="${applyClass}" type="button" data-team-reveal-apply-runes="1" ${
    runeApplyStatus === 'applying' ? 'disabled' : ''
  }>${applyText}</button>
  </section>`;
}

function getLocalPlayerInfo(snapshot, session) {
  const localCellId = Number(session?.localPlayerCellId ?? -1);
  const localRow = snapshot.find((r) => r.isLocalPlayer) || snapshot.find((r) => Number(r.cellId) === localCellId);
  const localSessionPlayer = Array.isArray(session?.myTeam)
    ? session.myTeam.find((p) => Number(p?.cellId) === localCellId)
    : null;

  const pickedChampionId =
    Number(localRow?.pickedChampionId) ||
    Number(localSessionPlayer?.championId) ||
    0;

  const assignedPosition =
    localRow?.assignedPosition ||
    readAssignedPosition(localSessionPlayer) ||
    '';

  return {
    cellId: localCellId,
    riotId: localRow?.riotId || '',
    pickedChampionId,
    assignedPosition,
  };
}

function getEnemyPlayerInfo(session, localLane) {
  if (!session || !Array.isArray(session.theirTeam) || !session.theirTeam.length) {
    return null;
  }
  const normLocalLane = normalizeOpggLane(localLane);
  if (normLocalLane) {
    const sameLane = session.theirTeam.find((p) => {
      const pLane = normalizeOpggLane(readAssignedPosition(p));
      return pLane && pLane === normLocalLane && Number(p?.championId) > 0;
    });
    if (sameLane) {
      return {
        championId: Number(sameLane.championId),
        assignedPosition: readAssignedPosition(sameLane),
      };
    }
  }

  const enemiesWithChamp = session.theirTeam.filter((p) => Number(p?.championId) > 0);
  if (enemiesWithChamp.length === 1) {
    return {
      championId: Number(enemiesWithChamp[0].championId),
      assignedPosition: readAssignedPosition(enemiesWithChamp[0]),
    };
  }

  return null;
}

export function getEnemyTeamChampions(session, getChampName) {
  if (!session || !Array.isArray(session.theirTeam)) return [];
  const list = [];
  const seen = new Set();
  for (const p of session.theirTeam) {
    const id = Number(p?.championId) || 0;
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      const name = (typeof getChampName === 'function' && getChampName(id)) || `Champion ${id}`;
      const pos = readAssignedPosition(p);
      list.push({ id, name, pos });
    }
  }
  return list;
}

function renderMatchupContent({
  localChampId,
  localLane,
  enemyChampId,
  autoEnemyChampId = 0,
  manualEnemyChampId = 0,
  enemyTeamChampions = [],
  enemyLane,
  getChampName,
  matchupState,
  runeApplyStatus,
  selectedRuneSlot = 0,
  sideBadge = '',
  loadingBuildPlayer = '',
  currentViewedPlayer = '',
}) {
  if (!localChampId) {
    return `<div class="team-reveal-matchup-empty">Pick a champion to view matchup &amp; builds</div>`;
  }

  if (matchupState.loading) {
    return `<div class="team-reveal-matchup-loading">${SPINNER_SVG} <span>Loading matchup and build data…</span></div>`;
  }

  const localName = getChampName(localChampId) || 'Your Champion';
  const localRoleIcon = renderRoleIcon(localLane);
  const localRoleText = roleLabel(localLane) || localLane;

  const enemyName = enemyChampId ? getChampName(enemyChampId) || 'Enemy' : 'Unknown Opponent';
  const enemyRoleIcon = renderRoleIcon(enemyLane || localLane);
  const enemyRoleText = roleLabel(enemyLane || localLane) || enemyLane || localLane;

  const enemyChampIcon = enemyChampId
    ? `<img class="team-reveal-matchup-champ-icon" src="${iconUrl(enemyChampId)}" alt="${enemyName}">`
    : `<div class="team-reveal-matchup-champ-placeholder">?</div>`;

  const opgg = matchupState.data?.opgg;
  const log = matchupState.data?.log;

  const wrVsSuffix = opgg?.isCounterMatchup && enemyChampId ? ` vs ${enemyName}` : '';
  const wrText =
    opgg?.winRate != null
      ? `<span class="team-reveal-matchup-wr">${opgg.winRate}% WR${wrVsSuffix}${opgg.totalMatches ? ` · ${opgg.totalMatches.toLocaleString()} games` : ''}</span>`
      : `<span class="team-reveal-matchup-wr">No matchup stats</span>`;

  const advantageBadge = renderAdvantageBadge(opgg?.winRate);

  const skills = (opgg?.skills && opgg.skills.length ? opgg.skills : log?.proBuild?.skills) || [];
  const items = (opgg?.coreItems && opgg.coreItems.length ? opgg.coreItems : log?.proBuild?.items) || [];
  const topPlayers = log?.topPlayers || [];

  const autoEnemyName = autoEnemyChampId ? (getChampName(autoEnemyChampId) || 'Detected') : 'None';

  let enemyPickerHtml = '';
  if (enemyTeamChampions.length > 0) {
    const autoSelected = !manualEnemyChampId ? 'is-selected' : '';
    const autoBtn = `<button type="button" class="team-reveal-enemy-chip ${autoSelected}" data-team-reveal-enemy-select="0" title="Auto detect opponent">
      <span class="team-reveal-enemy-chip-auto-icon">🎯</span>
      <span class="team-reveal-enemy-chip-name">Auto (${autoEnemyName})</span>
    </button>`;

    const champBtns = enemyTeamChampions
      .map((c) => {
        const isSelected = Number(manualEnemyChampId) === Number(c.id);
        const roleIcon = renderRoleIcon(c.pos);
        return `<button type="button" class="team-reveal-enemy-chip ${isSelected ? 'is-selected' : ''}" data-team-reveal-enemy-select="${c.id}" title="${c.name}">
          <img class="team-reveal-enemy-chip-icon" src="${iconUrl(c.id)}" alt="${c.name}">
          ${roleIcon}
          <span class="team-reveal-enemy-chip-name">${c.name}</span>
        </button>`;
      })
      .join('');

    enemyPickerHtml = `<div class="team-reveal-enemy-picker-bar">
      <span class="team-reveal-enemy-picker-label">Opponent:</span>
      <div class="team-reveal-enemy-picker-list">
        ${autoBtn}
        ${champBtns}
      </div>
    </div>`;
  } else {
    enemyPickerHtml = `<div class="team-reveal-enemy-picker-bar">
      <span class="team-reveal-enemy-picker-label">Opponent:</span>
      <span class="team-reveal-enemy-picker-empty">Waiting for enemy picks in champion select…</span>
    </div>`;
  }

  return `<div class="team-reveal-matchup-head">
    <div class="team-reveal-matchup-champs">
      <div class="team-reveal-matchup-side">
        <img class="team-reveal-matchup-champ-icon" src="${iconUrl(localChampId)}" alt="${localName}">
        <div class="team-reveal-matchup-side-meta">
          <div class="team-reveal-matchup-side-name">${localName}</div>
          <div class="team-reveal-matchup-side-role">${localRoleIcon} ${localRoleText}</div>
        </div>
      </div>
      <div class="team-reveal-matchup-vs">VS</div>
      <div class="team-reveal-matchup-side">
        ${enemyChampIcon}
        <div class="team-reveal-matchup-side-meta">
          <div class="team-reveal-matchup-side-name">${enemyName}</div>
          <div class="team-reveal-matchup-side-role">${enemyRoleIcon} ${enemyRoleText}</div>
        </div>
      </div>
    </div>
    <div class="team-reveal-matchup-meta">
      ${sideBadge}
      ${wrText}
      ${advantageBadge}
    </div>
  </div>
  ${enemyPickerHtml}
  <div class="team-reveal-matchup-grid">
    ${renderRunesCard(opgg, runeApplyStatus, selectedRuneSlot)}
    <section class="team-reveal-items-card">
      <div class="team-reveal-matchup-card-title">Skill Order &amp; Core Items</div>
      <div class="team-reveal-card-row">
        <span class="team-reveal-card-label">Skill Order</span>
        <div class="team-reveal-card-value">${renderSkillsRow(skills)}</div>
      </div>
      <div class="team-reveal-card-row">
        <span class="team-reveal-card-label">Core Items</span>
        <div class="team-reveal-card-value">${renderItemsRow(items)}</div>
      </div>
    </section>
    <section class="team-reveal-top-players-card">
      <div class="team-reveal-matchup-card-title">Top Players (League of Graphs)</div>
      ${renderTopPlayersTable(topPlayers, loadingBuildPlayer, currentViewedPlayer)}
    </section>
  </div>`;
}

function renderOverlayShell({
  activeTab,
  snapshot,
  currentSession,
  getChampName,
  getChampions,
  manualEnemyChampId = 0,
  matchupState,
  runeApplyStatus,
  selectedRuneSlot = 0,
  muteStatus = 'idle',
  showMapSide = true,
  loadingBuildPlayer = '',
  currentViewedPlayer = '',
}) {
  const sideInfo = showMapSide ? readMapSide(currentSession) : null;
  const sideBadge = sideInfo?.label ? formatMapSideBadge(sideInfo) : '';
  let muteText = 'Mute All';
  let muteClass = 'team-reveal-mute-btn';
  if (muteStatus === 'muting') {
    muteText = 'Muting…';
  } else if (muteStatus === 'muted') {
    muteText = '✓ Muted';
    muteClass += ' is-muted';
  } else if (muteStatus === 'failed') {
    muteText = 'Mute Failed';
  }
  const cards = snapshot
    .map((row) => {
      const riotId = row.riotId || 'Unknown';
      const youTag = row.isLocalPlayer ? ' <span class="team-reveal-you">(You)</span>' : '';
      const recentWl = formatWlHtml(row.wins, row.losses, row.winRate);
      const kda = row.kda ?? '—';
      const last12h = formatWlPair(row.last12hWins, row.last12hLosses);
      const recentNote = row.matchesUsed ? ` · last ${row.matchesUsed} games` : '';
      const cardClass = row.isLocalPlayer ? 'team-reveal-card is-you' : 'team-reveal-card';
      const roleIcon = renderRoleIcon(row.assignedPosition);
      return `<section class="${cardClass}">
        <div class="team-reveal-card-head">
          <div class="team-reveal-card-title-row">
            ${roleIcon}
            <div class="team-reveal-card-title">${riotId}${youTag}</div>
          </div>
        </div>
        <div class="team-reveal-ranks">
          ${renderRankBlock('Solo/Duo', row.soloRank)}
          ${renderRankBlock('Flex', row.flexRank)}
        </div>
        <div class="team-reveal-card-section">
          ${formatCardRow(`Recent W/L${recentNote}`, recentWl)}
          ${formatCardRow('Recent KDA', kda)}
          ${formatCardRow('Last 12h', last12h)}
          ${renderPickedChampion(row, getChampName)}
          ${formatCardRow('Season Main', renderSeasonMain(row, getChampName))}
          ${formatCardRow('Last 5', renderRecentGames(row, getChampName))}
        </div>
      </section>`;
    })
    .join('');

  const localInfo = getLocalPlayerInfo(snapshot, currentSession);
  const autoEnemyInfo = getEnemyPlayerInfo(currentSession, localInfo.assignedPosition);
  const enemyTeamChampions = getEnemyTeamChampions(currentSession, getChampName);
  const effectiveEnemyChampId = manualEnemyChampId > 0 ? manualEnemyChampId : (autoEnemyInfo?.championId || 0);

  const matchupContent =
    activeTab === 'matchup'
      ? `<div class="team-reveal-matchup-view">${renderMatchupContent({
          localChampId: localInfo.pickedChampionId,
          localLane: localInfo.assignedPosition,
          enemyChampId: effectiveEnemyChampId,
          autoEnemyChampId: autoEnemyInfo?.championId || 0,
          manualEnemyChampId,
          enemyTeamChampions,
          enemyLane: autoEnemyInfo?.assignedPosition || '',
          getChampName,
          matchupState,
          runeApplyStatus,
          selectedRuneSlot,
          sideBadge,
          loadingBuildPlayer,
          currentViewedPlayer,
        })}</div>`
      : `<div class="team-reveal-panel">${cards}</div>`;

  return `<div class="team-reveal-shell" data-team-reveal-panel="1">
    <button class="${muteClass}" type="button" data-team-reveal-mute="1" ${muteStatus === 'muting' ? 'disabled' : ''}>${muteText}</button>
    <button class="team-reveal-close" type="button" data-team-reveal-close="1" aria-label="Close">Close</button>
    <div class="team-reveal-tabs">
      <button class="team-reveal-tab ${activeTab === 'scouting' ? 'is-active' : ''}" type="button" data-team-reveal-tab="scouting" ${activeTab === 'scouting' ? 'aria-selected="true"' : ''}>Team Scouting</button>
      <button class="team-reveal-tab ${activeTab === 'matchup' ? 'is-active' : ''}" type="button" data-team-reveal-tab="matchup" ${activeTab === 'matchup' ? 'aria-selected="true"' : ''}>Matchup &amp; Builds</button>
      ${sideBadge}
    </div>
    ${matchupContent}
  </div>`;
}

function overlayRenderSig({
  activeTab,
  snapshot,
  currentSession,
  matchupState,
  runeApplyStatus,
  selectedRuneSlot = 0,
  muteStatus = 'idle',
  showMapSide = true,
  manualEnemyChampId = 0,
  loadingBuildPlayer = '',
  currentViewedPlayer = '',
}) {
  const localInfo = getLocalPlayerInfo(snapshot, currentSession);
  const autoEnemyInfo = getEnemyPlayerInfo(currentSession, localInfo.assignedPosition);
  const effectiveEnemyChampId = manualEnemyChampId > 0 ? manualEnemyChampId : (autoEnemyInfo?.championId || 0);
  const sideInfo = showMapSide ? readMapSide(currentSession) : null;
  const enemyTeamChampions = getEnemyTeamChampions(currentSession);
  const enemyPicksSig = enemyTeamChampions.map((c) => `${c.id}:${c.pos}`).join(',');
  return JSON.stringify({
    tab: activeTab,
    cards: activeTab === 'scouting' ? cardsContentSig(snapshot) : '',
    localChampId: localInfo.pickedChampionId,
    localLane: localInfo.assignedPosition,
    enemyChampId: effectiveEnemyChampId,
    manualEnemyChampId,
    enemyPicksSig,
    loading: matchupState.loading,
    hasData: Boolean(matchupState.data),
    opggWr: matchupState.data?.opgg?.winRate,
    topPlayersCount: matchupState.data?.log?.topPlayers?.length || 0,
    runeStatus: runeApplyStatus,
    selectedRuneSlot,
    muteStatus,
    side: sideInfo?.side || '',
    showMapSide: Boolean(showMapSide),
    loadingBuildPlayer,
    currentViewedPlayer,
  });
}

function readLabelNodes(doc) {
  const seen = new Set();
  const out = [];
  const selectors = [
    '[data-testid="summoner-name"]',
    '[data-testid*="summoner-name"]',
    '.summoner-name',
    '[class*="summoner-name"]',
    '[class*="champ-select"] [class*="name"]',
  ];
  for (const selector of selectors) {
    for (const node of doc.querySelectorAll(selector)) {
      if (seen.has(node)) continue;
      seen.add(node);
      out.push(node);
    }
  }
  return out;
}

function findLabelsByCurrentNames(doc, snapshot) {
  const pool = readLabelNodes(doc).filter((node) => {
    if (node?.dataset?.[APPLIED_KEY]) return false;
    const text = String(node?.textContent || '').trim();
    return Boolean(text) && text.length <= 48;
  });
  const matched = [];
  const used = new Set();
  for (const row of snapshot) {
    const riotId = String(row?.riotId || '').trim().toLowerCase();
    const nameOnly = riotId.split('#')[0] || '';
    if (!riotId && !nameOnly) continue;
    const node = pool.find((entry) => {
      if (used.has(entry)) return false;
      const text = String(entry?.textContent || '').trim().toLowerCase();
      return text === riotId || text === nameOnly;
    });
    if (!node) continue;
    used.add(node);
    matched.push({ row, label: node });
  }
  return matched;
}

const LABEL_SIG_KEY = 'drakeRevealSig';

function stillShowsOurReveal(label) {
  if (!label?.dataset?.[APPLIED_KEY] && !label?.dataset?.[LABEL_SIG_KEY]) return false;
  if (label.querySelector?.('.drake-reveal-name')) return true;
  const sig = String(label.dataset?.[LABEL_SIG_KEY] || '');
  const riotId = sig.split('|')[0] || '';
  if (!riotId) return false;
  const text = String(label.textContent || '').trim();
  return text === riotId || text.startsWith(`${riotId} `) || text.startsWith(`${riotId}(`);
}

function applyLabel(label, info) {
  if (!label.dataset) label.dataset = {};
  const wl = readRowWl(info);
  const showWl = hasMatchWl(info);
  const sig = `${info.riotId}|${showWl ? `${wl.wins}|${wl.losses}|${wl.winRate}` : 'pending'}`;
  if (label.dataset[APPLIED_KEY] === '1' && label.dataset[LABEL_SIG_KEY] === sig) return;
  label.setAttribute?.('data-drake-reveal-root', '1');
  label.dataset[ROOT_KEY] = '1';
  if (!label.dataset[ORIGINAL_NAME_KEY]) {
    label.dataset[ORIGINAL_NAME_KEY] = label.textContent || '';
  }
  if (!label.dataset[ORIGINAL_HTML_KEY]) {
    label.dataset[ORIGINAL_HTML_KEY] = typeof label.innerHTML === 'string' ? label.innerHTML : '';
  }
  if (!label.dataset[ORIGINAL_STYLE_KEY]) {
    label.dataset[ORIGINAL_STYLE_KEY] = label.style?.cssText || '';
  }
  if (typeof label.innerHTML === 'string') {
    const stats = showWl
      ? `<span class="drake-reveal-stats">${formatWlHtml(wl.wins, wl.losses, wl.winRate)}</span>`
      : '';
    label.innerHTML = `<span class="drake-reveal-name">${info.riotId}</span>${stats}`;
    if (label.style) {
      label.style.cssText = `${label.dataset[ORIGINAL_STYLE_KEY]};display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.1;max-height:none;height:auto;`;
    }
    const parent = label.parentElement;
    if (parent?.style) {
      parent.style.overflow = 'visible';
      parent.style.maxHeight = 'none';
      parent.style.height = 'auto';
    }
  } else {
    label.textContent = formatRowName('', info);
  }
  label.dataset[APPLIED_KEY] = '1';
  label.dataset[LABEL_SIG_KEY] = sig;
}

export function makeTeamRevealDom({
  doc,
  subscribe,
  loadSnapshot,
  overlayRoot,
  lcu,
  muteTeammatesImpl = muteTeammates,
  sendChampSelectMessageImpl = sendChampSelectMessage,
  fetchOpggMatchupImpl = fetchOpggMatchup,
  fetchLeagueOfGraphsImpl = fetchLeagueOfGraphsData,
  applyRunePageImpl = applyRunePage,
  fetchFn = globalThis.fetch,
  getChampName = () => '',
  getChampions = () => [],
  getRecentPool = () => 'ranked_both',
  getShowMapSide = () => true,
  getAutoMute = () => false,
  getAutoMessage = () => '',
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  statusReadyMs = STATUS_READY_MS,
  onRevealTiming,
  MutationObserverImpl,
}) {
  const chat = makeTeamRevealChat({ doc, MutationObserverImpl });
  let enabled = false;
  let stopSession = null;
  let snapshot = [];
  let currentSession = null;
  let overlay = null;
  let statusNode = null;
  let statusSpinner = null;
  let statusText = null;
  let statusOpenBtn = null;
  let statusBar = null;
  let readyDismissTimer = null;
  let open = false;
  let boundLabels = new Map();
  let lastSessionSig = '';
  let lastLobbyKey = '';
  let lastTeam = [];
  let lastCardsRenderSig = '';
  let statusPhase = 'hidden';
  let lastPhase = '';
  let pendingScrub = false;
  let loadGen = 0;
  let loadAbort = null;
  let stopPhase = null;
  let activeTab = 'scouting';
  let manualEnemyChampId = 0;
  let selectedRuneSlot = 0;
  let matchupGen = 0;
  let matchupState = {
    loading: false,
    error: null,
    data: null,
    key: '',
  };
  let runeApplyStatus = 'idle';
  let muteStatus = 'idle';
  let autoMutedLobbyKey = '';
  let lastAutoMessageLobbyKey = '';
  let loadingBuildPlayer = '';
  let currentViewedPlayer = '';

  function stopRevealLoad() {
    loadGen += 1;
    if (loadAbort) {
      loadAbort.abort();
      loadAbort = null;
    }
  }

  function clearReveal() {
    stopRevealLoad();
    restoreRows();
    chat.clear();
    pendingScrub = true;
    snapshot = [];
    currentSession = null;
    lastSessionSig = '';
    lastLobbyKey = '';
    lastTeam = [];
    lastCardsRenderSig = '';
    activeTab = 'scouting';
    manualEnemyChampId = 0;
    selectedRuneSlot = 0;
    matchupGen += 1;
    matchupState = { loading: false, error: null, data: null, key: '' };
    runeApplyStatus = 'idle';
    muteStatus = 'idle';
    autoMutedLobbyKey = '';
    lastAutoMessageLobbyKey = '';
    loadingBuildPlayer = '';
    currentViewedPlayer = '';
    open = false;
    renderVisibility();
    setStatus('hidden');
  }

  function scrubStaleRows() {
    if (!pendingScrub) return;
    restoreRows();
    pendingScrub = false;
  }

  function handlePhase(payload) {
    if (!enabled) return;
    const phase = readGameflowPhase(payload);
    if (!phase) return;
    const previous = lastPhase;
    lastPhase = phase;
    if (phase !== 'ChampSelect') {
      clearReveal();
      return;
    }
    if (previous && previous !== 'ChampSelect') {
      restoreRows();
      pendingScrub = false;
    } else {
      scrubStaleRows();
    }
  }

  function needsReapply() {
    if (!snapshot.length) return false;
    if (boundLabels.size === 0) return true;
    for (const label of boundLabels.values()) {
      if (label.isConnected === false) return true;
    }
    return false;
  }

  function applyPickRefresh(session) {
    if (!snapshot.length) return false;
    const { rows, changed } = refreshPickedChampionOnRows(snapshot, session, getRecentPool());
    if (!changed) return false;
    snapshot = rows;
    lastCardsRenderSig = '';
    if (open && activeTab === 'matchup') ensureMatchupData();
    if (open) renderVisibility();
    return true;
  }

  function mergeRowsByCell(session) {
    if (!snapshot.length) return false;
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    const localCellId = Number(session?.localPlayerCellId ?? -1);
    const byCell = new Map(
      team.map((player) => [
        Number(player?.cellId),
        {
          assignedPosition: readAssignedPosition(player),
          puuid: String(player?.puuid || '').trim(),
          summonerId: Number(player?.summonerId) || 0,
          obfuscatedPuuid: String(player?.obfuscatedPuuid || '').trim(),
        },
      ]),
    );
    let changed = false;
    snapshot = snapshot.map((row) => {
      const cellId = Number(row.cellId);
      const next = byCell.get(cellId);
      if (!next) return row;
      const assignedPosition = next.assignedPosition || row.assignedPosition || '';
      const isLocalPlayer = cellId === localCellId;
      const puuid = next.puuid || row.puuid || '';
      const summonerId = next.summonerId || row.summonerId || 0;
      const obfuscatedPuuid = next.obfuscatedPuuid || row.obfuscatedPuuid || '';
      if (
        assignedPosition === (row.assignedPosition || '') &&
        Boolean(row.isLocalPlayer) === isLocalPlayer &&
        puuid === (row.puuid || '') &&
        summonerId === (row.summonerId || 0) &&
        obfuscatedPuuid === (row.obfuscatedPuuid || '')
      ) {
        return row;
      }
      changed = true;
      return {
        ...row,
        assignedPosition,
        isLocalPlayer,
        puuid,
        summonerId,
        obfuscatedPuuid,
      };
    });
    if (changed) lastCardsRenderSig = '';
    return true;
  }

  function applyRemappedSnapshot(session) {
    if (!snapshot.length) return false;
    const { rows, changed, ok } = remapSnapshotToSession(snapshot, session);
    if (!ok) return false;
    if (!changed) return true;
    snapshot = rows;
    lastCardsRenderSig = '';
    restoreRows();
    applyRows(snapshot);
    if (open) renderVisibility();
    return true;
  }

  function teamFingerprint(session) {
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    return team
      .map((player) => ({
        cellId: Number(player?.cellId),
        summonerId: Number(player?.summonerId) || 0,
        puuid: String(player?.puuid || ''),
        obf: String(player?.obfuscatedPuuid || ''),
      }))
      .sort((a, b) => a.cellId - b.cellId);
  }

  function sameTeamIdentity(prev, next) {
    if (!prev.length || prev.length !== next.length) return false;
    return prev.every((left, index) => {
      const right = next[index];
      if (left.cellId !== right.cellId) return false;
      if (left.puuid && right.puuid && left.puuid !== right.puuid) return false;
      if (left.summonerId && right.summonerId && left.summonerId !== right.summonerId) return false;
      if (left.obf && right.obf && left.obf !== right.obf) return false;

      const shared =
        (left.puuid && right.puuid) ||
        (left.summonerId && right.summonerId) ||
        (left.obf && right.obf);
      if (shared) return true;

      const leftHas = Boolean(left.puuid || left.summonerId || left.obf);
      const rightHas = Boolean(right.puuid || right.summonerId || right.obf);
      if (leftHas && rightHas) return false;
      return true;
    });
  }

  function sessionSignature(session) {
    return JSON.stringify(teamFingerprint(session));
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    const existing = overlayRoot?.querySelector?.('.team-reveal-overlay');
    if (existing) {
      overlay = existing;
      wireOverlayEvents(overlay);
      return overlay;
    }
    const owner = overlayRoot?.ownerDocument || doc;
    const node = owner?.createElement?.('div');
    if (!node) return null;
    node.className = 'team-reveal-overlay';
    node.hidden = true;
    if (node.style) node.style.display = 'none';
    overlayRoot?.appendChild?.(node);
    overlay = node;
    wireOverlayEvents(overlay);
    return overlay;
  }

  function ensureMatchupData() {
    const localInfo = getLocalPlayerInfo(snapshot, currentSession);
    const autoEnemyInfo = getEnemyPlayerInfo(currentSession, localInfo.assignedPosition);
    const effectiveEnemyChampId = manualEnemyChampId > 0 ? manualEnemyChampId : (autoEnemyInfo?.championId || 0);

    if (!localInfo.pickedChampionId) {
      matchupState = { loading: false, error: null, data: null, key: '' };
      return;
    }

    const key = `${localInfo.pickedChampionId}_${localInfo.assignedPosition}_${effectiveEnemyChampId}`;
    if (matchupState.key === key && (matchupState.loading || matchupState.data)) {
      return;
    }

    matchupState.key = key;
    matchupState.loading = true;
    matchupState.error = null;
    matchupState.data = null;
    selectedRuneSlot = 0;
    runeApplyStatus = 'idle';

    const gen = ++matchupGen;
    const champName = getChampName(localInfo.pickedChampionId);
    const mcpName = formatMcpChampionName(champName);

    Promise.all([
      fetchOpggMatchupImpl({
        championId: localInfo.pickedChampionId,
        championName: champName,
        lane: localInfo.assignedPosition,
        enemyChampionId: effectiveEnemyChampId,
        fetchFn,
      }).catch(() => null),
      fetchLeagueOfGraphsImpl({
        championName: champName,
        lane: localInfo.assignedPosition,
        fetchFn,
      }).then(async (logRes) => {
        // If League of Graphs didn't return top players, fallback to OP.GG leaderboard
        if ((!logRes?.topPlayers || logRes.topPlayers.length === 0) && mcpName) {
          try {
            const mcpLeaderboardRes = await fetchFn('https://mcp-api.op.gg/mcp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                  name: 'lol_list_champion_leaderboard',
                  arguments: {
                    champion: mcpName,
                    region: region ? String(region).toLowerCase() : 'kr',
                    lang: 'en_US',
                  },
                },
              }),
            });
            if (mcpLeaderboardRes && mcpLeaderboardRes.ok && typeof mcpLeaderboardRes.json === 'function') {
              const data = await mcpLeaderboardRes.json();
              const text = data?.result?.content?.[0]?.text || '';
              const topPlayers = parseMcpLeaderboard(text, region || 'KR');
              if (topPlayers.length > 0) {
                return {
                  ...(logRes || {}),
                  topPlayers,
                  hasData: true,
                };
              }
            }
          } catch {}
        }
        return logRes;
      }).catch(() => null),
    ])
      .then(([opgg, log]) => {
        if (gen !== matchupGen) return;
        matchupState.loading = false;
        matchupState.data = {
          opgg: opgg || null,
          log: log || null,
        };
        lastCardsRenderSig = '';
        if (open) renderVisibility();
      })
      .catch((err) => {
        if (gen !== matchupGen) return;
        matchupState.loading = false;
        matchupState.error = err?.message || 'Failed to load matchup';
        lastCardsRenderSig = '';
        if (open) renderVisibility();
      });
  }

  async function handleFetchPlayerBuild(playerName, playerRegion = 'kr') {
    if (loadingBuildPlayer) return;
    loadingBuildPlayer = playerName;
    lastCardsRenderSig = '';
    renderVisibility();

    const localInfo = getLocalPlayerInfo(snapshot, currentSession);
    const champId = localInfo.pickedChampionId;
    const parts = String(playerName || '').split('#');
    const gameName = parts[0] || '';
    const tagLine = parts[1] || '';

    try {
      const res = await fetchFn('https://mcp-api.op.gg/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'lol_list_summoner_matches',
            arguments: {
              game_name: gameName,
              tag_line: tagLine,
              region: String(playerRegion || 'kr').toLowerCase(),
            },
          },
        }),
      });

      if (res && res.ok && typeof res.json === 'function') {
        const data = await res.json();
        const text = data?.result?.content?.[0]?.text || '';
        if (text) {
          const participantRegex =
            /Participant\(Summoner\([^)]+\),(\d+),"([^"]*)","[^"]*","([^"]*)",\[([^\]]*)\],\[([^\]]*)\],Rune\((\d+),(\d+),(\d+)\),\[([^\]]*)\],Stats\([^)]*?"(WIN|LOSE)"/g;
          let match;
          const playerRunePages = [];
          let playerItems = [];

          while ((match = participantRegex.exec(text)) !== null) {
            const pChampId = Number(match[1]);
            const pItemsStr = match[4];
            const pPrimaryStyle = Number(match[6]);
            const pPrimaryRune = Number(match[7]);
            const pSecondaryStyle = Number(match[8]);

            if (champId && pChampId === champId) {
              if (!playerItems.length && pItemsStr) {
                playerItems = pItemsStr
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isInteger(n) && n > 0);
              }
              if (pPrimaryStyle > 0 && pSecondaryStyle > 0 && pPrimaryRune > 0) {
                const already = playerRunePages.some(
                  (p) => p.primaryStyleId === pPrimaryStyle && p.selectedPerkIds[0] === pPrimaryRune
                );
                if (!already) {
                  playerRunePages.push({
                    primaryStyleId: pPrimaryStyle,
                    subStyleId: pSecondaryStyle,
                    selectedPerkIds: [pPrimaryRune],
                    winRate: null,
                  });
                }
              }
            }
          }

          if (playerRunePages.length > 0 || playerItems.length > 0) {
            currentViewedPlayer = playerName;
            if (matchupState.data?.opgg) {
              if (playerRunePages.length > 0) {
                matchupState.data.opgg.runePages = playerRunePages;
                matchupState.data.opgg.runes = playerRunePages[0];
                selectedRuneSlot = 0;
              }
              if (playerItems.length > 0) {
                matchupState.data.opgg.coreItems = playerItems;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Drake]', 'Failed to fetch player build:', err);
    } finally {
      loadingBuildPlayer = '';
      lastCardsRenderSig = '';
      if (open) renderVisibility();
    }
  }

  async function handleApplyRunes() {
    if (runeApplyStatus === 'applying') return;
    const runePages = matchupState.data?.opgg?.runePages;
    const runes =
      (Array.isArray(runePages) && runePages[selectedRuneSlot]) ||
      matchupState.data?.opgg?.runes;
    if (!runes || !lcu) {
      runeApplyStatus = 'failed';
      lastCardsRenderSig = '';
      renderVisibility();
      return;
    }
    const localInfo = getLocalPlayerInfo(snapshot, currentSession);
    const champName = getChampName(localInfo.pickedChampionId);
    runeApplyStatus = 'applying';
    lastCardsRenderSig = '';
    renderVisibility();
    try {
      const res = await applyRunePageImpl(lcu, {
        name: `${champName || 'Drake'} Matchup`,
        primaryStyleId: runes.primaryStyleId,
        subStyleId: runes.subStyleId,
        selectedPerkIds: runes.selectedPerkIds,
      });
      runeApplyStatus = res?.success ? 'applied' : 'failed';
    } catch {
      runeApplyStatus = 'failed';
    }
    lastCardsRenderSig = '';
    if (open) renderVisibility();
  }

  async function handleMuteAll() {
    if (muteStatus === 'muting' || !currentSession || !lcu) return;
    muteStatus = 'muting';
    lastCardsRenderSig = '';
    renderVisibility();
    try {
      const res = await muteTeammatesImpl(lcu, currentSession);
      muteStatus = res?.success ? 'muted' : 'failed';
    } catch {
      muteStatus = 'failed';
    }
    lastCardsRenderSig = '';
    if (open) renderVisibility();
  }

  function wireOverlayEvents(node) {
    if (!node?.addEventListener || node.dataset?.drakeRevealWired === '1') return;
    if (node.dataset) node.dataset.drakeRevealWired = '1';
    node.addEventListener('change', (event) => {
      const target = event.target;
      const selectElem =
        target?.matches?.('[data-team-reveal-enemy-select]') ? target :
        target?.closest?.('[data-team-reveal-enemy-select]');
      if (selectElem) {
        const raw = target.value ?? selectElem.dataset?.teamRevealEnemySelect;
        const val = Number(raw) || 0;
        manualEnemyChampId = val > 0 ? val : 0;
        matchupState = { loading: false, error: null, data: null, key: '' };
        ensureMatchupData();
        lastCardsRenderSig = '';
        renderVisibility();
      }
    });
    node.addEventListener('click', async (event) => {
      const target = event.target;
      if (target?.closest?.('[data-team-reveal-close="1"]') || target?.dataset?.teamRevealClose === '1') {
        event.stopPropagation?.();
        closeCards();
        return;
      }
      const enemySelectBtn =
        target?.matches?.('[data-team-reveal-enemy-select]') ? target :
        target?.closest?.('[data-team-reveal-enemy-select]');
      if (enemySelectBtn) {
        event.stopPropagation?.();
        const raw = enemySelectBtn.dataset?.teamRevealEnemySelect ?? enemySelectBtn.value;
        const val = Number(raw) || 0;
        manualEnemyChampId = val > 0 ? val : 0;
        matchupState = { loading: false, error: null, data: null, key: '' };
        ensureMatchupData();
        lastCardsRenderSig = '';
        renderVisibility();
        return;
      }
      const tabBtn =
        target?.closest?.('[data-team-reveal-tab]') ||
        (target?.dataset?.teamRevealTab ? target : null);
      if (tabBtn) {
        event.stopPropagation?.();
        const tab = tabBtn.dataset?.teamRevealTab || tabBtn.getAttribute?.('data-team-reveal-tab');
        if (tab && tab !== activeTab) {
          activeTab = tab;
          lastCardsRenderSig = '';
          if (activeTab === 'matchup') {
            ensureMatchupData();
          }
          renderVisibility();
        }
        return;
      }
      const runeSlotBtn =
        target?.matches?.('[data-team-reveal-rune-slot]') ? target :
        target?.closest?.('[data-team-reveal-rune-slot]');
      if (runeSlotBtn) {
        event.stopPropagation?.();
        const raw = runeSlotBtn.dataset?.teamRevealRuneSlot;
        const idx = Number(raw) || 0;
        if (selectedRuneSlot !== idx) {
          selectedRuneSlot = idx;
          runeApplyStatus = 'idle';
          lastCardsRenderSig = '';
          renderVisibility();
        }
        return;
      }
      const playerBuildBtn =
        target?.matches?.('[data-team-reveal-player-build]') ? target :
        target?.closest?.('[data-team-reveal-player-build]');
      if (playerBuildBtn) {
        event.stopPropagation?.();
        const playerName = playerBuildBtn.dataset?.teamRevealPlayerBuild;
        const playerRegion = playerBuildBtn.dataset?.teamRevealPlayerRegion || 'kr';
        if (playerName && !loadingBuildPlayer) {
          await handleFetchPlayerBuild(playerName, playerRegion);
        }
        return;
      }
      const applyRunesBtn =
        target?.closest?.('[data-team-reveal-apply-runes="1"]') ||
        (target?.dataset?.teamRevealApplyRunes === '1' ? target : null);
      if (applyRunesBtn) {
        event.stopPropagation?.();
        await handleApplyRunes();
        return;
      }
      const muteBtn =
        target?.closest?.('[data-team-reveal-mute="1"]') ||
        (target?.dataset?.teamRevealMute === '1' ? target : null);
      if (muteBtn) {
        event.stopPropagation?.();
        await handleMuteAll();
        return;
      }
      if (target === node) {
        closeCards();
        return;
      }
      if (target?.closest && !target.closest('[data-team-reveal-panel="1"]')) {
        closeCards();
      }
    });
  }

  function ensureStatusBar(node, owner) {
    if (statusBar) return statusBar;
    statusBar = node.querySelector?.('.team-reveal-status-bar');
    if (statusBar) return statusBar;
    if (!owner?.createElement) return null;
    const bar = owner.createElement('div');
    bar.className = 'team-reveal-status-bar';
    bar.hidden = true;
    if (bar.style) bar.style.display = 'none';
    node.appendChild(bar);
    statusBar = bar;
    return statusBar;
  }

  function stopReadyDismiss() {
    if (readyDismissTimer != null) {
      clearTimeoutImpl(readyDismissTimer);
      readyDismissTimer = null;
    }
    if (statusBar) {
      statusBar.hidden = true;
      if (statusBar.style) {
        statusBar.style.display = 'none';
        statusBar.style.animation = 'none';
      }
    }
  }

  function startReadyDismiss() {
    stopReadyDismiss();
    const bar = statusBar || ensureStatusBar(statusNode, overlayRoot?.ownerDocument || doc);
    if (!bar) return;
    bar.hidden = false;
    if (bar.style) {
      bar.style.display = 'block';
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = `team-reveal-status-shrink ${statusReadyMs}ms linear forwards`;
    }
    readyDismissTimer = setTimeoutImpl(() => {
      readyDismissTimer = null;
      setStatus('hidden');
    }, statusReadyMs);
  }

  function ensureStatus() {
    if (statusNode) return statusNode;
    const existing = overlayRoot?.querySelector?.('.team-reveal-status');
    if (existing) {
      statusNode = existing;
      statusSpinner = existing.querySelector?.('.team-reveal-status-spinner');
      statusText = existing.querySelector?.('.team-reveal-status-text');
      statusOpenBtn = existing.querySelector?.('.team-reveal-status-open');
      wireStatusOpen(statusOpenBtn);
      ensureStatusBar(existing, overlayRoot?.ownerDocument || doc);
      return statusNode;
    }
    const owner = overlayRoot?.ownerDocument || doc;
    const node = owner?.createElement?.('div');
    if (!node) return null;
    node.className = 'team-reveal-status';
    node.hidden = true;
    if (node.style) node.style.display = 'none';

    const spinner = owner.createElement('span');
    spinner.className = 'team-reveal-status-spinner';
    spinner.innerHTML = SPINNER_SVG;
    spinner.hidden = true;

    const text = owner.createElement('span');
    text.className = 'team-reveal-status-text';

    const openBtn = owner.createElement('button');
    openBtn.className = 'team-reveal-status-open';
    openBtn.type = 'button';
    openBtn.textContent = 'View';
    openBtn.hidden = true;
    wireStatusOpen(openBtn);

    node.appendChild(spinner);
    node.appendChild(text);
    node.appendChild(openBtn);
    overlayRoot?.appendChild?.(node);
    statusNode = node;
    statusSpinner = spinner;
    statusText = text;
    statusOpenBtn = openBtn;
    ensureStatusBar(node, owner);
    return statusNode;
  }

  function wireStatusOpen(btn) {
    if (!btn?.addEventListener || btn.dataset?.drakeRevealWired === '1') return;
    if (btn.dataset) btn.dataset.drakeRevealWired = '1';
    btn.addEventListener('click', (event) => {
      event.stopPropagation?.();
      event.preventDefault?.();
      openCards();
    });
  }

  function setStatus(phase) {
    statusPhase = phase;
    const node = ensureStatus();
    if (!node) return;
    const visible = enabled && (phase === 'loading' || phase === 'ready') && !open;
    node.hidden = !visible;
    if (node.style) node.style.display = visible ? 'flex' : 'none';
    const loading = phase === 'loading';
    if (statusSpinner) {
      statusSpinner.hidden = !loading || !visible;
      if (statusSpinner.style) statusSpinner.style.display = loading && visible ? 'inline-flex' : 'none';
    }
    if (statusOpenBtn) {
      statusOpenBtn.hidden = loading || !visible;
      if (statusOpenBtn.style) statusOpenBtn.style.display = !loading && visible ? 'inline-flex' : 'none';
    }
    if (statusText) {
      const sideInfo = getShowMapSide() ? readMapSide(currentSession) : null;
      const readyMsg = sideInfo?.label
        ? `Session revealed · ${sideInfo.label} · Press Ctrl+Shift+D to view it.`
        : 'Session revealed. Press Ctrl+Shift+D to view it.';
      statusText.textContent = loading ? 'Revealing lobby' : readyMsg;
    }
    if (visible && phase === 'ready') startReadyDismiss();
    else stopReadyDismiss();
  }

  function renderVisibility() {
    if (!overlay) return;
    if (open && snapshot.length > 0) {
      const showMapSide = getShowMapSide();
      const sig = overlayRenderSig({
        activeTab,
        snapshot,
        currentSession,
        matchupState,
        runeApplyStatus,
        selectedRuneSlot,
        muteStatus,
        showMapSide,
        manualEnemyChampId,
        loadingBuildPlayer,
        currentViewedPlayer,
      });
      if (sig !== lastCardsRenderSig) {
        overlay.innerHTML = renderOverlayShell({
          activeTab,
          snapshot,
          currentSession,
          getChampName: (id) => getChampName(Number(id)),
          getChampions,
          manualEnemyChampId,
          matchupState,
          runeApplyStatus,
          selectedRuneSlot,
          muteStatus,
          showMapSide,
          loadingBuildPlayer,
          currentViewedPlayer,
        });
        lastCardsRenderSig = sig;
      }
      overlay.hidden = false;
      if (overlay.style) overlay.style.display = 'flex';
    } else {
      overlay.hidden = true;
      if (overlay.style) overlay.style.display = 'none';
      open = false;
      lastCardsRenderSig = '';
    }
  }

  function restoreRows() {
    const seen = new Set();
    const restore = (label) => {
      if (!label || seen.has(label)) return;
      seen.add(label);
      if (label.dataset?.[ORIGINAL_NAME_KEY] || label.dataset?.[APPLIED_KEY]) restoreLabel(label);
    };
    for (const label of doc.querySelectorAll?.('[data-drake-reveal-root]') || []) restore(label);
    for (const row of doc.querySelectorAll('[data-cell-id]')) restore(toLabelNode(row));
    for (const label of readLabelNodes(doc)) restore(label);
    boundLabels = new Map();
  }

  function restoreLabel(label) {
    if (stillShowsOurReveal(label)) {
      if (typeof label.innerHTML === 'string') {
        label.innerHTML = label.dataset[ORIGINAL_HTML_KEY] || label.dataset[ORIGINAL_NAME_KEY] || '';
      } else {
        label.textContent = label.dataset[ORIGINAL_NAME_KEY];
      }
      if (label.style) {
        label.style.cssText = label.dataset[ORIGINAL_STYLE_KEY] || '';
      }
    }
    delete label.dataset[ORIGINAL_NAME_KEY];
    delete label.dataset[ORIGINAL_HTML_KEY];
    delete label.dataset[ORIGINAL_STYLE_KEY];
    delete label.dataset[ROOT_KEY];
    label.removeAttribute?.('data-drake-reveal-root');
    delete label.dataset[APPLIED_KEY];
    delete label.dataset[LABEL_SIG_KEY];
  }

  function applyRows(rows) {
    const byCell = new Map(rows.map((row) => [Number(row.cellId), row]));
    const used = new Set();

    for (const row of rows) {
      const key = Number(row?.cellId);
      const bound = boundLabels.get(key);
      if (!bound || bound.isConnected === false) continue;
      applyLabel(bound, row);
      used.add(row);
    }

    for (const row of doc.querySelectorAll('[data-cell-id]')) {
      const label = toLabelNode(row);
      if (!label) continue;
      if (!label.dataset) label.dataset = {};
      const cellId = readCellId(row);
      const info = byCell.get(cellId);
      if (!info?.riotId) continue;
      if (used.has(info)) continue;
      applyLabel(label, info);
      boundLabels.set(cellId, label);
      used.add(info);
    }

    const remaining = rows.filter((row) => !used.has(row) && row?.riotId);

    for (const { row, label } of findLabelsByCurrentNames(doc, remaining)) {
      applyLabel(label, row);
      boundLabels.set(Number(row.cellId), label);
      used.add(row);
    }

    const unmatched = remaining.filter((row) => !used.has(row));
    if (!unmatched.length) {
      syncChat();
      return;
    }

    const labels = readLabelNodes(doc).filter((label) => {
      if (!label?.dataset) label.dataset = {};
      return !label.dataset[APPLIED_KEY];
    });
    const count = Math.min(unmatched.length, labels.length);
    for (let index = 0; index < count; index += 1) {
      const label = labels[index];
      const info = unmatched[index];
      applyLabel(label, info);
      boundLabels.set(Number(info.cellId), label);
    }
    syncChat();
  }

  function syncChat() {
    chat.setEntries(collectRevealChatPairs(boundLabels, snapshot, ORIGINAL_NAME_KEY));
  }

  function closeCards() {
    open = false;
    renderVisibility();
    setStatus(statusPhase === 'loading' ? 'loading' : snapshot.length ? 'ready' : 'hidden');
  }

  function openCards() {
    if (!enabled || !snapshot.length) return;
    ensureOverlay();
    open = true;
    if (activeTab === 'matchup') ensureMatchupData();
    if (needsReapply()) applyRows(snapshot);
    renderVisibility();
    setStatus('ready');
  }

  async function handleSession(session) {
    if (!enabled) return;
    if (!isLiveRevealSession(session)) {
      clearReveal();
      return;
    }

    scrubStaleRows();
    currentSession = session;

    const lobbyKey = readLobbyKey(session);
    const team = teamFingerprint(session);
    const newLobby = Boolean(lobbyKey && lastLobbyKey && lobbyKey !== lastLobbyKey);
    if (newLobby) {
      clearReveal();
      pendingScrub = false;
    }

    const currentLobbyId = lobbyKey || sessionSignature(session);
    if (getAutoMute() && lcu && currentLobbyId && autoMutedLobbyKey !== currentLobbyId) {
      autoMutedLobbyKey = currentLobbyId;
      void muteTeammatesImpl(lcu, session)
        .then((res) => {
          if (res?.success) {
            muteStatus = 'muted';
            lastCardsRenderSig = '';
            if (open) renderVisibility();
          }
        })
        .catch(() => {});
    }

    const autoMessage = typeof getAutoMessage === 'function' ? String(getAutoMessage() || '').trim() : '';
    if (autoMessage && lcu && currentLobbyId && lastAutoMessageLobbyKey !== currentLobbyId) {
      lastAutoMessageLobbyKey = currentLobbyId;
      void sendChampSelectMessageImpl(lcu, session, autoMessage).catch(() => {});
    }

    if (snapshot.length && lastTeam.length && sameTeamIdentity(lastTeam, team)) {
      mergeRowsByCell(session);
      applyPickRefresh(session);
      if (needsReapply()) applyRows(snapshot);
      if (open && activeTab === 'matchup') ensureMatchupData();
      if (open) renderVisibility();
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      lastSessionSig = sessionSignature(session);
      return;
    } else if (snapshot.length && applyRemappedSnapshot(session)) {
      applyPickRefresh(session);
      if (needsReapply()) applyRows(snapshot);
      if (open && activeTab === 'matchup') ensureMatchupData();
      if (open) renderVisibility();
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      lastSessionSig = sessionSignature(session);
      return;
    }

    if (lobbyKey) lastLobbyKey = lobbyKey;
    lastTeam = team;

    const sig = sessionSignature(session);
    if (sig && sig === lastSessionSig) {
      mergeRowsByCell(session);
      if (snapshot.length && needsReapply()) applyRows(snapshot);
      if (open && activeTab === 'matchup') ensureMatchupData();
      if (open) renderVisibility();
      return;
    }

    stopRevealLoad();
    lastSessionSig = sig;
    const gen = loadGen;
    loadAbort = typeof AbortController === 'function' ? new AbortController() : null;
    const startedAt = Date.now();
    try {
      setStatus('loading');
      const next = await loadSnapshot(session, {
        signal: loadAbort?.signal,
        onProgress(rows) {
          if (gen !== loadGen) return;
          snapshot = Array.isArray(rows) ? rows : [];
          mergeRowsByCell(session);
          applyRows(snapshot);
          if (open && activeTab === 'matchup') ensureMatchupData();
          if (open) renderVisibility();
        },
      });
      if (gen !== loadGen) return;
      snapshot = Array.isArray(next) ? next : [];
      mergeRowsByCell(session);
      applyPickRefresh(session);
      setStatus(snapshot.length ? 'ready' : 'hidden');
      if (snapshot.length) applyRows(snapshot);
      if (open && activeTab === 'matchup') ensureMatchupData();
      if (open) renderVisibility();
      if (typeof onRevealTiming === 'function' && snapshot.length) {
        onRevealTiming({
          durationMs: Date.now() - startedAt,
          teamSize: snapshot.length,
        });
      }
    } catch {
      if (gen !== loadGen) return;
      setStatus(snapshot.length ? 'ready' : 'hidden');
    }
  }

  function setEnabled(next) {
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      if (!stopPhase) {
        stopPhase = subscribe(GAMEFLOW_PHASE_ROUTE, (phase) => {
          handlePhase(phase);
        });
      }
      return;
    }
    if (stopSession) {
      stopSession();
      stopSession = null;
    }
    if (stopPhase) {
      stopPhase();
      stopPhase = null;
    }
    lastPhase = '';
    clearReveal();
  }

  function toggleCards() {
    if (!enabled) return;
    if (open) {
      closeCards();
      return;
    }
    openCards();
  }

  function teardown() {
    setEnabled(false);
    if (overlay?.remove) overlay.remove();
    if (statusNode?.remove) statusNode.remove();
    overlay = null;
    statusNode = null;
    statusSpinner = null;
    statusText = null;
    statusOpenBtn = null;
    stopReadyDismiss();
    statusBar = null;
  }

  return {
    setEnabled,
    handleSession,
    toggleCards,
    closeCards,
    openCards,
    teardown,
  };
}
