import { mountUI } from './mount.js';
import { SCREENS, formatHostLabel } from '../app/shell/shellData.js';
import {
  decideOpenMode,
  markOnboardingPatch,
  markWhatsNewSeenPatch,
  TOUR_STEPS,
  applyOpenMode,
  nextTourIndex,
  withOnboardLock,
  runWhatsNewDismiss,
} from './onboarding.js';
import { makeStatus } from '../features/status.js';
import { makeReveal } from '../features/reveal.js';
import { makeDodge } from '../features/dodge.js';
import { makeRestartUx } from '../features/restartUx.js';
import { makeOpener } from '../features/openUrl.js';
import { loadChampions } from '../features/champions.js';
import { makePresence, readLol, CHAT_ME, QUEUES } from '../features/presence.js';
import { makeChallenges } from '../features/challenges.js';
import {
  applyProfileRank,
  profileRankPatch,
  readProfileRank,
} from '../features/profileRank.js';
import { makeRiotId, loadFriends, removeAllFriends } from '../features/profile.js';
import { loadSkins, makeBackground } from '../features/skins.js';
import { makeSfx } from './sfx.js';
import { makeSettingsClient } from './settingsClient.js';
import { makeUpdater } from '../features/update.js';
import { loadConfig } from '../config.js';
import { canCancel, cancelQueue } from '../autoAccept.js';
import { inChampSelect } from './dodgeDock.js';
import { subscribe } from '../subscribe.js';
import { buildTeamRevealSnapshot } from '../features/teamRevealStats.js';
import { makeTeamRevealDom } from './teamRevealDom.js';
import { appliedEffective, createTrayHealth, effectiveFrom, overlayChromePolicy } from '../features/streaming.js';
import { clientBoundsFromWindow, postOverlay } from '../features/overlayBridge.js';
import { makeBuildPanel } from './buildPanel.js';
import { makeProxyFetch } from '../features/proxyFetch.js';
import { makeSummonerIdLoader } from '../features/summonerId.js';
import { startApp } from '../app/main.jsx';
import { createDrakeStore } from '../app/store/createDrakeStore.js';
import { loadLocale } from '../app/i18n/loadLocale.js';

const TAG = '[Drake]';

function readLocalCell(session) {
  const cellId = Number(session?.localPlayerCellId ?? -1);
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  return team.find((p) => Number(p?.cellId) === cellId) || null;
}

function readLocalChampionId(session) {
  return Number(readLocalCell(session)?.championId) || 0;
}

function readLocalPosition(session) {
  const cell = readLocalCell(session);
  return cell?.assignedPosition || cell?.position || '';
}

// ARAM champ select exposes the reroll bench; Summoner's Rift does not.
function isAramSession(session) {
  return Boolean(session?.benchEnabled);
}






