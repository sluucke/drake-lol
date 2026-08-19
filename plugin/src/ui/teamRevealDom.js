import { GAMEFLOW_PHASE_ROUTE } from '../features/dodge.js';
import { readGameflowPhase } from '../features/inGameIdle.js';
import { formatWl, formatWlPair, readAssignedPosition, readLobbyKey } from '../features/teamRevealStats.js';
import { iconUrl } from '../features/champions.js';
import { roleIconUrl, roleLabel } from './roleIcons.js';
import { RANK_ICONS } from './assets.js';

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

function makeRenderCards(getChampName) {
  return function renderCards(snapshot) {
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
            ${formatCardRow('Season Main', renderSeasonMain(row, getChampName))}
            ${formatCardRow('Last 5', renderRecentGames(row, getChampName))}
          </div>
        </section>`;
      })
      .join('');
    return `<div class="team-reveal-shell" data-team-reveal-panel="1">
      <button class="team-reveal-close" type="button" data-team-reveal-close="1" aria-label="Close">Close</button>
      <div class="team-reveal-panel">${cards}</div>
    </div>`;
  };
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

/// Pairs each row with the label showing that player's name. Returning the pair
/// matters: a row that matches nothing must not shift the rows after it onto
/// somebody else's label.
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
  getChampName = () => '',
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  statusReadyMs = STATUS_READY_MS,
}) {
  const renderCards = makeRenderCards((id) => getChampName(Number(id)));
  let enabled = false;
  let stopSession = null;
  let snapshot = [];
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
  let loadGen = 0;
  let loadAbort = null;
  let stopPhase = null;

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
    snapshot = [];
    lastSessionSig = '';
    lastLobbyKey = '';
    lastTeam = [];
    lastCardsRenderSig = '';
    open = false;
    renderVisibility();
    setStatus('hidden');
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
    // Leaving champ select can restore nothing, because the client has often
    // already pulled the rows out of the document by then, and it reuses those
    // same nodes next time. Anything still marked belongs to the last match.
    if (previous && previous !== 'ChampSelect') restoreRows();
  }

  function needsReapply() {
    if (!snapshot.length) return false;
    if (boundLabels.size === 0) return true;
    for (const label of boundLabels.values()) {
      if (label.isConnected === false) return true;
    }
    return false;
  }

  function mergePositionsFromSession(session) {
    if (!snapshot.length) return false;
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    const byCell = new Map(team.map((player) => [Number(player?.cellId), readAssignedPosition(player)]));
    let changed = false;
    snapshot = snapshot.map((row) => {
      const next = byCell.has(Number(row.cellId)) ? byCell.get(Number(row.cellId)) : row.assignedPosition || '';
      if (next === (row.assignedPosition || '')) return row;
      changed = true;
      return { ...row, assignedPosition: next };
    });
    if (changed) lastCardsRenderSig = '';
    return changed;
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
      if (left.summonerId && right.summonerId && left.summonerId !== right.summonerId) return false;
      if (left.puuid && right.puuid && left.puuid !== right.puuid) return false;
      if (left.obf && right.obf && left.obf !== right.obf) return false;
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

  function wireOverlayEvents(node) {
    if (!node?.addEventListener || node.dataset?.drakeRevealWired === '1') return;
    if (node.dataset) node.dataset.drakeRevealWired = '1';
    node.addEventListener('click', (event) => {
      const target = event.target;
      if (target?.closest?.('[data-team-reveal-close="1"]')) {
        event.stopPropagation?.();
        closeCards();
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
      statusText.textContent = loading
        ? 'Revealing lobby'
        : 'Session revealed. Press Ctrl+Shift+D to view it.';
    }
    if (visible && phase === 'ready') startReadyDismiss();
    else stopReadyDismiss();
  }

  function renderVisibility() {
    if (!overlay) return;
    if (open && snapshot.length > 0) {
      const sig = cardsContentSig(snapshot);
      if (sig !== lastCardsRenderSig) {
        overlay.innerHTML = renderCards(snapshot);
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
    if (typeof label.innerHTML === 'string') {
      label.innerHTML = label.dataset[ORIGINAL_HTML_KEY] || label.dataset[ORIGINAL_NAME_KEY] || '';
    } else {
      label.textContent = label.dataset[ORIGINAL_NAME_KEY];
    }
    if (label.style) {
      label.style.cssText = label.dataset[ORIGINAL_STYLE_KEY] || '';
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

    // The player's own name is the only reliable way to tell which label is
    // theirs. Document order is not: the enemy rows come first, so falling back
    // to it too eagerly wrote the ally names onto the enemy team.
    for (const { row, label } of findLabelsByCurrentNames(doc, remaining)) {
      applyLabel(label, row);
      boundLabels.set(Number(row.cellId), label);
      used.add(row);
    }

    const unmatched = remaining.filter((row) => !used.has(row));
    if (!unmatched.length) return;

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

    const lobbyKey = readLobbyKey(session);
    const team = teamFingerprint(session);
    const newLobby = Boolean(lobbyKey && lastLobbyKey && lobbyKey !== lastLobbyKey);
    if (newLobby) clearReveal();
    else if (lastSessionSig && sameTeamIdentity(lastTeam, team)) {
      mergePositionsFromSession(session);
      if (snapshot.length && needsReapply()) applyRows(snapshot);
      if (open) renderVisibility();
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      return;
    }

    if (lobbyKey) lastLobbyKey = lobbyKey;
    lastTeam = team;

    const sig = sessionSignature(session);
    if (sig && sig === lastSessionSig) {
      mergePositionsFromSession(session);
      if (snapshot.length && needsReapply()) applyRows(snapshot);
      if (open) renderVisibility();
      return;
    }

    stopRevealLoad();
    lastSessionSig = sig;
    const gen = loadGen;
    loadAbort = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      setStatus('loading');
      const next = await loadSnapshot(session, {
        signal: loadAbort?.signal,
        onProgress(rows) {
          if (gen !== loadGen) return;
          snapshot = Array.isArray(rows) ? rows : [];
          applyRows(snapshot);
          if (open) renderVisibility();
        },
      });
      if (gen !== loadGen) return;
      snapshot = Array.isArray(next) ? next : [];
      setStatus(snapshot.length ? 'ready' : 'hidden');
      if (snapshot.length) applyRows(snapshot);
      if (open) renderVisibility();
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
