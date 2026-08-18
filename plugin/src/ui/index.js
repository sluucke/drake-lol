import { mountUI } from './mount.js';
import {
  renderShell,
  renderAutoAccept,
  renderSettings,
  renderStatus,
  renderQueue,
  renderAutoPick,
  renderAutoBan,
  renderProfile,
  renderFriends,
  renderSkinCells,
  skinWindow,
  describeStatus,
  formatDelay,
  toggleAutoPickChampion,
} from './panel.js';
import { makeStatus } from '../features/status.js';
import { makeReveal } from '../features/reveal.js';
import { makeDodge } from '../features/dodge.js';
import { makeRestartUx } from '../features/restartUx.js';
import { makeOpener } from '../features/openUrl.js';
import { loadChampions, searchChampions } from '../features/champions.js';
import { makePresence, readLol, CHAT_ME, QUEUES } from '../features/presence.js';
import { makeRiotId, loadFriends, removeAllFriends } from '../features/profile.js';
import { loadSkins, searchSkins, makeBackground } from '../features/skins.js';
import { autoSize, markManual } from './autoSize.js';
import { makeSfx, sfxFor } from './sfx.js';
import { makeSettingsClient } from './settingsClient.js';
import { makeUpdater } from '../features/update.js';
import { loadConfig } from '../config.js';
import { canCancel, DECLINE_ROUTE } from '../autoAccept.js';
import { findAnchor, inChampSelect, layoutDock, watchAnchor } from './dodgeDock.js';

const TAG = '[Drake]';



export const MAX_DELAY_MS = 8000;







