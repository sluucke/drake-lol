import { OPGG_TIERS, OPGG_REGIONS } from '../features/opggApi.js';
import { itemIconUrl, itemName, spellIconUrl, spellName } from '../features/gameAssets.js';
import { perkIconUrl, perkName, perkStyleIconUrl, perkStyleName } from '../features/runes.js';
import { iconUrl } from '../features/champions.js';
import { roleIconUrl, roleLabel } from './roleIcons.js';
import { RANK_ICONS } from './assets.js';

const SPINNER = `<svg class="build-spinner" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="26" stroke-dashoffset="8"/></svg>`;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return `${Number.isInteger(num) ? num : Math.round(num * 10) / 10}%`;
}

function wrClass(winRate) {
  if (winRate === null || winRate === undefined || Number.isNaN(Number(winRate))) return 'build-wr';
  const num = Number(winRate);
  if (num >= 50) return 'build-wr is-positive';
  return 'build-wr is-negative';
}

function formatGames(count) {
  if (!count && count !== 0) return '';
  const num = Number(count);
  if (!Number.isFinite(num) || num <= 0) return '';
  return ` (${num.toLocaleString()})`;
}

function tierToRankIconKey(tierKey) {
  const raw = String(tierKey || '').trim().toLowerCase();
  if (raw.includes('challenger')) return 'CHALLENGER';
  if (raw.includes('grandmaster')) return 'GRANDMASTER';
  if (raw.includes('master')) return 'MASTER';
  if (raw.includes('diamond')) return 'DIAMOND';
  if (raw.includes('emerald')) return 'EMERALD';
  if (raw.includes('platinum')) return 'PLATINUM';
  if (raw.includes('gold')) return 'GOLD';
  if (raw.includes('silver')) return 'SILVER';
  if (raw.includes('bronze')) return 'BRONZE';
  if (raw.includes('iron')) return 'IRON';
  return 'UNRANKED';
}

function statusLabel(status, idle, done) {
  if (status === 'applying') return 'Applying…';
  if (status === 'applied') return done;
  if (status === 'failed') return 'Failed — retry';
  return idle;
}

function itemIcon(id, isHextech = false) {
  return `<span class="build-item ${isHextech ? 'hextech-item' : ''}" title="${esc(itemName(id))}"><img class="build-item-icon ${isHextech ? 'hextech-icon' : ''}" src="${esc(itemIconUrl(id))}" alt="${esc(itemName(id))}"></span>`;
}

function dropdownOptionHtml(value, label, selected) {
  return `<lol-uikit-dropdown-option slot="lol-uikit-dropdown-option" value="${esc(value)}" class="framed-dropdown-type"${selected ? ' selected' : ''}>${esc(label)}</lol-uikit-dropdown-option>`;
}

