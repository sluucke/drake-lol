import { CSS } from './styles.js';
import { DRAKE_ICON } from './assets.js';
import { PROVIDERS } from '../features/reveal.js';
import { iconUrl } from '../features/champions.js';
import { TIERS, DIVISIONS, QUEUES, CRYSTALS, AVAILABILITIES } from '../features/presence.js';
import { RANK_ICONS, HASHTAG } from './assets.js';
import { visibleWindow } from './virtualGrid.js';
import {
  AUTO_PICK_ROLES,
  autoPickOrder,
  normalizeAutoPickByRole,
  toggleAutoPickChampion,
} from '../features/autoPickRoles.js';
import { roleIconUrl } from './roleIcons.js';

export {
  AUTO_PICK_ROLES,
  autoPickOrder,
  normalizeAutoPickByRole,
  toggleAutoPickChampion,
} from '../features/autoPickRoles.js';

export const SCREENS = [
  { id: 'auto-accept', label: 'Auto Accept' },
  { id: 'auto-pick', label: 'Auto Pick' },
  { id: 'auto-ban', label: 'Auto Ban' },
  { id: 'queue', label: 'Queue' },
  { id: 'status', label: 'Status' },
  { id: 'profile', label: 'Profile' },
  { id: 'friends', label: 'Friends' },
  { id: 'whats-new', label: "What's New" },
  { id: 'settings', label: 'Settings' },
];

export const CREDITS = {
  createdBy: { label: 'David William', href: 'https://github.com/sluucke' },
  specialThanks: { label: 'Bieelyi', href: 'https://twitch.tv/bieelyi' },
  inspiredBy: [
    { label: 'Tiamat', href: 'https://github.com/369gabriel/tiamat' },
    { label: 'Sona', href: 'https://github.com/WJZ-P/sona' },
  ],
  assets: { label: 'Community Dragon', href: 'https://www.communitydragon.org' },
  repoUrl: 'https://github.com/sluucke/drake-lol',
};

function creditLink(entry, { large = false } = {}) {
  const cls = large ? 'credit-link credit-link-large' : 'credit-link';
  return `<button type="button" class="${cls}" data-credit-href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</button>`;
}

function creditBlock(title, bodyHtml) {
  return `<div class="credit-block"><span class="credit-label">${escapeHtml(title)}</span>${bodyHtml}</div>`;
}

export function renderCreditsModal() {
  const inspired = CREDITS.inspiredBy.map((entry) => creditLink(entry)).join('');
  return `
    <div class="credits-backdrop" data-credits-dismiss="1"></div>
    <div class="credits-card" role="dialog" aria-modal="true" aria-labelledby="credits-title">
      <button type="button" class="close credits-close" id="credits-close" aria-label="Close">✕</button>
      <div id="credits-title" class="credits-title">Credits</div>
      <p class="credits-disclaimer">Drake is unofficial open source software. Not affiliated with Riot Games.</p>
      <div class="credits-body">
        ${creditBlock('Created by', creditLink(CREDITS.createdBy, { large: true }))}
        ${creditBlock('Special thanks', creditLink(CREDITS.specialThanks, { large: true }))}
        ${creditBlock('Inspired by', `<div class="credit-links">${inspired}</div>`)}
        ${creditBlock('Assets', creditLink(CREDITS.assets))}
      </div>
      <div class="credits-actions">
        <button type="button" class="hextech-btn" data-credit-open-repo>GitHub</button>
      </div>
    </div>`;
}export function renderShell() {
  const nav = SCREENS.map(
    (s, i) =>
      `<button class="navitem" role="tab" data-screen="${s.id}" aria-selected="${i === 0}">${s.label}</button>`,
  ).join('');

  return `
    <style>${CSS}</style>

    
    <div class="cancel-dock" id="cancel-dock" hidden>
      <button class="hextech-btn hextech-btn-danger" id="cancel-queue">Cancel Queue</button>
    </div>

    
    <div class="dodge-dock" id="dodge-dock" hidden>
      <button class="hextech-btn hextech-btn-danger" id="dodge-champ-select">Dodge</button>
    </div>

    <div class="scrim" id="scrim">
      <div class="window" role="dialog" aria-label="Drake">
        <div class="titlebar">
          <img class="mark" src="${DRAKE_ICON}" alt="" aria-hidden="true">
          <div class="title">Drake</div>
          <div class="hint">Ctrl + D</div>
          <div class="titlebar-actions">
            <button type="button" class="close" id="credits-open" aria-label="Credits">?</button>
            <button type="button" class="close" id="close" aria-label="Close">✕</button>
          </div>
        </div>

        <div class="body">
          <div class="nav" role="tablist">${nav}</div>
          <div class="content" id="content"></div>
          <div class="onboard-layer" id="onboard-layer" hidden></div>
        </div>

        <div class="footer">
          <span id="host-label">—</span>
          <span id="status">—</span>
        </div>

        <div class="credits-modal" id="credits-modal" hidden>
          ${renderCreditsModal()}
        </div>
      </div>
    </div>`;
}

