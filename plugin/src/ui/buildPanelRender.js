import { OPGG_TIERS, OPGG_REGIONS } from '../features/opggApi.js';
import { itemIconUrl, itemName, spellIconUrl, spellName } from '../features/gameAssets.js';
import { perkIconUrl, perkName, perkStyleIconUrl, perkStyleName } from '../features/runes.js';
import { iconUrl } from '../features/champions.js';
import { roleIconUrl, roleLabel } from './roleIcons.js';

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

function statusLabel(status, idle, done) {
  if (status === 'applying') return 'Applying…';
  if (status === 'applied') return done;
  if (status === 'failed') return 'Failed — retry';
  return idle;
}

function itemIcon(id) {
  return `<span class="build-item" title="${esc(itemName(id))}"><img class="build-item-icon" src="${esc(itemIconUrl(id))}" alt="${esc(itemName(id))}"></span>`;
}

export function renderPanelHeader(state) {
  const tierOptions = OPGG_TIERS.map(
    (tier) =>
      `<option value="${tier.value}"${tier.value === state.tier ? ' selected' : ''}>${esc(tier.label)}</option>`
  ).join('');

  const regionOptions = OPGG_REGIONS.map(
    (region) =>
      `<option value="${region.value}"${region.value === state.region ? ' selected' : ''}>${esc(region.label)}</option>`
  ).join('');

  const stats = state.build?.stats;
  const statsHtml = stats
    ? `<div class="build-stats">
        <span class="build-stat"><b>${pct(stats.winRate)}</b> Win</span>
        <span class="build-stat"><b>${pct(stats.pickRate)}</b> Pick</span>
        <span class="build-stat"><b>${pct(stats.banRate)}</b> Ban</span>
        <span class="build-stat"><b>${esc(stats.kda ?? '—')}</b> KDA</span>
        <span class="build-stat"><b>${esc(stats.play?.toLocaleString?.() || stats.play || 0)}</b> Games</span>
      </div>`
    : '';

  const role = state.position ? `<span class="build-role">${roleIconUrl(state.position) ? `<img src="${esc(roleIconUrl(state.position))}" alt="">` : ''}${esc(roleLabel(state.position) || state.position)}</span>` : '';

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
        <select data-build-tier>${tierOptions}</select>
      </label>
      <label class="build-filter"><span>Region</span>
        <select data-build-region>${regionOptions}</select>
      </label>
    </div>
    ${statsHtml}
    <button class="build-close" type="button" data-build-close aria-label="Close">×</button>
  </header>`;
}

export function renderItemsCard(state) {
  const core = state.build?.items?.core || [];
  const rows = core
    .map(
      (entry) => `<div class="build-row">
        <div class="build-icons">${entry.ids.map(itemIcon).join('<span class="build-arrow">›</span>')}</div>
        <div class="build-row-stats">
          <span class="build-wr">${pct(entry.winRate)} WR</span>
          <span class="build-pr">${pct(entry.pickRate)}</span>
          <span class="build-bar"><i style="width:${Math.min(100, Number(entry.pickRate) || 0)}%"></i></span>
        </div>
      </div>`
    )
    .join('');

  const applying = state.itemSetStatus === 'applying';

  return `<section class="build-card build-items-card">
    <div class="build-card-title">
      <span>Core Items</span>
      <button class="build-action" type="button" data-build-apply-items${applying ? ' disabled' : ''}>${esc(
        statusLabel(state.itemSetStatus, 'Create Item Set', 'Applied')
      )}</button>
    </div>
    ${rows || '<div class="build-empty">No item data</div>'}
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

      const perkIcons = perks
        .slice(1)
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
        <div class="build-rune-styles">
          <img class="build-style-icon" src="${esc(perkStyleIconUrl(page.primaryStyleId))}" alt="${esc(perkStyleName(page.primaryStyleId))}" title="${esc(perkStyleName(page.primaryStyleId))}">
          <img class="build-keystone-icon" src="${esc(perkIconUrl(keystone))}" alt="${esc(perkName(keystone))}" title="${esc(perkName(keystone))}">
          <span class="build-perks">${perkIcons}</span>
          <img class="build-style-icon secondary" src="${esc(perkStyleIconUrl(page.subStyleId))}" alt="${esc(perkStyleName(page.subStyleId))}" title="${esc(perkStyleName(page.subStyleId))}">
          <span class="build-shards">${shardIcons}</span>
        </div>
        <div class="build-row-stats">
          <span class="build-wr">${pct(page.winRate)} WR</span>
          <span class="build-pr">${pct(page.pickRate)}</span>
          <button class="build-action" type="button" data-build-apply-runes="${index}"${applying ? ' disabled' : ''}>${esc(
            statusLabel(state.runeStatus, 'Apply', 'Applied')
          )}</button>
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
        <div class="build-icons">${entry.ids
          .map(
            (id) =>
              `<img class="build-spell-icon" src="${esc(spellIconUrl(id))}" alt="${esc(spellName(id))}" title="${esc(spellName(id))}">`
          )
          .join('')}</div>
        <div class="build-row-stats">
          <span class="build-wr">${pct(entry.winRate)} WR</span>
          <span class="build-pr">${pct(entry.pickRate)}</span>
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

export function renderItemTrend(state) {
  const last = state.build?.items?.last || [];
  if (!last.length) return '';
  const cells = last
    .map(
      (entry) => `<div class="build-trend-cell">
        <span class="build-trend-rate">${pct(entry.pickRate)}</span>
        ${entry.ids.slice(0, 1).map(itemIcon).join('')}
      </div>`
    )
    .join('');
  return `<section class="build-card build-trend-card">
    <div class="build-card-title"><span>Item Trend</span></div>
    <div class="build-trend">${cells}</div>
  </section>`;
}

export function renderSkillOrder(state) {
  const skills = state.build?.skills;
  if (!skills?.masteries?.length) return '';

  const priority = skills.masteries
    .map((s) => `<span class="build-skill">${esc(s)}</span>`)
    .join('<span class="build-arrow">›</span>');

  const order = skills.order
    .map((s, i) => `<span class="build-skill-step" title="Level ${i + 1}">${esc(s)}</span>`)
    .join('');

  return `<section class="build-card build-skills-card">
    <div class="build-card-title"><span>Skill Order</span></div>
    <div class="build-skill-priority">${priority}</div>
    <div class="build-skill-order">${order}</div>
  </section>`;
}

function counterList(entries, getChampName, className) {
  if (!entries.length) return `<div class="build-empty">No data</div>`;
  return entries
    .map(
      (entry) => `<div class="build-counter ${className}">
        <img class="build-counter-icon" src="${esc(iconUrl(entry.championId))}" alt="">
        <span class="build-counter-name">${esc(getChampName(entry.championId))}</span>
        <span class="build-counter-wr">${pct(entry.winRate)}</span>
        <span class="build-counter-play">${esc(entry.play)}</span>
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

  const viewingChip = state.viewingPlayer
    ? `<div class="build-viewing-chip">Viewing ${esc(state.viewingPlayer)}'s build
        <button class="build-action" type="button" data-build-clear-player>Back to average</button>
      </div>`
    : '';

  let body;
  if (top.loading) {
    body = `<div class="build-loading">${SPINNER} <span>Loading players…</span></div>`;
  } else if (!top.ok || !top.players?.length) {
    body = `<div class="build-empty">${esc(top.reason || 'Unavailable')}</div>`;
  } else {
    const rows = top.players
      .map(
        (player) => `<tr>
          <td>#${esc(player.ranking ?? '—')}</td>
          <td>${esc(player.name || 'Unknown')}</td>
          <td>${esc(player.tier || '—')}</td>
          <td>${player.winRate != null ? pct(player.winRate) : '—'}</td>
          <td>${esc(player.played ?? '—')}</td>
          <td><button class="build-action" type="button" data-build-player="${esc(player.name)}" data-build-player-region="${esc(player.region || 'kr')}">View Build</button></td>
        </tr>`
      )
      .join('');
    body = `<table class="build-players">
      <thead><tr><th>#</th><th>Player</th><th>Rank</th><th>Win Rate</th><th>Games</th><th>Build</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return `<section class="build-card build-players-card">
    <div class="build-card-title"><span>Top Players</span></div>
    ${viewingChip}
    ${body}
  </section>`;
}

export function renderBuildPanel(state) {
  if (!state.championId) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      <div class="build-placeholder">Pick a champion to see build recommendations</div>
    </div>`;
  }

  if (state.loading) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
      <div class="build-placeholder">${SPINNER} <span>Loading build data…</span></div>
    </div>`;
  }

  if (state.error) {
    return `<div class="build-panel">
      ${renderPanelHeader(state)}
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
      <div class="build-placeholder">
        <span>No data for ${esc(tierLabel)}</span>
        <button class="build-action" type="button" data-build-tier-all>See All Ranks</button>
      </div>
    </div>`;
  }

  return `<div class="build-panel">
    ${renderPanelHeader(state)}
    <div class="build-grid">
      ${renderItemsCard(state)}
      ${renderRunesCard(state)}
      ${renderSpellsCard(state)}
    </div>
    ${renderItemTrend(state)}
    ${renderSkillOrder(state)}
    ${renderCounters(state)}
    ${renderTopPlayers(state)}
  </div>`;
}
