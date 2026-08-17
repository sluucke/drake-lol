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
import { loadConfig } from '../config.js';
import { canCancel, DECLINE_ROUTE } from '../autoAccept.js';

const TAG = '[Drake]';

// Mirrors configd::MAX_ACCEPT_DELAY_MS. The server clamps regardless -- this
// only stops the slider offering a value the tray would refuse.
export const MAX_DELAY_MS = 8000;

/// Wires the overlay to the tray.
///
/// Reads come from config.json (the tray rewrites it every tick, so it is
/// always the current view), writes go through configd. Asymmetric on purpose:
/// it keeps the tray as the single source of truth and avoids a second read
/// path that could disagree with the first.
export function startUI({ cfg, onSettingsChanged, lcu }) {
  let settings = { ...cfg.settings };
  let trayDown = false;
  let screen = 'auto-accept';
  let shadowRoot = null;
  let statusText = '';
  let provider = 'porofessor';
  let champions = [];
  // One query per picker, so searching on Auto Pick does not filter Auto Ban.
  const queries = {
    auto_pick_champion_id: '',
    auto_pick_champion_id_2: '',
    auto_ban_champion_id: '',
    skins: '',
  };
  const status = makeStatus({ lcu });
  const dodger = makeDodge({ lcu });
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
  // Stepper values live here rather than in the DOM: the screen is
  // re-rendered on every change, so anything held only in markup is lost.
  const steps = { 'rank-div': 'I', 'rank-queue': QUEUES[0].id, crystal: 'IRON' };
  let pickedTier = '';

  const client = makeSettingsClient({
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

  /// Shows or hides the cancel button. Driven by ready-check state from the
  /// LCU, so it appears only in the one moment it is useful: the check is up
  /// and the player has already accepted. Before accepting, the client's own
  /// Decline button is right there.
  function setReadyCheck(payload) {
    if (!shadowRoot) return;
    shadowRoot.getElementById('cancel-dock').hidden = !canCancel(payload);
  }

  function wire(shadow, api) {
    shadowRoot = shadow;
    const content = shadow.getElementById('content');
    const statusEl = shadow.getElementById('status');

    shadow.getElementById('scrim').style.display = 'none';
    shadow.getElementById('host-label').textContent =
      typeof Pengu !== 'undefined' && Pengu.version ? `loader ${Pengu.version}` : 'in client';

    function paint() {
      if (screen === 'settings') {
        content.innerHTML = renderSettings(settings, { disabled: trayDown });
      } else if (screen === 'auto-pick') {
        content.innerHTML = renderAutoPick(settings, {
          disabled: trayDown,
          list: searchChampions(champions, queries.auto_pick_champion_id),
          query: queries.auto_pick_champion_id,
          list2: searchChampions(champions, queries.auto_pick_champion_id_2),
          query2: queries.auto_pick_champion_id_2,
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

    /// Optimistic, then reconciled: a control must feel instant, but it must
    /// never end up showing a value the tray did not accept.
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

    // Mirrors .status-box's min-height / max-height in the stylesheet.
    const BOX = { min: 120, max: Math.round(window.innerHeight * 0.46) };
    // Size of the resize grip's hit area, in px from the bottom-right corner.
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
      // Read the live status each time the screen is opened, so it reflects
      // anything set elsewhere (the client's own field, or another tool)
      // rather than a stale copy from when the panel was built.
      if (screen === 'status') statusText = await status.read();
      // Loaded on first use rather than at boot: 236 icons are only worth
      // fetching for someone who opens a picker.
      if ((screen === 'auto-pick' || screen === 'auto-ban') && champions.length === 0) {
        champions = await loadChampions(lcu);
      }
      // Both are re-read every time: presence and the friends list change
      // constantly outside Drake, so a cached copy would show stale values.
      if (screen === 'profile') {
        try {
          lol = readLol(await lcu.get(CHAT_ME));
        } catch {
          lol = {};
        }
        // Seed the steppers from what the client currently broadcasts, so
        // Apply does not silently overwrite fields the user never touched.
        pickedTier = lol.rankedLeagueTier || '';
        if (lol.rankedLeagueDivision) steps['rank-div'] = lol.rankedLeagueDivision;
        if (lol.rankedLeagueQueue) steps['rank-queue'] = lol.rankedLeagueQueue;
        if (lol.challengeCrystalLevel) steps.crystal = lol.challengeCrystalLevel;
        if (profileTab === 'banner' && skins.length === 0) skins = await loadSkins(lcu);
      }
      if (screen === 'friends') friends = await loadFriends(lcu);
      paint();
    });

    content.addEventListener('input', (e) => {
      if (e.target.id !== 'status-text') return;
      statusText = e.target.value;
      updateCount();
    });

    // Dragging the grip is a mousedown on the textarea itself (the resizer is
    // part of the element, not a child), so this is the one signal available
    // without watching every resize. From here on the user's height wins.
    content.addEventListener('mousedown', (e) => {
      const box = e.target;
      if (box.id !== 'status-text') return;
      const inGrip =
        e.offsetX > box.clientWidth - GRIP && e.offsetY > box.clientHeight - GRIP;
      if (inGrip) markManual(box);
    });

    function say(text, good) {
      statusEl.textContent = text;
      statusEl.className = good ? 'status-good' : 'status-bad';
    }

    /// Updates ONLY the tiles inside the scroll container.
    ///
    /// The earlier version repainted the whole screen on every scroll event
    /// and then wrote scrollTop back. That destroys and rebuilds the element
    /// being scrolled, so the browser's own scrolling fights the restore --
    /// which is exactly the flicker and the runaway jumping when dragging the
    /// scrollbar. The container and the spacer now stay put for the life of
    /// the tab; only the grid's children and its translateY change.
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
        // One update per frame: scroll fires far faster than the client can
        // paint, and rebuilding the tiles on every event is what makes a drag
        // feel like it is dropping frames.
        if (skinFrame) return;
        skinFrame = requestAnimationFrame(() => {
          skinFrame = 0;
          updateSkinGrid();
        });
      },
      true,
    );

    content.addEventListener('change', (e) => {
      // The <select> keeps its own value, but paint() rebuilds the markup and
      // would reset it. `steps` is what the next render reads from.
      if (e.target.id in steps) {
        steps[e.target.id] = e.target.value;
      }
    });

    // Search filters as you type. Repainting replaces the input, so focus and
    // caret have to be restored or typing a second character loses the field.
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
        const previous = settings[key];
        // Clicking the selected champion clears it, which is the only way to
        // undo a choice without a separate "none" control.
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
        // The region comes from the client rather than a stored setting: it is
        // the one this account is actually playing on, and both sites need it
        // in the path.
        let region = '';
        try {
          region = (await lcu.get('/riotclient/region-locale')).region || '';
        } catch {
          // Leaves region empty; the reveal below still reports a clear reason.
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

      if (e.target.id === 'dodge') {
        const btn = e.target;
        btn.disabled = true;
        const result = await dodger.dodge();
        btn.disabled = false;
        say(result.ok ? 'Dodged champ select' : result.reason, result.ok);
        return;
      }

      if (e.target.id === 'restart-client') {
        const btn = e.target;
        btn.disabled = true;
        const result = await restarter.restart();
        // On success the UI process dies, so this often never paints.
        btn.disabled = false;
        say(result.ok ? 'Restarting the client…' : result.reason, result.ok);
        return;
      }

      // --- Profile: sub-tabs, rank tiles, steppers, skins ---
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
        // Two presses, not a dialog: the first arms it and says what will
        // happen, so nobody wipes their list with a stray click.
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
            // The crystal lives on the same screen, so Apply writes both --
            // two round trips would let one succeed and the other fail.
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
        // Re-read rather than assume: the client can normalise or ignore a
        // field, and the panel must show what it actually holds now.
        try {
          lol = readLol(await lcu.get(CHAT_ME));
        } catch {
          // Leaves the previous view in place, which is better than blanking it.
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

    // Live label while dragging; the value is only sent on release, so a drag
    // across the track does not fire a request per step.
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

    // Sound is wired once on the shadow root rather than per control: the
    // screens are re-rendered constantly, so per-element listeners would be
    // lost on every repaint and have to be re-attached.
    const INTERACTIVE = '.navitem, .pill, .hextech-btn, .check-row, .champ, .skin, .rank, .close, .select-field, .slider';

    shadow.addEventListener(
      'mouseover',
      (e) => {
        const el = e.target.closest(INTERACTIVE);
        // mouseover fires again for children; only sound the entry into the
        // control itself, or a hover across a label would chatter.
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
        // Range inputs tick on `input` while dragging; a click at the end
        // would double-play the last step.
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
    // Clicking the dimmed backdrop closes, the way the client's own modals do.
    shadow.getElementById('scrim').addEventListener('click', (e) => {
      if (e.target.id === 'scrim') api.close();
    });

    paint();
  }

  return { ...ui, setReadyCheck };
}