export function renderWelcome() {
  return `
    <div class="welcome">
      <img class="welcome-mark" src="${DRAKE_ICON}" alt="" aria-hidden="true">
      <div class="welcome-name">Drake</div>
      <p class="welcome-copy">Tools that sit beside the client. A short tour covers the screens you will use most.</p>
      <div class="welcome-actions">
        <button type="button" class="hextech-btn" data-onboard="tour">Take the tour</button>
        <button type="button" class="hextech-btn hextech-btn-muted" data-onboard="skip">Skip</button>
      </div>
    </div>`;
}

export function renderWhatsNew(entry, { version } = {}) {
  const ver = escapeHtml(version || entry?.version || '');
  const items = Array.isArray(entry?.items) ? entry.items : [];
  const list = items.length
    ? `<ul class="whats-new-list">${items.map(renderWhatsNewItem).join('')}</ul>`
    : `<p class="whats-new-empty">No notes for this version.</p>`;

  return `
    <div class="whats-new">
      <h2 class="screen-title">What's New</h2>
      <p class="screen-sub">${ver ? `Changes in v${ver}` : 'Recent changes'}</p>
      <div class="rule"></div>
      ${list}
      <div class="welcome-actions">
        <button type="button" class="hextech-btn" data-onboard="dismiss-whats-new">Continue</button>
      </div>
    </div>`;
}

function renderWhatsNewItem(item) {
  const title = escapeHtml(item.title);
  const body = escapeHtml(item.body);
  const screen = item.screen ? escapeHtml(item.screen) : '';
  const heading = screen
    ? `<button type="button" class="whats-new-link" data-whats-new-screen="${screen}">${title}</button>`
    : `<span class="whats-new-title">${title}</span>`;
  return `<li class="whats-new-item">${heading}<p class="whats-new-body">${body}</p></li>`;
}

export function renderTourCard(step, { index, total } = {}) {
  const title = escapeHtml(step?.title);
  const body = escapeHtml(step?.body);
  const current = Number(index) || 0;
  const count = Number(total) || 0;
  const nextLabel = current === count && count > 0 ? 'Done' : 'Next';

  return `
    <div class="tour-card">
      <div class="tour-meta">${current} / ${count}</div>
      <h3 class="tour-title">${title}</h3>
      <p class="tour-body">${body}</p>
      <div class="tour-actions">
        <button type="button" class="hextech-btn" data-onboard="tour-next">${nextLabel}</button>
        <button type="button" class="hextech-btn hextech-btn-muted" data-onboard="skip">Skip</button>
      </div>
    </div>`;
}

export function formatHostLabel({ appVersion, loaderVersion }) {
  const host = loaderVersion ? `loader ${loaderVersion}` : 'in client';
  return `drake ${appVersion || '?'} · ${host}`;
}