export function startUI({
  cfg,
  onSettingsChanged,
  lcu,
  host = 'client',
  mountParent = null,
  reloadConfig = loadConfig,
  onPanelChange,
}) {
  const overlayHost = host === 'overlay';
  let settings = { ...cfg.settings };
  let appVersion = cfg.version || '0.0.0';
  let updateUi = { phase: 'idle' };
  let trayDown = false;
  let streamingToolRunning = !!cfg.streaming_tool_running;
  let desiredEffective = overlayHost
    ? 'overlay'
    : cfg.streaming_effective || effectiveFrom(settings.streaming_mode, streamingToolRunning);
  let streamingEffective = desiredEffective;
  const trayHealth = createTrayHealth();
  let openMode = overlayHost
    ? 'default'
    : decideOpenMode({
        onboardingDone: !!settings.onboarding_done,
        seenVersion: settings.whats_new_seen_version || '',
        currentVersion: appVersion,
      });
  const opened = applyOpenMode(openMode);
  let screen = opened.screen;
  let overlay = overlayHost ? '' : opened.overlay;
  let tourIndex = -1;
  let pendingOnboard = null;
  const onboardLock = { busy: false };
  let shadowRoot = null;
  let dodgeBusy = false;
  let champSelectActive = false;
  let champSelectSession = null;
  let statusText = '';
  let champions = [];
  let teamRevealChamps = [];
  let teamRevealChampsLoading = null;
  let teamRevealDom = null;
  let buildPanel = null;
  const summonerIdLoader = makeSummonerIdLoader({ lcu });
  let teamRevealLastLoadMs = 0;
  let teamRevealLastConcurrency = 1;
  let inGameIdle = false;
  
  const status = makeStatus({ lcu });
  let dodgeStatus = (detail) => console.log(TAG, 'dodge', detail);
  let say = (text, good) => console.log(TAG, text, good ? 'ok' : 'err');
  const dodger = makeDodge({
    onStatus: (detail) => dodgeStatus(detail),
  });
  const restarter = makeRestartUx({ lcu });
  const opener = makeOpener({ port: cfg.port, token: cfg.token });
  const presence = makePresence({ lcu });
  const challenges = makeChallenges({ lcu });
  const riotId = makeRiotId({ lcu });
  let lol = {};
  let friends = [];
  let profileTab = 'rank';
  let skins = [];
  let backgroundId = 0;
  const background = makeBackground({ lcu });
  const sfx = makeSfx();
  
  
  const steps = { 'rank-div': 'I', 'rank-queue': QUEUES[0].id, crystal: 'IRON' };
  let pickedTier = '';

  function syncRankUiFromSettings() {
    const saved = readProfileRank(settings);
    if (!saved.tier) return;
    pickedTier = saved.tier;
    steps['rank-div'] = saved.division;
    steps['rank-queue'] = saved.queue;
    steps.crystal = saved.crystal;
  }

  syncRankUiFromSettings();

  const client = makeSettingsClient({
    port: cfg.port,
    token: cfg.token,
    reloadConfig,
  });
  const updater = makeUpdater({
    port: cfg.port,
    token: cfg.token,
    reloadConfig,
  });

  const legacyActions = {
    navigate: () => {},
    close: () => ui.close(),
    openUrl: (url) => openCreditUrl(url),
    togglePanel: () => ui.toggle(),
    cancelQueue: async () => {
      store.getState().patchChampSelect({ cancelable: false });
      try {
        await cancelQueue(lcu);
      } catch {
        console.log(TAG, 'could not cancel the queue');
      }
    },
  };

  const store = createDrakeStore({ settings, appVersion, settingsClient: client });
  if (__DRAKE_DEV__) window.__drakeStore = store;
  void loadLocale(lcu).then((locale) => store.getState().setLocale(locale));

  function syncStore() {
    store.getState().syncLegacy({
      settings,
      trayDown,
      screen,
      overlay,
      tourIndex,
      updateUi,
      statusText,
      appVersion,
      idle: inGameIdle,
      revealTiming: { lastMs: teamRevealLastLoadMs, lastConcurrency: teamRevealLastConcurrency },
      champions,
      profileTab,
      profileRank: {
        tier: pickedTier || lol.rankedLeagueTier || '',
        division: steps['rank-div'],
        queue: steps['rank-queue'],
        crystal: steps.crystal,
      },
      skins,
      backgroundId,
      friends,
      streaming: { host, effective: streamingEffective },
    });
  }

  function inClientChromeAllowed() {
    if (overlayHost) return true;
    return overlayChromePolicy(streamingEffective).showInClientChrome;
  }

  function revealAllowed() {
    if (overlayHost) return false;
    if (overlayChromePolicy(streamingEffective).forceRevealOff) return false;
    return !!settings.queue_team_reveal_in_client;
  }

  const ui = mountUI({
    doc: document,
    win: window,
    isIdle: () => inGameIdle,
    mountParent: mountParent || undefined,
    hostId: overlayHost ? 'drake-overlay-ui-host' : undefined,
    onToggleIntent: () => {
      if (inClientChromeAllowed()) return true;
      void postOverlay(cfg.port, cfg.token, '/overlay/plugin', { toggle_panel: true }).catch(() => null);
      return false;
    },
    onOpenChange: (open) => {
      store.getState().setPanelOpen(open);
      if (onPanelChange) onPanelChange(open);
      if (!shadowRoot) return;
      if (!open) closeCredits();
    },
    onTeamRevealCardsToggle: () => {
      if (teamRevealDom && revealAllowed()) teamRevealDom.toggleCards('scouting');
    },
    onBuildPanelToggle: () => {
      if (!inClientChromeAllowed()) return;
      if (teamRevealDom) teamRevealDom.toggleCards('build');
      else if (buildPanel) buildPanel.toggle();
    },
    onEscape: () => {
      if (store.getState().ui.escapeLayers > 0) return true;
      if (teamRevealDom && teamRevealDom.isOpen()) {
        teamRevealDom.closeCards();
        return true;
      }
      if (buildPanel && buildPanel.isOpen()) {
        buildPanel.close();
        return true;
      }
      return false;
    },
    onMount: wire,
  });

  function closeCredits() {
    store.getState().setCreditsOpen(false);
  }

  function openCreditUrl(url) {
    if (!url) return;
    void opener.open(url).then((r) => {
      if (!r.ok) say(r.reason, false);
    });
  }
  
  
  
  
  function setReadyCheck(payload) {
    if (inGameIdle) return;
    store.getState().patchChampSelect({ cancelable: canCancel(payload) });
  }

  function replaceSettings(next) {
    settings = { ...settings, ...next };
    syncRankUiFromSettings();
    if (onSettingsChanged) onSettingsChanged(settings);
    syncStore();
  }

  function refreshStreamingEffective() {
    if (overlayHost) return;
    const next = appliedEffective(desiredEffective, trayHealth.reachable());
    if (next === streamingEffective) return;
    const failedOpen = desiredEffective === 'overlay' && next === 'in-client';
    streamingEffective = next;
    applyStreamingPolicy();
    if (failedOpen) say('Streaming overlay is unavailable, so Drake is back in the client.', false);
  }

  function applyStreamingPolicy() {
    syncStore();
    if (overlayHost) return;
    const hostEl = ui.host?.();
    const allowed = inClientChromeAllowed();
    if (!allowed) ui.close();
    if (hostEl) {
      hostEl.style.visibility = allowed ? '' : 'hidden';
      if (allowed) hostEl.removeAttribute('data-drake-overlay-mode');
      else hostEl.setAttribute('data-drake-overlay-mode', '1');
    }
    if (teamRevealDom) teamRevealDom.setEnabled(!inGameIdle && revealAllowed());
    void pushOverlayPluginState();
  }

  async function pushOverlayPluginState() {
    if (overlayHost || desiredEffective !== 'overlay') return;
    const { champSelect } = store.getState();
    const result = await postOverlay(cfg.port, cfg.token, '/overlay/plugin', {
      ready_check: !inGameIdle && !!champSelect.cancelable,
      dodge: !inGameIdle && !!champSelect.active && settings.queue_dodge_in_client !== false,
      bounds: clientBoundsFromWindow(window),
    }).catch(() => null);
    trayHealth.record(result !== null);
    refreshStreamingEffective();
  }

  async function drainOverlayActions() {
    if (overlayHost || streamingEffective !== 'overlay') return;
    const res = await postOverlay(cfg.port, cfg.token, '/overlay/drain', {}).catch(() => null);
    const actions = res?.actions || [];
    for (const action of actions) {
      if (action === 'cancel') await legacyActions.cancelQueue();
      else if (action === 'dodge') await runDodge();
    }
    if (actions.length) await pushOverlayPluginState();
  }

  async function pollStreaming() {
    const next = await reloadConfig();
    if (!next) return;
    streamingToolRunning = !!next.streaming_tool_running;
    if (streamingEffective === 'overlay' && next.settings) {
      const merged = { ...settings, ...next.settings };
      if (JSON.stringify(merged) !== JSON.stringify(settings)) {
        settings = merged;
        syncRankUiFromSettings();
        if (onSettingsChanged) onSettingsChanged(settings);
        syncStore();
      }
    }
    desiredEffective =
      next.streaming_effective || effectiveFrom(settings.streaming_mode, streamingToolRunning);
    refreshStreamingEffective();
  }

  function setIdle(next) {
    if (next === inGameIdle) return;
    inGameIdle = next;
    syncStore();
    if (inGameIdle) {
      ui.close();
      champSelectActive = false;
      champSelectSession = null;
      store.getState().resetChampSelect();
      if (teamRevealDom) {
        void teamRevealDom.handleSession(null);
        teamRevealDom.setEnabled(false);
      }
      feedBuildPanel(null);
      return;
    }
    if (teamRevealDom) teamRevealDom.setEnabled(revealAllowed());
  }

  // Champion names are shared with team reveal, but the build panel must not
  // depend on that feature being enabled - either caller may kick the load off.
  function ensureChampNames() {
    if (teamRevealChamps.length) return Promise.resolve(teamRevealChamps);
    if (!teamRevealChampsLoading) {
      teamRevealChampsLoading = loadChampions(lcu)
        .then((list) => {
          teamRevealChamps = Array.isArray(list) ? list : [];
          teamRevealChampsLoading = null;
          return teamRevealChamps;
        })
        .catch((err) => {
          console.log(TAG, 'could not load champion names -', err?.message || err);
          teamRevealChampsLoading = null;
          return [];
        });
    }
    return teamRevealChampsLoading;
  }

  function feedBuildPanel(session) {
    if (!buildPanel) return;
    const active = inChampSelect(session);
    if (!active) {
      buildPanel.setSession({ championId: 0, position: '', mode: 'ranked' });
      buildPanel.close();
      return;
    }
    // Both of these are cheap no-ops once they have succeeded, and champ select
    // is the first moment the client is reliably logged in and answering.
    void summonerIdLoader.load();
    const payload = {
      championId: readLocalChampionId(session),
      position: readLocalPosition(session),
      mode: isAramSession(session) ? 'aram' : 'ranked',
    };
    buildPanel.setSession(payload);
    if (payload.championId && !teamRevealChamps.length) {
      // Re-feed once the names land so the header and the leaderboard query
      // pick up the real champion name instead of an empty string.
      void ensureChampNames().then(() => {
        if (buildPanel) buildPanel.setSession(payload);
      });
    }
  }

  function setChampSelect(session) {
    if (inGameIdle) return;
    champSelectSession = session;
    champSelectActive = inChampSelect(session);
    store.getState().patchChampSelect({ active: champSelectActive });
    if (!shadowRoot) return;
    if (teamRevealDom) void teamRevealDom.handleSession(session);
    feedBuildPanel(session);
  }

  async function runDodge() {
    if (dodgeBusy) {
      console.log(TAG, 'dodge ignored', { dodgeBusy });
      return { ok: false, busy: true, reason: '' };
    }
    dodgeBusy = true;
    store.getState().patchChampSelect({ dodge: 'busy' });
    say('Dodging…', true);
    try {
      const result = await dodger.dodge();
      console.log(TAG, 'dodge result', result);
      const msg = result.ok
        ? `Dodged champ select${result.detail ? ` (${result.detail})` : ''}`
        : result.reason;
      say(msg, result.ok);
      store.getState().patchChampSelect({ dodge: result.ok ? 'done' : 'failed' });
      return result;
    } finally {
      dodgeBusy = false;
      window.setTimeout(() => store.getState().patchChampSelect({ dodge: 'idle' }), 2500);
    }
  }

  function wire(shadow, api) {
    shadowRoot = shadow;
    startApp(shadow, { sfx, store, actions: legacyActions });

    function sayUi(text, good) {
      store.getState().setStatusLine({ text, tone: good ? 'good' : 'bad' });
    }

    say = sayUi;
    dodgeStatus = (detail) => {
      sayUi(detail, true);
      console.log(TAG, 'dodge', detail);
    };

    store.getState().setSession({
      hostLabel: formatHostLabel({
        appVersion,
        loaderVersion: typeof Pengu !== 'undefined' && Pengu.version ? Pengu.version : '',
      }),
    });
    const proxyFetch = makeProxyFetch({
      port: cfg.port,
      token: cfg.token,
      fetchImpl: fetch,
    });

    buildPanel = makeBuildPanel({
      lcu,
      fetchFn: proxyFetch,
      getChampName: (id) => teamRevealChamps.find((c) => c.id === id)?.name || '',
      getSettings: () => settings,
      saveSettings: (patch) => client.save(patch),
      getSummonerId: () => summonerIdLoader.get(),
    });
    void summonerIdLoader.load();

    buildPanel.onUpdate(() => store.getState().setBuild(buildPanel.getSnapshot()));
    store.getState().setBuild(buildPanel.getSnapshot());
    teamRevealDom = makeTeamRevealDom({
      publishView: (view) => store.getState().setTeamReveal(view),
      doc: document,
      subscribe,
      lcu,
      buildPanel,
      getChampName: (id) => teamRevealChamps.find((c) => c.id === id)?.name || '',
      getRecentPool: () => settings.queue_team_reveal_recent_pool || 'ranked_both',
      getShowMapSide: () => settings.queue_show_map_side !== false,
      getAutoMute: () => !!settings.queue_mute_all_in_client,
      getAutoMessage: () => settings.queue_auto_message || '',
      onRevealTiming: ({ durationMs }) => {
        teamRevealLastLoadMs = durationMs;
        teamRevealLastConcurrency = Number(settings.queue_team_reveal_fetch_concurrency) || 1;
        if (screen === 'queue') paint();
      },
      loadSnapshot: async (session, hooks) => {
        await ensureChampNames();
        return buildTeamRevealSnapshot({
          session,
          lcu,
          fetchImpl: proxyFetch,
          onProgress: hooks?.onProgress,
          signal: hooks?.signal,
          sampleSize: settings.queue_team_reveal_sample_size,
          recentPool: settings.queue_team_reveal_recent_pool,
          last5Pool: settings.queue_team_reveal_last5_pool,
          fetchConcurrency: settings.queue_team_reveal_fetch_concurrency,
        });
      },
    });
    teamRevealDom.setEnabled(revealAllowed());

    if (champSelectSession) void teamRevealDom.handleSession(champSelectSession);
    feedBuildPanel(champSelectSession);

    function paint() {
      syncStore();
      store.getState().setStatusLine(null);
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
      const payload = pendingOnboard ? { ...pendingOnboard, ...patch } : patch;
      const result = await client.save(payload);
      if (result.ok) {
        trayDown = false;
        settings = { ...settings, ...payload };
        pendingOnboard = null;
        if (onSettingsChanged) onSettingsChanged(settings);
        return { ok: true };
      }
      revert();
      trayDown = result.reason.includes('not running');
      paint();
      store.getState().setStatusLine({ text: result.reason, tone: 'bad' });
      console.log(TAG, 'could not save -', result.reason);
      return { ok: false, reason: result.reason };
    }

    async function goToScreen(next) {
      screen = next;
      if (screen === 'status') statusText = await status.read();
      if ((screen === 'auto-pick' || screen === 'auto-ban') && champions.length === 0) {
        champions = await loadChampions(lcu);
      }
      if (screen === 'profile') {
        if (settings.profile_rank_tier) {
          syncRankUiFromSettings();
        } else {
          try {
            lol = readLol(await lcu.get(CHAT_ME));
          } catch {
            lol = {};
          }
          pickedTier = lol.rankedLeagueTier || '';
          if (lol.rankedLeagueDivision) steps['rank-div'] = lol.rankedLeagueDivision;
          if (lol.rankedLeagueQueue) steps['rank-queue'] = lol.rankedLeagueQueue;
          if (lol.challengeCrystalLevel) steps.crystal = lol.challengeCrystalLevel;
        }
        if (profileTab === 'banner' && skins.length === 0) skins = await loadSkins(lcu);
      }
      if (screen === 'friends') friends = await loadFriends(lcu);
      if (screen === 'settings' && overlay !== 'tour' && updateUi.phase === 'idle') runUpdateCheck();
    }

    async function commitOnboard(patch) {
      settings = { ...settings, ...patch };
      pendingOnboard = { ...pendingOnboard, ...patch };
      paint();
      return commit(patch, () => {});
    }

    async function finishOnboarding(startTour) {
      openMode = 'default';
      if (startTour) {
        tourIndex = 0;
        overlay = 'tour';
        screen = TOUR_STEPS[0].screen;
      } else {
        tourIndex = -1;
        overlay = '';
        screen = 'auto-accept';
      }
      paint();
      await goToScreen(screen);
      await commitOnboard(markOnboardingPatch(appVersion));
    }

    async function stepTour() {
      tourIndex = nextTourIndex(tourIndex, TOUR_STEPS.length);
      if (tourIndex < 0) {
        overlay = '';
        screen = 'auto-accept';
      } else {
        overlay = 'tour';
        screen = TOUR_STEPS[tourIndex].screen;
      }
      paint();
      await goToScreen(screen);
      paint();
    }

    async function dismissWhatsNew(target) {
      openMode = 'default';
      await runWhatsNewDismiss(target, SCREENS, {
        mark: () => commitOnboard(markWhatsNewSeenPatch(appVersion)),
        go: async (next) => {
          await goToScreen(next);
          paint();
        },
      });
    }

    async function handleOnboard(action) {
      await withOnboardLock(onboardLock, async () => {
        if (action === 'skip') {
          await finishOnboarding(false);
          return;
        }
        if (action === 'tour') {
          await finishOnboarding(true);
          return;
        }
        if (action === 'tour-next') {
          await stepTour();
        }
      });
    }

    legacyActions.navigate = async (id) => {
      await goToScreen(id);
      paint();
    };

    function applySettingSideEffects(keys) {
      if (keys.includes('queue_team_reveal_in_client') && teamRevealDom) {
        teamRevealDom.setEnabled(revealAllowed());
      }
      if (keys.includes('streaming_mode') && !overlayHost) {
        desiredEffective = effectiveFrom(settings.streaming_mode, streamingToolRunning);
        refreshStreamingEffective();
      }
    }

    function applySettingsPatch(patch) {
      const keys = Object.keys(patch);
      const previous = Object.fromEntries(keys.map((key) => [key, settings[key]]));
      settings = { ...settings, ...patch };
      applySettingSideEffects(keys);
      paint();
      return commit(patch, () => {
        settings = { ...settings, ...previous };
        applySettingSideEffects(keys);
      });
    }

    async function revealLobby(providerId) {
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
      return reveal.reveal(providerId);
    }

    async function installUpdate() {
      const result = await updater.apply();
      if (!result.ok) {
        trayDown = result.reason.includes('not running');
        updateUi = { phase: 'error', message: result.reason };
        paint();
      }
      return result;
    }

    Object.assign(legacyActions, {
      setSettings: applySettingsPatch,
      saveStatus: (text) => status.write(text),
      revealLobby,
      dodge: () => runDodge(),
      checkUpdates: () => runUpdateCheck(),
      installUpdate,
      restartClient: () => restarter.restart(),
    });

    async function saveRankFromState() {
      const tier = pickedTier || lol.rankedLeagueTier || 'GOLD';
      const patch = profileRankPatch({
        tier,
        division: steps['rank-div'],
        queue: steps['rank-queue'],
        crystal: steps.crystal,
      });
      const previous = {
        profile_rank_tier: settings.profile_rank_tier,
        profile_rank_division: settings.profile_rank_division,
        profile_rank_queue: settings.profile_rank_queue,
        profile_rank_crystal: settings.profile_rank_crystal,
      };
      settings = { ...settings, ...patch };
      const saved = await commit(patch, () => {
        settings = { ...settings, ...previous };
      });
      if (!saved.ok) return saved;
      return applyProfileRank(presence, readProfileRank(settings));
    }

    async function clearRankState() {
      const patch = profileRankPatch({
        tier: '',
        division: 'I',
        queue: QUEUES[0].id,
        crystal: 'IRON',
      });
      const previous = {
        profile_rank_tier: settings.profile_rank_tier,
        profile_rank_division: settings.profile_rank_division,
        profile_rank_queue: settings.profile_rank_queue,
        profile_rank_crystal: settings.profile_rank_crystal,
      };
      settings = { ...settings, ...patch };
      pickedTier = '';
      steps['rank-div'] = 'I';
      steps['rank-queue'] = QUEUES[0].id;
      steps.crystal = 'IRON';
      const saved = await commit(patch, () => {
        settings = { ...settings, ...previous };
      });
      if (!saved.ok) return saved;
      return presence.clearRank();
    }

    async function runProfileAction(action) {
      const result = await action();
      try {
        lol = readLol(await lcu.get(CHAT_ME));
      } catch {
      }
      paint();
      return result;
    }

    async function selectProfileTab(tab) {
      profileTab = tab;
      if (profileTab === 'banner' && skins.length === 0) skins = await loadSkins(lcu);
      paint();
    }

    Object.assign(legacyActions, {
      selectProfileTab,
      applyProfileRank: (draft) => {
        pickedTier = draft.tier;
        steps['rank-div'] = draft.division;
        steps['rank-queue'] = draft.queue;
        steps.crystal = draft.crystal;
        return runProfileAction(saveRankFromState);
      },
      resetProfileRank: () => runProfileAction(clearRankState),
      removeBadges: () => runProfileAction(() => challenges.removeBadges()),
      cloneBadge: () => runProfileAction(() => challenges.cloneFirstBadge()),
      saveRiotId: (raw) => runProfileAction(() => riotId.save(raw)),
      setBackground: (id) => {
        backgroundId = id;
        paint();
        return background.set(id);
      },
      removeAllFriends: async () => {
        const result = await removeAllFriends({ lcu, friends });
        friends = await loadFriends(lcu);
        paint();
        return result;
      },
    });

    Object.assign(legacyActions, {
      onboard: (action) => handleOnboard(action),
      dismissWhatsNew: (target) => withOnboardLock(onboardLock, () => dismissWhatsNew(target)),
    });

    Object.assign(legacyActions, {
      openScouting: () => teamRevealDom?.openCards(),
      closeScouting: () => teamRevealDom?.closeCards(),
      setScoutingTab: (tab) => teamRevealDom?.setActiveTab(tab),
      muteScouting: () => teamRevealDom?.muteAll(),
    });

    Object.assign(legacyActions, {
      loadBuild: () => buildPanel?.loadBuild(),
      setBuildTier: (value) => buildPanel?.setTier(value),
      setBuildRegion: (value) => buildPanel?.setRegion(value),
      retryBuild: () => buildPanel?.retry(),
      showAllRanks: () => buildPanel?.showAllRanks(),
      viewPlayerBuild: (riotId, region) => buildPanel?.viewPlayer(riotId, region),
      clearPlayerBuild: () => buildPanel?.clearPlayer(),
      applyBuildRunes: (index) => buildPanel?.applyRunes(index),
      applyBuildSpells: (index) => buildPanel?.applySpells(index),
      applyBuildItems: () => buildPanel?.applyItems(),
    });

    paint();
    applyStreamingPolicy();
    if (!overlayHost) {
      window.setInterval(() => {
        void pollStreaming().catch(() => {});
        void pushOverlayPluginState();
        void drainOverlayActions();
      }, 750);
    }
  }

  return { ...ui, setReadyCheck, setChampSelect, setIdle, replaceSettings, store, actions: legacyActions };
}