export function renderPanelHeader(state) {
  // The dropdown's collapsed header is rendered by the client's own shadow DOM;
  // putting an <img> inside the option breaks its height there (only the
  // text-only Region dropdown renders correctly), so the rank icon is shown as
  // a plain sibling element instead of inside the option.
  const tierOptions = OPGG_TIERS.map((tier) =>
    dropdownOptionHtml(tier.value, tier.label, tier.value === state.tier)
  ).join('');

  const regionOptions = OPGG_REGIONS.map((region) =>
    dropdownOptionHtml(region.value, region.label, region.value === state.region)
  ).join('');

  const selectedTierIcon = RANK_ICONS[tierToRankIconKey(state.tier)] || RANK_ICONS.UNRANKED;

  const stats = state.build?.stats;
  const statsHtml = stats
    ? `<div class="build-stats">
        <span class="build-stat"><b class="${wrClass(stats.winRate)}">${pct(stats.winRate)}</b> Win</span>
        <span class="build-stat"><b>${pct(stats.pickRate)}</b> Pick</span>
        <span class="build-stat"><b>${pct(stats.banRate)}</b> Ban</span>
        <span class="build-stat"><b>${esc(stats.kda ?? '—')}</b> KDA</span>
        <span class="build-stat"><b>${esc(stats.play?.toLocaleString?.() || stats.play || 0)}</b> Games</span>
      </div>`
    : '';

  const role = state.position ? `<span class="build-role">${roleIconUrl(state.position) ? `<img class="build-role-icon" src="${esc(roleIconUrl(state.position))}" alt="">` : ''}<span>${esc(roleLabel(state.position) || state.position)}</span></span>` : '';

  return `<header class="build-header">
    <div class="build-identity">
      ${state.championId ? `<img class="build-champ-icon" src="${esc(iconUrl(state.championId))}" alt="${esc(state.championName)}">` : ''}
      <div class="build-identity-meta">
        <div class="build-champ-name">${esc(state.championName || 'Champion')}</div>
        <div class="build-identity-sub">${role}<span class="build-mode-tag">${state.mode === 'aram' ? 'ARAM' : 'Ranked'}</span>${state.patch ? `<span class="build-patch">Patch ${esc(state.patch)}</span>` : ''}</div>
      </div>
    </div>
    <div class="build-filters">
      <label class="build-filter"><span>Rank</span>
        <div class="build-select-wrap">
          <img class="build-filter-rank-icon" src="${selectedTierIcon}" alt="">
          <lol-uikit-framed-dropdown class="build-hextech-dropdown" data-build-tier tabindex="0">${tierOptions}</lol-uikit-framed-dropdown>
        </div>
      </label>
      <label class="build-filter"><span>Region</span>
        <lol-uikit-framed-dropdown class="build-hextech-dropdown" data-build-region tabindex="0">${regionOptions}</lol-uikit-framed-dropdown>
      </label>
    </div>
    ${statsHtml}
    <button class="build-close" type="button" data-build-close aria-label="Close">×</button>
  </header>`;
}

function itemPhaseRow(label, entry) {
  if (!entry) return '';
  return `<div class="build-item-phase">
    <span class="build-item-phase-label">${esc(label)}</span>
    <div class="build-icons">${entry.ids.map((id) => itemIcon(id)).join('<span class="build-arrow">›</span>')}</div>
    <span class="build-row-stats">
      <span class="${wrClass(entry.winRate)}">${pct(entry.winRate)} WR</span>
      <span class="build-pr">${pct(entry.pickRate)}${formatGames(entry.play)}</span>
    </span>
  </div>`;
}

function coreItemRows(core) {
  return core
    .map(
      (entry, index) => `<div class="build-row ${index === 0 ? 'hextech-highlight' : ''}">
        <div class="build-row-lead">
          <span class="build-row-num ${index === 0 ? 'hextech-badge' : ''}">${index + 1}.</span>
          <div class="build-icons">${entry.ids.map((id, itemIdx) => itemIcon(id, index === 0 && itemIdx === 0)).join('<span class="build-arrow">›</span>')}</div>
        </div>
        <div class="build-row-stats">
          <span class="${wrClass(entry.winRate)}">${pct(entry.winRate)} WR</span>
          <span class="build-pr">${pct(entry.pickRate)}${formatGames(entry.play)}</span>
          <span class="build-bar"><i style="width:${Math.min(100, Number(entry.pickRate) || 0)}%"></i></span>
        </div>
      </div>`
    )
    .join('');
}

function situationalItemsRow(last) {
  if (!last.length) return '';
  const cells = last
    .map(
      (entry) => `<div class="build-trend-cell">
        <span class="build-trend-rate">${pct(entry.pickRate)}</span>
        ${entry.ids.slice(0, 1).map((id) => itemIcon(id)).join('')}
      </div>`
    )
    .join('');
  return `<div class="build-item-phase build-item-phase-situational">
    <span class="build-item-phase-label">Situational</span>
    <div class="build-trend">${cells}</div>
  </div>`;
}