export function renderCheckRow({ id, label, help, checked, disabled }) {
  return `
    <button class="check-row" data-setting="${id}" ${disabled ? 'disabled' : ''}>
      <span class="check" data-checked="${checked}"></span>
      <span class="check-label">${label}</span>
    </button>
    ${help ? `<p class="check-help">${help}</p>` : ''}`;
}

export function formatDelay(ms) {
  return ms === 0 ? 'Instant' : `${(ms / 1000).toFixed(1)}s`;
}

export function renderAutoAccept(settings, { disabled, maxDelayMs }) {
  const delay = settings.auto_accept_delay_ms || 0;
  return `
    <h2 class="screen-title">Auto Accept</h2>
    <p class="screen-sub">Accepts the ready check for you the moment it appears.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: 'auto_accept',
      label: 'Accept ready checks automatically',
      checked: !!settings.auto_accept,
      disabled,
    })}

    <div class="field ${settings.auto_accept ? '' : 'field-off'}">
      <div class="field-head">
        <label class="field-label" for="delay">Accept after</label>
        <span class="field-value" id="delay-value">${formatDelay(delay)}</span>
      </div>
      <input class="slider" type="range" id="delay" name="delay"
             min="0" max="${maxDelayMs}" step="500" value="${delay}"
             ${disabled || !settings.auto_accept ? 'disabled' : ''}>
      <p class="check-help" style="margin-left:0">
        A short wait leaves you a window to decline by hand, and looks less
        mechanical than accepting the instant the prompt renders.
      </p>
    </div>`;
}

export function renderQueue({
  provider,
  settings = {},
  disabled,
  revealTiming = null,
}) {
  const options = PROVIDERS.map(
    (p) =>
      `<button class="pill" data-provider="${p.id}" aria-selected="${p.id === provider}">${p.label}</button>`,
  ).join('');

  const sampleSize = Number(settings.queue_team_reveal_sample_size) || 50;
  const recentPool = settings.queue_team_reveal_recent_pool || 'ranked_both';
  const last5Pool = settings.queue_team_reveal_last5_pool || 'current_queue';
  const concurrency = Number(settings.queue_team_reveal_fetch_concurrency) || 1;
  const poolOptions = [
    { id: 'ranked_both', label: 'Solo + Flex' },
    { id: 'current_queue', label: 'Current queue' },
    { id: 'any', label: 'Any queue' },
  ];
  const sampleOptions = [
    { id: 20, label: '20' },
    { id: 50, label: '50' },
    { id: 100, label: '100' },
  ];
  const concurrencyOptions = [
    { id: 1, label: '1' },
    { id: 2, label: '2' },
    { id: 3, label: '3' },
    { id: 5, label: '5' },
  ];

  const currentQueueWarn =
    recentPool === 'current_queue' || last5Pool === 'current_queue'
      ? `<p class="check-help" style="margin:8px 0 0">Current queue can look sparse if that player rarely plays this queue.</p>`
      : '';
  const concurrencyWarn =
    concurrency >= 3
      ? `<p class="reveal-warn" style="margin:8px 0 0">Higher concurrency loads the client harder and can hit rate limits.</p>`
      : '';

  let timingHelp = '';
  if (revealTiming?.lastMs > 0) {
    const recommended = Number(revealTiming.recommended) || 1;
    const estimateSec = Math.max(1, Math.round((Number(revealTiming.estimateMs) || 0) / 1000));
    timingHelp = `<p class="check-help" style="margin:8px 0 0">About ~${estimateSec}s for a full lobby at this setting.</p>
      <p class="reveal-recommend">Based on your last reveal, we suggest resolving ${recommended} player${recommended === 1 ? '' : 's'} at a time.</p>`;
  }

  const revealOptsDisabled = disabled || !settings.queue_team_reveal_in_client;

  return `
    <h2 class="screen-title">Queue</h2>
    <p class="screen-sub">Tools for champ select.</p>
    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Lobby reveal</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Looks your whole team up on a scouting site. Only works while you are in
      champ select, because that is when the names exist.
    </p>
    <div class="pill-row">${options}</div>
    <div class="status-actions">
      <button class="hextech-btn" id="reveal">Reveal Lobby</button>
    </div>

    <div class="rule"></div>

    ${renderCheckRow({
      id: 'queue_team_reveal_in_client',
      label: 'Reveal my team in-client',
      help: 'Rewrites ally rows and enables the Ctrl+Shift+D cards overlay while in champ select.',
      checked: !!settings.queue_team_reveal_in_client,
      disabled,
    })}

    <div class="field ${settings.queue_team_reveal_in_client ? '' : 'field-off'}">
      <div class="row">
        <span class="field-label" style="min-width:120px">Sample size</span>
        ${renderSelect('team-reveal-sample-size', sampleOptions, sampleSize, revealOptsDisabled)}
      </div>
      <div class="row">
        <span class="field-label" style="min-width:120px">Recent pool</span>
        ${renderSelect('team-reveal-recent-pool', poolOptions, recentPool, revealOptsDisabled)}
      </div>
      <div class="row">
        <span class="field-label" style="min-width:120px">Last 5 pool</span>
        ${renderSelect('team-reveal-last5-pool', poolOptions, last5Pool, revealOptsDisabled)}
      </div>
      <div class="row">
        <span class="field-label" style="min-width:120px">Fetch at once</span>
        ${renderSelect('team-reveal-fetch-concurrency', concurrencyOptions, concurrency, revealOptsDisabled)}
      </div>
      ${currentQueueWarn}
      ${concurrencyWarn}
      ${timingHelp}
      ${revealOptsDisabled ? '<p class="check-help" style="margin:8px 0 0">Enable in-client reveal to change these.</p>' : ''}
    </div>

    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Dodge</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Leaves champ select. Costs you the usual dodge penalty — Drake does not
      confirm first, so only press it if you mean it.
    </p>
    ${renderCheckRow({
      id: 'queue_dodge_in_client',
      label: 'Show dodge button in champ select',
      help: 'Places a Dodge button over the client while you are in champ select.',
      checked: settings.queue_dodge_in_client !== false,
      disabled,
    })}
    <div class="status-actions">
      <button class="hextech-btn hextech-btn-danger" id="dodge">Dodge</button>
    </div>`;
}