export function startUI({ cfg, onSettingsChanged, lcu }) {
  let settings = { ...cfg.settings };
  let appVersion = cfg.version || '0.0.0';
  let updateUi = { phase: 'idle' };
  let trayDown = false;
  let screen = 'auto-accept';
  let shadowRoot = null;
  let stopDodgeReposition = null;
  let dodgeBusy = false;
  let champSelectActive = false;
  let statusText = '';
  let provider = 'porofessor';
  let champions = [];
  
  const queries = {
    auto_pick_champion_id: '',
    auto_ban_champion_id: '',
    skins: '',
  };
  const status = makeStatus({ lcu });
  let dodgeStatus = (detail) => console.log(TAG, 'dodge', detail);
  let say = (text, good) => console.log(TAG, text, good ? 'ok' : 'err');
  const dodger = makeDodge({
    onStatus: (detail) => dodgeStatus(detail),
  });
  const restarter = makeRestartUx({ lcu });
  const opener = makeOpener({ port: cfg.port, token: cfg.token });
  const presence = makePresence({ lcu });
  const riotId = makeRiotId({ lcu });
  let lol = {};
  let friends = [];
  let profileTab = 'rank';
  let skins = [];
  let backgroundId = 0;
  let skinFrame = 0;
  const background = makeBackground({ lcu });
  const sfx = makeSfx();
  
  
  const steps = { 'rank-div': 'I', 'rank-queue': QUEUES[0].id, crystal: 'IRON' };
  let pickedTier = '';

  const client = makeSettingsClient({
    port: cfg.port,
    token: cfg.token,
    reloadConfig: loadConfig,
  });
  const updater = makeUpdater({
    port: cfg.port,
    token: cfg.token,
    reloadConfig: loadConfig,
  });

  const ui = mountUI({
    doc: document,
    win: window,
    render: renderShell,
    onOpenChange: (open) => {
      if (!shadowRoot) return;
      shadowRoot.getElementById('scrim').style.display = open ? 'grid' : 'none';
    },
    onMount: wire,
  });

  
  
  
  
  function setReadyCheck(payload) {
    if (!shadowRoot) return;
    shadowRoot.getElementById('cancel-dock').hidden = !canCancel(payload);
  }

  function resetDodgeUi({ keepLabel = false } = {}) {
    dodgeBusy = false;
    if (!shadowRoot) return;
    for (const id of ['dodge-champ-select', 'dodge']) {
      const el = shadowRoot.getElementById(id);
      if (!el) continue;
      el.disabled = false;
      if (!keepLabel) el.textContent = 'Dodge';
    }
  }

  function startDodgeReposition() {
    if (!shadowRoot || !champSelectActive) return;
    const dock = shadowRoot.getElementById('dodge-dock');
    const reposition = () => {
      if (dodgeBusy) return;
      layoutDock(dock, findAnchor(document), window);
    };
    reposition();
    stopDodgeReposition = watchAnchor(document, window, reposition);
  }

  function setChampSelect(session) {
    if (!shadowRoot) return;
    const dock = shadowRoot.getElementById('dodge-dock');
    champSelectActive = inChampSelect(session);
    dock.hidden = !champSelectActive;
    if (stopDodgeReposition) {
      stopDodgeReposition();
      stopDodgeReposition = null;
    }
    if (!champSelectActive) {
      resetDodgeUi();
      return;
    }
    resetDodgeUi();
    startDodgeReposition();
  }

  async function runDodge(btn) {
    if (!btn || dodgeBusy || btn.disabled) {
      console.log(TAG, 'dodge ignored', { btn: btn?.id, dodgeBusy, disabled: btn?.disabled });
      return;
    }
    dodgeBusy = true;
    btn.disabled = true;
    btn.textContent = 'Dodging…';
    say('Dodging…', true);
    console.log(TAG, 'dodge click', btn.id);
    if (stopDodgeReposition) {
      stopDodgeReposition();
      stopDodgeReposition = null;
    }
    try {
      const result = await dodger.dodge();
      console.log(TAG, 'dodge result', result);
      const msg = result.ok
        ? `Dodged champ select${result.detail ? ` (${result.detail})` : ''}`
        : result.reason;
      say(msg, result.ok);
      btn.textContent = result.ok ? 'Dodged!' : 'Failed';
    } finally {
      resetDodgeUi({ keepLabel: true });
      if (champSelectActive) startDodgeReposition();
      window.setTimeout(() => resetDodgeUi(), 2500);
    }
  }

  function wire(shadow, api) {
    shadowRoot = shadow;
    const content = shadow.getElementById('content');
    const statusEl = shadow.getElementById('status');

    function sayUi(text, good) {
      statusEl.textContent = text;
      statusEl.className = good ? 'status-good' : 'status-bad';
    }

    say = sayUi;
    dodgeStatus = (detail) => {
      sayUi(detail, true);
      console.log(TAG, 'dodge', detail);
    };

    shadow.getElementById('scrim').style.display = 'none';
    shadow.getElementById('host-label').textContent =
      typeof Pengu !== 'undefined' && Pengu.version ? `loader ${Pengu.version}` : 'in client';

    function paint() {
      if (screen === 'settings') {
        content.innerHTML = renderSettings(settings, {
          disabled: trayDown,
          version: appVersion,
          update: updateUi,
        });
      } else if (screen === 'auto-pick') {
        content.innerHTML = renderAutoPick(settings, {
          disabled: trayDown,
          list: searchChampions(champions, queries.auto_pick_champion_id),
          allList: champions,
          query: queries.auto_pick_champion_id,
        });
      } else if (screen === 'auto-ban') {
        content.innerHTML = renderAutoBan(settings, {
          disabled: trayDown,
          list: searchChampions(champions, queries.auto_ban_champion_id),
          query: queries.auto_ban_champion_id,
        });
      } else if (screen === 'profile') {
        content.innerHTML = renderProfile({
          tab: profileTab,
          lol: { ...lol, rankedLeagueTier: pickedTier || lol.rankedLeagueTier,
                 rankedLeagueDivision: steps['rank-div'],
                 rankedLeagueQueue: steps['rank-queue'],
                 challengeCrystalLevel: steps.crystal },
          skins: searchSkins(skins, queries.skins),
          skinQuery: queries.skins,
          backgroundId,
          skinScroll: 0,
        });
      } else if (screen === 'friends') {
        content.innerHTML = renderFriends(friends);
      } else if (screen === 'queue') {
        content.innerHTML = renderQueue({ provider });
      } else if (screen === 'status') {
        content.innerHTML = renderStatus(statusText);
        updateCount();
      } else {
        content.innerHTML = renderAutoAccept(settings, {
          disabled: trayDown,
          maxDelayMs: MAX_DELAY_MS,
        });
      }
      statusEl.textContent = trayDown ? 'Drake tray is not running' : 'Connected to the tray';
      statusEl.className = trayDown ? 'status-bad' : 'status-good';
      for (const item of shadow.querySelectorAll('[data-screen]')) {
        item.setAttribute('aria-selected', String(item.dataset.screen === screen));
      }
    }

    function applyUpdateStatus(body) {
      if (body.status === 'current') updateUi = { phase: 'current' };
      else if (body.status === 'available') {
        updateUi = { phase: 'available', version: body.version };
      } else if (body.status === 'no_installer') {
        updateUi = { phase: 'no_installer', version: body.version };
      }
    }

    async function runUpdateCheck() {
      updateUi = { phase: 'checking' };
      paint();
      const result = await updater.check();
      if (!result.ok) {
        trayDown = result.reason.includes('not running');
        updateUi = { phase: 'error', message: result.reason };
      } else {
        applyUpdateStatus(result);
      }
      paint();
    }

    
    
    async function commit(patch, revert) {
      const result = await client.save(patch);
      if (result.ok) {
        trayDown = false;
        if (onSettingsChanged) onSettingsChanged(settings);
        return;
      }
      revert();
      trayDown = result.reason.includes('not running');
      paint();
      statusEl.textContent = result.reason;
      statusEl.className = 'status-bad';
      console.log(TAG, 'could not save -', result.reason);
    }

    
    const BOX = { min: 120, max: Math.round(window.innerHeight * 0.46) };
    
    const GRIP = 16;

    function updateCount() {
      const el = shadow.getElementById('status-count');
      if (el) el.textContent = describeStatus(statusText);
      autoSize(shadow.getElementById('status-text'), BOX);
    }

    shadow.querySelector('.nav').addEventListener('click', async (e) => {
      const item = e.target.closest('[data-screen]');
      if (!item) return;
      screen = item.dataset.screen;
      
      
      
      if (screen === 'status') statusText = await status.read();
      
      
      if ((screen === 'auto-pick' || screen === 'auto-ban') && champions.length === 0) {
        champions = await loadChampions(lcu);
      }
      
      
      if (screen === 'profile') {
        try {
          lol = readLol(await lcu.get(CHAT_ME));
        } catch {
          lol = {};
        }
        
        
        pickedTier = lol.rankedLeagueTier || '';
        if (lol.rankedLeagueDivision) steps['rank-div'] = lol.rankedLeagueDivision;
        if (lol.rankedLeagueQueue) steps['rank-queue'] = lol.rankedLeagueQueue;
        if (lol.challengeCrystalLevel) steps.crystal = lol.challengeCrystalLevel;
        if (profileTab === 'banner' && skins.length === 0) skins = await loadSkins(lcu);
      }
      if (screen === 'friends') friends = await loadFriends(lcu);
      if (screen === 'settings' && updateUi.phase === 'idle') runUpdateCheck();
      paint();
    });

    content.addEventListener('input', (e) => {
      if (e.target.id !== 'status-text') return;
      statusText = e.target.value;
      updateCount();
    });

    
    
    
    content.addEventListener('mousedown', (e) => {
      const box = e.target;
      if (box.id !== 'status-text') return;
      const inGrip =
        e.offsetX > box.clientWidth - GRIP && e.offsetY > box.clientHeight - GRIP;
      if (inGrip) markManual(box);
    });

    
    
    
    
    
    
    
    function updateSkinGrid() {
      const viewport = shadow.getElementById('skin-viewport');
      const gridEl = shadow.getElementById('skin-grid');
      if (!viewport || !gridEl) return;

      const list = searchSkins(skins, queries.skins);
      const win = skinWindow(list.length, viewport.scrollTop);
      gridEl.style.transform = `translateY(${win.offsetY}px)`;
      gridEl.innerHTML = renderSkinCells(list, backgroundId, win);
    }

    content.addEventListener(
      'scroll',
      (e) => {
        if (e.target.id !== 'skin-viewport') return;
        
        
        
        if (skinFrame) return;
        skinFrame = requestAnimationFrame(() => {
          skinFrame = 0;
          updateSkinGrid();
        });
      },
      true,
    );

    content.addEventListener('change', (e) => {
      
      
      if (e.target.id in steps) {
        steps[e.target.id] = e.target.value;
      }
    });

    
    
    content.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.search;
      if (!key) return;
      queries[key] = e.target.value;
      paint();
      const again = shadow.querySelector(`[data-search="${key}"]`);
      if (again) {
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }
    });

    content.addEventListener('click', async (e) => {
      const champ = e.target.closest('[data-champ]');
      if (champ) {
        const key = champ.dataset.for;
        const id = Number(champ.dataset.champ);

        if (key === 'auto_pick') {
          const previous = {
            auto_pick_champion_id: settings.auto_pick_champion_id,
            auto_pick_champion_id_2: settings.auto_pick_champion_id_2,
          };
          settings = toggleAutoPickChampion(settings, id);
          paint();
          commit(
            {
              auto_pick_champion_id: settings.auto_pick_champion_id,
              auto_pick_champion_id_2: settings.auto_pick_champion_id_2,
            },
            () => {
              settings = { ...settings, ...previous };
            },
          );
          return;
        }

        const previous = settings[key];
        settings = { ...settings, [key]: previous === id ? 0 : id };
        paint();
        commit({ [key]: settings[key] }, () => {
          settings = { ...settings, [key]: previous };
        });
        return;
      }

      const pill = e.target.closest('[data-provider]');
      if (pill) {
        provider = pill.dataset.provider;
        paint();
        return;
      }

      if (e.target.id === 'reveal') {
        const btn = e.target;
        btn.disabled = true;
        
        
        
        let region = '';
        try {
          region = (await lcu.get('/riotclient/region-locale')).region || '';
        } catch {
        }
        const reveal = makeReveal({
          lcu,
          region,
          open: (url) =>
            opener.open(url).then((r) => {
              if (!r.ok) say(r.reason, false);
            }),
        });
        const result = await reveal.reveal(provider);
        btn.disabled = false;
        say(result.ok ? `Looking up ${result.count} summoners` : result.reason, result.ok);
        return;
      }

      const dodgeBtn = e.target.closest('#dodge');
      if (dodgeBtn) {
        e.stopPropagation();
        void runDodge(dodgeBtn);
        return;
      }

      if (e.target.id === 'restart-client') {
        const btn = e.target;
        btn.disabled = true;
        const result = await restarter.restart();
        
        btn.disabled = false;
        say(result.ok ? 'Restarting the client…' : result.reason, result.ok);
        return;
      }

      if (e.target.id === 'check-updates') {
        await runUpdateCheck();
        return;
      }

      if (e.target.id === 'install-update') {
        const btn = e.target;
        btn.disabled = true;
        say('Downloading and installing the update…', true);
        const result = await updater.apply();
        if (result.ok && result.installing) {
          say('Installing update…', true);
          return;
        }
        btn.disabled = false;
        if (!result.ok) {
          trayDown = result.reason.includes('not running');
          updateUi = { phase: 'error', message: result.reason };
          paint();
        }
        say(result.ok ? 'Drake is already up to date' : result.reason, result.ok);
        return;
      }

      
      const ptab = e.target.closest('[data-ptab]');
      if (ptab) {
        profileTab = ptab.dataset.ptab;
        if (profileTab === 'banner' && skins.length === 0) skins = await loadSkins(lcu);
        paint();
        return;
      }

      const tierTile = e.target.closest('[data-tier]');
      if (tierTile) {
        pickedTier = tierTile.dataset.tier;
        paint();
        return;
      }

      const skinTile = e.target.closest('[data-skin]');
      if (skinTile) {
        const id = Number(skinTile.dataset.skin);
        backgroundId = id;
        paint();
        const result = await background.set(id);
        say(result.ok ? 'Profile background set' : result.reason, result.ok);
        return;
      }

      if (e.target.id === 'friends-remove-all') {
        const btn = e.target;
        
        
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1';
          btn.textContent = `Remove all ${friends.length}? Click again`;
          return;
        }
        btn.disabled = true;
        const result = await removeAllFriends({ lcu, friends });
        friends = await loadFriends(lcu);
        paint();
        say(
          result.failed
            ? `Removed ${result.removed}, ${result.failed} failed`
            : `Removed ${result.removed} friends`,
          !result.failed,
        );
        return;
      }

      const profileAction = {
        'rank-save': () =>
          presence.setRank({
            tier: pickedTier || lol.rankedLeagueTier || 'GOLD',
            division: steps['rank-div'],
            queue: steps['rank-queue'],
          }).then((r) =>
            
            
            r.ok ? presence.setBadges({ crystal: steps.crystal }) : r,
          ),
        'rank-clear': () => presence.clearRank(),
        'riot-id-save': () =>
          riotId.save(
            `${shadow.getElementById('riot-name').value}#${shadow.getElementById('riot-tag').value}`,
          ),
      }[e.target.id];

      if (profileAction) {
        const btn = e.target;
        btn.disabled = true;
        const result = await profileAction();
        
        
        try {
          lol = readLol(await lcu.get(CHAT_ME));
        } catch {
          
        }
        paint();
        say(result.ok ? 'Applied' : result.reason, result.ok);
        return;
      }

      if (e.target.id === 'status-clear') {
        statusText = '';
        paint();
        return;
      }
      if (e.target.id !== 'status-save') return;

      const btn = e.target;
      btn.disabled = true;
      const result = await status.write(statusText);
      btn.disabled = false;
      say(
        result.ok
          ? `Status saved · ${describeStatus(statusText)}`
          : `Could not save: ${result.reason}`,
        result.ok,
      );
    });

    content.addEventListener('click', (e) => {
      const row = e.target.closest('[data-setting]');
      if (!row || row.disabled) return;
      const key = row.dataset.setting;
      const previous = settings[key];
      settings = { ...settings, [key]: !previous };
      paint();
      commit({ [key]: settings[key] }, () => {
        settings = { ...settings, [key]: previous };
      });
    });

    
    
    content.addEventListener('input', (e) => {
      if (e.target.id !== 'delay') return;
      shadow.getElementById('delay-value').textContent = formatDelay(Number(e.target.value));
    });

    content.addEventListener('change', (e) => {
      if (e.target.id !== 'delay') return;
      const previous = settings.auto_accept_delay_ms;
      settings = { ...settings, auto_accept_delay_ms: Number(e.target.value) };
      commit({ auto_accept_delay_ms: settings.auto_accept_delay_ms }, () => {
        settings = { ...settings, auto_accept_delay_ms: previous };
      });
    });

    shadow.getElementById('cancel-queue').addEventListener('click', async () => {
      const dock = shadow.getElementById('cancel-dock');
      dock.hidden = true;
      try {
        await lcu.post(DECLINE_ROUTE);
      } catch {
        console.log(TAG, 'could not cancel the queue');
      }
    });

    shadow.getElementById('dodge-champ-select').addEventListener('click', (e) => {
      e.stopPropagation();
      void runDodge(e.currentTarget);
    });

    
    
    
    const INTERACTIVE = '.navitem, .pill, .hextech-btn, .check-row, .champ, .skin, .rank, .close, .select-field, .slider';

    shadow.addEventListener(
      'mouseover',
      (e) => {
        const el = e.target.closest(INTERACTIVE);
        
        
        if (!el || el.disabled) return;
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        const hover = sfxFor(el).hover;
        if (hover) sfx.play(hover);
      },
      true,
    );

    shadow.addEventListener(
      'click',
      (e) => {
        const el = e.target.closest(INTERACTIVE);
        if (!el || el.disabled) return;
        
        
        if (el.classList.contains('slider')) return;
        sfx.play(sfxFor(el).click);
      },
      true,
    );

    shadow.addEventListener(
      'input',
      (e) => {
        const el = e.target.closest('.slider');
        if (!el || el.disabled) return;
        sfx.play(sfxFor(el).click);
      },
      true,
    );

    shadow.getElementById('close').addEventListener('click', () => api.close());
    
    shadow.getElementById('scrim').addEventListener('click', (e) => {
      if (e.target.id === 'scrim') api.close();
    });

    paint();
  }

  return { ...ui, setReadyCheck, setChampSelect };
}