export function renderItemsCard(state) {
  const items = state.build?.items || {};
  const core = items.core || [];
  const applying = state.itemSetStatus === 'applying';

  const body = [
    itemPhaseRow('Starter', items.starter?.[0]),
    itemPhaseRow('Boots', items.boots?.[0]),
    core.length
      ? `<div class="build-item-phase-label build-item-phase-label-core">Core</div>${coreItemRows(core)}`
      : '',
    situationalItemsRow(items.last || []),
  ]
    .filter(Boolean)
    .join('');

  return `<section class="build-card build-items-card">
    <div class="build-card-title">
      <span>Items</span>
      <button class="build-action" type="button" data-build-apply-items${applying ? ' disabled' : ''}>${esc(
        statusLabel(state.itemSetStatus, 'Create Item Set', 'Applied')
      )}</button>
    </div>
    ${body || '<div class="build-empty">No item data</div>'}
  </section>`;
}

export function renderRunesCard(state) {
  const pages = state.build?.runePages || [];
  if (!pages.length) {
    return `<section class="build-card build-runes-card">
      <div class="build-card-title"><span>Runes</span></div>
      <div class="build-empty">No rune data</div>
    </section>`;
  }

  const applying = state.runeStatus === 'applying';

  const rows = pages
    .map((page, index) => {
      const shards = page.selectedPerkIds.filter((id) => id >= 5000 && id < 6000);
      const perks = page.selectedPerkIds.filter((id) => id < 5000 || id >= 6000);
      const keystone = perks[0];
      const primaryMinors = perks.slice(1, 4);
      const secondaryMinors = perks.slice(4);

      const primaryMinorIcons = primaryMinors
        .map(
          (id) =>
            `<img class="build-perk-icon" src="${esc(perkIconUrl(id))}" alt="${esc(perkName(id))}" title="${esc(perkName(id))}">`
        )
        .join('');

      const secondaryMinorIcons = secondaryMinors
        .map(
          (id) =>
            `<img class="build-perk-icon" src="${esc(perkIconUrl(id))}" alt="${esc(perkName(id))}" title="${esc(perkName(id))}">`
        )
        .join('');

      const shardIcons = shards
        .map(
          (id) =>
            `<img class="build-shard-icon" src="${esc(perkIconUrl(id))}" alt="${esc(perkName(id))}" title="${esc(perkName(id))}">`
        )
        .join('');

      return `<div class="build-row build-rune-row">
        <div class="build-rune-top-line">
          <div class="build-row-lead">
            <span class="build-row-num">${index + 1}.</span>
            <div class="build-rune-strip">
              <div class="build-rune-tree-group">
                <img class="build-style-icon" src="${esc(perkStyleIconUrl(page.primaryStyleId))}" alt="${esc(perkStyleName(page.primaryStyleId))}" title="${esc(perkStyleName(page.primaryStyleId))}">
                <img class="build-keystone-icon" src="${esc(perkIconUrl(keystone))}" alt="${esc(perkName(keystone))}" title="${esc(perkName(keystone))}">
                ${primaryMinorIcons}
              </div>
              <span class="build-rune-divider"></span>
              <div class="build-rune-tree-group">
                <img class="build-style-icon secondary" src="${esc(perkStyleIconUrl(page.subStyleId))}" alt="${esc(perkStyleName(page.subStyleId))}" title="${esc(perkStyleName(page.subStyleId))}">
                ${secondaryMinorIcons}
              </div>
            </div>
          </div>
        </div>
        <div class="build-rune-bottom-line">
          <div class="build-rune-shards-group">
            ${shardIcons}
          </div>
          <div class="build-row-stats">
            <span class="${wrClass(page.winRate)}">${pct(page.winRate)} WR</span>
            <span class="build-pr">${pct(page.pickRate)}${formatGames(page.play)}</span>
            <button class="build-action" type="button" data-build-apply-runes="${index}"${applying ? ' disabled' : ''}>${esc(
              statusLabel(state.runeStatus, 'Apply', 'Applied')
            )}</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  return `<section class="build-card build-runes-card">
    <div class="build-card-title"><span>Runes</span></div>
    ${rows}
  </section>`;
}

export function renderSpellsCard(state) {
  const spells = state.build?.spells || [];
  const applying = state.spellStatus === 'applying';

  const rows = spells
    .map(
      (entry, index) => `<div class="build-row">
        <div class="build-row-lead">
          <span class="build-row-num">${index + 1}.</span>
          <div class="build-icons">${entry.ids
            .map(
              (id) =>
                `<img class="build-spell-icon" src="${esc(spellIconUrl(id))}" alt="${esc(spellName(id))}" title="${esc(spellName(id))}">`
            )
            .join('')}</div>
        </div>
        <div class="build-row-stats">
          <span class="${wrClass(entry.winRate)}">${pct(entry.winRate)} WR</span>
          <span class="build-pr">${pct(entry.pickRate)}${formatGames(entry.play)}</span>
          <button class="build-action" type="button" data-build-apply-spells="${index}"${applying ? ' disabled' : ''}>${esc(
            statusLabel(state.spellStatus, 'Apply', 'Applied')
          )}</button>
        </div>
      </div>`
    )
    .join('');

  return `<section class="build-card build-spells-card">
    <div class="build-card-title"><span>Summoner Spells</span></div>
    ${rows || '<div class="build-empty">No spell data</div>'}
  </section>`;
}

export function renderSkillOrder(state) {
  const skills = state.build?.skills;
  if (!skills?.order?.length && !skills?.masteries?.length) return '';

  const order = skills.order || [];
  const keys = ['Q', 'W', 'E', 'R'];
  const totalSteps = 15;

  const rows = keys
    .map((key) => {
      const cells = [];
      for (let level = 1; level <= totalSteps; level++) {
        const stepSkill = order[level - 1];
        const isActive = stepSkill === key;
        cells.push(
          `<td class="build-skill-grid-cell ${isActive ? 'is-active' : ''}">${isActive ? level : ''}</td>`
        );
      }
      return `<tr>
        <th class="build-skill-key-th"><span class="build-skill-key-badge">${key}</span></th>
        ${cells.join('')}
      </tr>`;
    })
    .join('');

  const statsNote = skills.winRate != null || skills.play
    ? `<div class="build-skill-stats-note">
        ${skills.winRate != null ? `<span class="${wrClass(skills.winRate)}"><b>${pct(skills.winRate)}</b> Win Rate</span>` : ''}
        ${skills.play ? `<span class="build-skill-games"><b>${skills.play.toLocaleString()}</b> Games</span>` : ''}
      </div>`
    : '';

  return `<section class="build-card build-skills-card">
    <div class="build-card-title"><span>Skill Order</span></div>
    <div class="build-skill-table-wrap">
      <table class="build-skill-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${statsNote}
  </section>`;
}

function counterList(entries, getChampName, className) {
  if (!entries.length) return `<div class="build-empty">No data</div>`;
  return entries
    .map(
      (entry) => `<div class="build-counter ${className}">
        <img class="build-counter-icon" src="${esc(iconUrl(entry.championId))}" alt="">
        <span class="build-counter-name">${esc(getChampName(entry.championId))}</span>
        <span class="${wrClass(entry.winRate)}">${pct(entry.winRate)}</span>
        <span class="build-counter-play">${esc(entry.play?.toLocaleString?.() || entry.play)}</span>
      </div>`
    )
    .join('');
}

export function renderCounters(state) {
  if (state.mode === 'aram') return '';
  const counters = state.build?.counters;
  if (!counters) return '';

  const getChampName = state.getChampName || ((id) => `Champion ${id}`);

  return `<section class="build-card build-counters-card">
    <div class="build-card-title"><span>Matchups</span></div>
    <div class="build-counters">
      <div class="build-counter-col">
        <div class="build-counter-head is-strong">Strong Against</div>
        ${counterList(counters.strong || [], getChampName, 'is-strong')}
      </div>
      <div class="build-counter-col">
        <div class="build-counter-head is-weak">Weak Against</div>
        ${counterList(counters.weak || [], getChampName, 'is-weak')}
      </div>
    </div>
  </section>`;
}

export function renderTopPlayers(state) {
  const top = state.topPlayers || { loading: false, ok: false, players: [], reason: '' };

  let body;
  if (top.loading) {
    body = `<div class="build-loading">${SPINNER} <span>Loading players…</span></div>`;
  } else if (!top.ok || !top.players?.length) {
    body = `<div class="build-empty">${esc(top.reason || 'Unavailable')}</div>`;
  } else {
    const rows = top.players
      .map((player) => {
        const rankKey = tierToRankIconKey(player.tier);
        const iconSrc = RANK_ICONS[rankKey] || RANK_ICONS.UNRANKED;
        const games = player.played?.toLocaleString?.() || player.played || '—';
        return `<button class="build-toplist-row" type="button" data-build-player="${esc(player.name)}" data-build-player-region="${esc(player.region || 'kr')}" title="${esc(player.tier || '')} · ${esc(games)} games">
          <span class="build-toplist-rank">#${esc(player.ranking ?? '—')}</span>
          <img class="build-toplist-tier-icon" src="${iconSrc}" alt="">
          <span class="build-toplist-name">${esc(player.name || 'Unknown')}</span>
          <span class="${wrClass(player.winRate)}">${player.winRate != null ? pct(player.winRate) : '—'}</span>
        </button>`;
      })
      .join('');
    body = `<div class="build-toplist">${rows}</div>`;
  }

  return `<section class="build-card build-players-card">
    <div class="build-card-title"><span>Top Players (OP.GG)</span></div>
    ${body}
  </section>`;
}

export function renderBuildPanel(state) {
  const viewingToast = state.viewingPlayer
    ? `<div class="build-viewing-toast" data-build-viewing-toast>
        <span class="build-viewing-toast-icon">👁</span>
        <span class="build-viewing-toast-text">Viewing player build: <b>${esc(state.viewingPlayer)}</b></span>
        <button class="build-viewing-toast-close" type="button" data-build-clear-player title="Restore default build">✕ Restore core build</button>
      </div>`
    : '';

  if (!state.championId) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      ${viewingToast}
      <div class="build-placeholder">Pick a champion to see build recommendations</div>
    </div>`;
  }

  if (state.loading) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      ${viewingToast}
      <div class="build-placeholder">${SPINNER} <span>Loading build data…</span></div>
    </div>`;
  }

  if (state.error) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      ${viewingToast}
      <div class="build-placeholder is-error">
        <span>${esc(state.error)}</span>
        <button class="build-action" type="button" data-build-retry>Retry</button>
      </div>
    </div>`;
  }

  if (!state.build?.hasData) {
    const tierLabel = OPGG_TIERS.find((t) => t.value === state.tier)?.label || state.tier;
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      ${viewingToast}
      <div class="build-placeholder">
        <span>No data for ${esc(tierLabel)}</span>
        <button class="build-action" type="button" data-build-tier-all>See All Ranks</button>
      </div>
    </div>`;
  }

  return `<div class="build-panel">
    ${renderPanelHeader(state)}
    ${viewingToast}
    <div class="build-body">
      <aside class="build-sidebar">
        ${renderTopPlayers(state)}
        ${renderCounters(state)}
      </aside>
      <div class="build-main">
        <div class="build-main-col">
          ${renderRunesCard(state)}
          ${renderItemsCard(state)}
        </div>
        <div class="build-main-col">
          ${renderSkillOrder(state)}
          ${renderSpellsCard(state)}
        </div>
      </div>
    </div>
  </div>`;
}