export function renderChampionPicker({ id, list, query, selectedId, compact }) {
  const cells = list
    .map(
      (c) => `
      <button class="champ ${c.id === selectedId ? 'champ-on' : ''}"
              data-champ="${c.id}" data-for="${id}" title="${c.name}">
        <img src="${iconUrl(c.id)}" alt="" loading="lazy">
      </button>`,
    )
    .join('');

  return `
    <input class="hextech-input" type="search" data-search="${id}"
           value="${String(query || '').replace(/"/g, '&quot;')}"
           placeholder="Search champions...">
    <div class="champ-grid${compact ? ' champ-grid-sm' : ''}">${cells || '<p class="check-help">No champions match.</p>'}</div>`;
}

export function championName(list, id) {
  const found = list.find((c) => c.id === id);
  return found ? found.name : 'none chosen';
}

function renderPickOrderSummary(list, pickIds) {
  if (pickIds.length === 0) {
    return '<p class="pick-order pick-order-empty">Click up to 2 champions for this role — first is your pick, second is the backup.</p>';
  }

  const items = pickIds
    .map(
      (id, index) => `
      <span class="pick-order-item">
        <span class="pick-order-num">${index + 1}</span>
        <img class="pick-order-icon" src="${iconUrl(id)}" alt="">
        ${championName(list, id)}
        <button class="close pick-order-remove" type="button" data-remove-pick="${id}" aria-label="Remove">✕</button>
      </span>`,
    )
    .join('');

  return `<div class="pick-order">${items}</div>`;
}

function renderRoleTabs(byRole, activeRole) {
  return `
    <div class="role-tabs" role="tablist" aria-label="Pick roles">
      ${AUTO_PICK_ROLES.map((role) => {
        const count = (byRole[role.id] || []).length;
        const selected = role.id === activeRole;
        const icon = roleIconUrl(role.id);
        return `
        <button class="role-tab${selected ? ' role-tab-on' : ''}" type="button" role="tab"
                data-auto-pick-role="${role.id}" aria-selected="${selected}" title="${role.label}">
          ${icon ? `<img class="role-tab-icon" src="${icon}" alt="">` : ''}
          <span class="role-tab-label">${role.label}</span>
          <span class="role-tab-count">${count}</span>
        </button>`;
      }).join('')}
    </div>`;
}

export function renderOrderedChampionPicker({ list, query, pickIds, compact }) {
  const order = new Map(pickIds.map((id, index) => [id, index + 1]));
  const cells = list
    .map((c) => {
      const slot = order.get(c.id);
      return `
      <button class="champ ${slot ? 'champ-on' : ''}"
              data-champ="${c.id}" data-for="auto_pick" title="${c.name}">
        <img src="${iconUrl(c.id)}" alt="" loading="lazy">
        ${slot ? `<span class="champ-slot">${slot}</span>` : ''}
      </button>`;
    })
    .join('');

  return `
    <input class="hextech-input" type="search" data-search="auto_pick_champion_id"
           value="${String(query || '').replace(/"/g, '&quot;')}"
           placeholder="Search champions...">
    <div class="champ-grid${compact ? ' champ-grid-sm' : ''}">${cells || '<p class="check-help">No champions match.</p>'}</div>`;
}

export function renderAutoPick(settings, { disabled, list, allList, query, activeRole = 'TOP' }) {
  const role = String(activeRole || 'TOP').toUpperCase();
  const byRole = normalizeAutoPickByRole(settings.auto_pick_by_role);
  const pickIds = autoPickOrder(settings, role);
  const names = allList || list;
  const roleMeta = AUTO_PICK_ROLES.find((entry) => entry.id === role);
  const roleLabel = roleMeta?.label || role;

  return `
    <h2 class="screen-title">Auto Pick</h2>
    <p class="screen-sub">Up to 2 champions per role. Picks wait until your lane is assigned — Fill does nothing.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: 'auto_pick',
      label: 'Pick a champion automatically',
      checked: !!settings.auto_pick,
      disabled,
    })}

    ${renderCheckRow({
      id: 'insta_lock',
      label: 'Insta Lock',
      help: 'Locks the champion in the instant the pick opens, instead of only hovering it. Nobody can take it from you, and you cannot change your mind.',
      checked: !!settings.insta_lock,
      disabled: disabled || !settings.auto_pick,
    })}

    <div class="field ${settings.auto_pick ? '' : 'field-off'}">
      ${renderRoleTabs(byRole, role)}
      <div class="field-head">
        <span class="field-label">${roleLabel}</span>
        <span class="field-value">${pickIds.length ? `${pickIds.length} selected` : 'none chosen'}</span>
      </div>
      ${renderPickOrderSummary(names, pickIds)}
      ${renderOrderedChampionPicker({ list, query, pickIds, compact: true })}
    </div>`;
}

function renderBanSummary(list, banId) {
  const id = Number(banId) || 0;
  if (!id) {
    return '<p class="pick-order pick-order-empty">Click a champion to ban — click again or ✕ to clear.</p>';
  }

  return `<div class="pick-order">
    <span class="pick-order-item">
      <img class="pick-order-icon" src="${iconUrl(id)}" alt="">
      ${championName(list, id)}
      <button class="close pick-order-remove" type="button" data-remove-ban="${id}" aria-label="Remove">✕</button>
    </span>
  </div>`;
}

export function renderAutoBan(settings, { disabled, list, allList, query }) {
  const names = allList || list;
  const banId = Number(settings.auto_ban_champion_id) || 0;

  return `
    <h2 class="screen-title">Auto Ban</h2>
    <p class="screen-sub">Bans a champion for you when the ban phase reaches your turn.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: 'auto_ban',
      label: 'Ban a champion automatically',
      help: 'A ban is always locked in — hovering a ban bans nothing.',
      checked: !!settings.auto_ban,
      disabled,
    })}

    <div class="field ${settings.auto_ban ? '' : 'field-off'}">
      <div class="field-head">
        <span class="field-label">Champion</span>
        <span class="field-value">${banId ? '1 selected' : 'none chosen'}</span>
      </div>
      ${renderBanSummary(names, banId)}
      ${renderChampionPicker({
        id: 'auto_ban_champion_id',
        list,
        query,
        selectedId: banId,
      })}
    </div>`;
}

export function renderStatus(text, settings = {}) {
  
  
  const safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `
    <h2 class="screen-title">Status Message</h2>
    <p class="screen-sub">
      Your chat presence. Line breaks work here — the client's own field is a
      single-line input and cannot hold them.
    </p>
    <div class="rule"></div>

    <div class="row">
      <span class="field-label" style="min-width:72px">Presence</span>
      ${renderSelect(
        'presence-availability',
        [{ id: '', label: 'Client default' }, ...AVAILABILITIES],
        settings.presence_availability || '',
      )}
    </div>
    <p class="check-help" style="margin:-4px 0 10px">
      Drake keeps re-applying the chosen status whenever the client resets it.
    </p>

    <textarea class="status-box" id="status-text" spellcheck="false"
              placeholder="Type or paste your status. ASCII art welcome.">${safe}</textarea>

    <div class="status-actions">
      <span class="status-count" id="status-count"></span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-muted" id="status-clear">Clear</button>
      <button class="hextech-btn" id="status-save">Save</button>
    </div>`;
}

export function describeStatus(text) {
  const t = String(text ?? '');
  const lines = t === '' ? 0 : t.split('\n').length;
  return `${t.length} chars · ${lines} line${lines === 1 ? '' : 's'}`;
}

function options(list, selected) {
  return list
    .map(
      (o) =>
        `<option value="${o.id ?? o}" ${(o.id ?? o) === selected ? 'selected' : ''}>${o.label ?? o}</option>`,
    )
    .join('');
}

export const PROFILE_TABS = [
  { id: 'rank', label: 'Rank' },
  { id: 'banner', label: 'Banner' },
  { id: 'riot-id', label: 'Riot ID' },
];







function renderSelect(id, list, selected, disabled = false) {
  const opts = list
    .map((o) => {
      const value = o.id ?? o;
      const label = o.label ?? o;
      return `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  return `
    <span class="select-wrap">
      <select class="select-field" id="${id}" ${disabled ? 'disabled' : ''}>${opts}</select>
      <span class="select-arrows" aria-hidden="true">
        <span>▲</span><span>▼</span>
      </span>
    </span>`;
}

function renderRankTab(lol) {
  const tier = lol.rankedLeagueTier || '';
  const tiles = TIERS.map(
    (t) => `
    <button class="rank ${t === tier ? 'rank-on' : ''}" data-tier="${t}">
      <img src="${RANK_ICONS[t] || RANK_ICONS.UNRANKED}" alt="">
      <span>${t.charAt(0) + t.slice(1).toLowerCase()}</span>
    </button>`,
  ).join('');

  return `
    <div class="rank-grid">${tiles}</div>

    <div class="row">
      <span class="field-label" style="min-width:72px">Division</span>
      ${renderSelect('rank-div', DIVISIONS, lol.rankedLeagueDivision || 'I')}
    </div>
    <div class="row">
      <span class="field-label" style="min-width:72px">Queue</span>
      ${renderSelect('rank-queue', QUEUES, lol.rankedLeagueQueue || QUEUES[0].id)}
    </div>

    <div class="rule"></div>

    <div class="row">
      <span class="field-label" style="min-width:72px">Crystal</span>
      ${renderSelect('crystal', CRYSTALS, lol.challengeCrystalLevel || 'IRON')}
    </div>

    <div class="status-actions">
      <span class="status-count">Shown next to your name in chat. Your real rank is unchanged.</span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-muted" id="rank-clear">Reset</button>
      <button class="hextech-btn" id="rank-save">Apply</button>
    </div>

    <div class="rule"></div>
    <div class="field-head">
      <span class="field-label">Challenge badges</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      The three tokens on your profile. Clone copies the first into all three slots.
    </p>
    <div class="status-actions">
      <button class="hextech-btn hextech-btn-muted" id="badges-remove">Remove badges</button>
      <button class="hextech-btn" id="badges-clone">Clone first to all 3</button>
    </div>`;
}

export const SKIN_TILE = { perRow: 5, rowHeight: 92, viewportHeight: 300 };

export function renderSkinCells(skins, selectedId, win) {
  return skins
    .slice(win.start, win.end)
    .map(
      (s) => `
      <button class="skin ${s.id === selectedId ? 'skin-on' : ''}" data-skin="${s.id}" title="${escapeHtml(s.name)}">
        <img src="${s.tile}" alt="" loading="lazy">
        <span>${escapeHtml(s.name)}</span>
      </button>`,
    )
    .join('');
}

export function skinWindow(total, scrollTop) {
  return visibleWindow({
    total,
    perRow: SKIN_TILE.perRow,
    rowHeight: SKIN_TILE.rowHeight,
    viewportHeight: SKIN_TILE.viewportHeight,
    scrollTop: scrollTop || 0,
  });
}

function renderBannerTab({ skins, query, selectedId, scrollTop }) {
  const win = skinWindow(skins.length, scrollTop);

  const body = skins.length
    ? `<div class="skin-spacer" id="skin-spacer" style="height:${win.totalHeight}px">
         <div class="skin-grid" id="skin-grid" style="transform:translateY(${win.offsetY}px)">
           ${renderSkinCells(skins, selectedId, win)}
         </div>
       </div>`
    : '<p class="check-help">No skins match.</p>';

  return `
    <input class="hextech-input" type="search" data-search="skins"
           value="${String(query || '').replace(/"/g, '&quot;')}"
           placeholder="Search ${skins.length} skins...">
    <div class="skin-viewport" id="skin-viewport">${body}</div>`;
}

function renderRiotIdTab() {
  return `
    <p class="check-help" style="margin:0 0 12px">
      Renaming is rate-limited by Riot, not by Drake. If it refuses, that is
      their cooldown talking.
    </p>
    <div class="split-input">
      <input class="split-name" id="riot-name" placeholder="Name" spellcheck="false">
      <img class="split-hash" src="${HASHTAG}" alt="#">
      <input class="split-tag" id="riot-tag" placeholder="TAG" maxlength="5" spellcheck="false">
    </div>
    <div class="status-actions">
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn" id="riot-id-save">Save ID</button>
    </div>`;
}

export function renderProfile({ tab, lol, skins, skinQuery, backgroundId, skinScroll }) {
  const tabs = PROFILE_TABS.map(
    (t) =>
      `<button class="pill" data-ptab="${t.id}" aria-selected="${t.id === tab}">${t.label}</button>`,
  ).join('');

  const body =
    tab === 'banner'
      ? renderBannerTab({ skins, query: skinQuery, selectedId: backgroundId, scrollTop: skinScroll })
      : tab === 'riot-id'
        ? renderRiotIdTab()
        : renderRankTab(lol);

  return `
    <h2 class="screen-title">Profile</h2>
    <p class="screen-sub">What other players see. None of this changes your account.</p>
    <div class="pill-row">${tabs}</div>
    <div class="rule"></div>
    ${body}`;
}

export function renderFriends(list) {
  if (list.length === 0) {
    return `
      <h2 class="screen-title">Friends</h2>
      <p class="screen-sub">Nobody on the list, or the client has not shared it yet.</p>`;
  }

  const rows = list
    .map(
      (f) => `
      <div class="friend">
        <span class="dot ${f.online ? 'dot-on' : ''}"></span>
        <span class="friend-name">${escapeHtml(f.riotId)}</span>
        <span class="friend-note">${escapeHtml(f.note || f.statusMessage || '')}</span>
      </div>`,
    )
    .join('');

  const online = list.filter((f) => f.online).length;
  return `
    <h2 class="screen-title">Friends</h2>
    <p class="screen-sub">${online} online of ${list.length}. Notes are the ones you set in the client.</p>
    <div class="rule"></div>
    <div class="friend-list">${rows}</div>
    <div class="status-actions">
      <span class="status-count">Removing everyone cannot be undone from Drake.</span>
      <span class="status-actions-spacer"></span>
      <button class="hextech-btn hextech-btn-danger" id="friends-remove-all">Remove all</button>
    </div>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderSettings(settings, { disabled, version, update }) {
  const u = update || { phase: 'idle' };
  const checking = u.phase === 'checking';
  const checkLabel = checking ? 'Checking…' : 'Check for updates';

  let updateNote = '';
  if (u.phase === 'current') {
    updateNote = '<p class="check-help">Drake is up to date.</p>';
  } else if (u.phase === 'available') {
    updateNote = `
      <p class="check-help">${escapeHtml(u.version)} is available.</p>
      <div class="status-actions">
        <button class="hextech-btn" id="install-update" ${disabled || checking ? 'disabled' : ''}>Install now</button>
      </div>`;
  } else if (u.phase === 'no_installer') {
    updateNote = `<p class="check-help">${escapeHtml(u.version)} is on GitHub but has no Windows installer yet.</p>`;
  } else if (u.phase === 'error') {
    updateNote = `<p class="check-help">${escapeHtml(u.message || 'Could not check for updates.')}</p>`;
  }

  return `
    <h2 class="screen-title">Settings</h2>
    <p class="screen-sub">How Drake itself behaves.</p>
    <div class="rule"></div>

    ${renderCheckRow({
      id: 'run_at_startup',
      label: 'Start Drake with Windows',
      help: 'Keeps the client injected before it launches, so this panel is always available.',
      checked: !!settings.run_at_startup,
      disabled,
    })}

    <div class="rule"></div>

    ${renderCheckRow({
      id: 'auto_reload_on_open',
      label: 'Reload the client when Drake starts',
      help: 'Only used when Drake finds the client already running without Drake loaded.',
      checked: !!settings.auto_reload_on_open,
      disabled,
    })}

    <div class="rule"></div>

    ${renderCheckRow({
      id: 'auto_update',
      label: 'Install updates automatically',
      help: 'Downloads the latest GitHub release and runs the installer. Windows will ask for permission because Drake lives in Program Files.',
      checked: settings.auto_update !== false,
      disabled,
    })}

    <div class="field-head">
      <span class="field-label">Updates</span>
      <span class="field-value">v${escapeHtml(version || '?')}</span>
    </div>
    <div class="status-actions">
      <button class="hextech-btn" id="check-updates" ${disabled || checking ? 'disabled' : ''}>${checkLabel}</button>
    </div>
    ${updateNote}

    <div class="rule"></div>

    ${renderCheckRow({
      id: 'unlock_status_message',
      label: 'Unlock the status message field',
      help: "Removes the client's 25-character cap on your own status message and gives the field room to breathe. Takes effect on the next client reload.",
      checked: !!settings.unlock_status_message,
      disabled,
    })}

    <div class="rule"></div>

    <div class="field-head">
      <span class="field-label">Client</span>
    </div>
    <p class="check-help" style="margin:0 0 10px">
      Reloads the League client UI. Use this when Drake injected while the
      client was already open, or after a change that only applies on a reload.
    </p>
    <div class="status-actions">
      <button class="hextech-btn" id="restart-client">Restart client</button>
    </div>`;
}
