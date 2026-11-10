import { mountUI } from './mount';
import { SCREENS, formatHostLabel } from '../app/shell/shellData';
import {
  decideOpenMode,
  markOnboardingPatch,
  markWhatsNewSeenPatch,
  TOUR_STEPS,
  applyOpenMode,
  nextTourIndex,
  withOnboardLock,
  runWhatsNewDismiss,
} from './onboarding';
import { makeStatus } from '../features/status';
import { makeReveal } from '../features/reveal';
import { makeDodge } from '../features/dodge';
import { makeRestartUx } from '../features/restartUx';
import { makeOpener } from '../features/openUrl';
import { loadChampions } from '../features/champions';
import { makeLootService } from '../features/loot';
import { makePresence, readLol, CHAT_ME, QUEUES } from '../features/presence';
import { makeChallenges } from '../features/challenges';
import {
  applyProfileRank,
  profileRankPatch,
  readProfileRank,
} from '../features/profileRank';
import { makeRiotId, loadFriends, removeAllFriends } from '../features/profile';
import { loadSkins, makeBackground } from '../features/skins';
import { makeSfx } from './sfx';
import { makeSettingsClient } from './settingsClient';
import { makeUpdater } from '../features/update';
import { waitForNewTray } from '../features/updateHandoff';
import { loadConfig } from '../config';
import { canCancel, cancelQueue } from '../autoAccept';
import { inChampSelect } from './dodgeDock';
import { subscribe } from '../subscribe';
import { buildTeamRevealSnapshot } from '../features/teamRevealStats';
import { makeTeamRevealDom } from './teamRevealDom';
import { appliedEffective, createTrayHealth, effectiveFrom, overlayChromePolicy } from '../features/streaming';
import { clientBoundsFromWindow, postOverlay } from '../features/overlayBridge';
import { makeBuildPanel } from './buildPanel';
import { makeProxyFetch } from '../features/proxyFetch';
import { makeSummonerIdLoader } from '../features/summonerId';
import { startApp } from '../app/main';
import { createDrakeStore } from '../app/store/createDrakeStore';
import { loadLocale } from '../app/i18n/loadLocale';
import type { Lcu } from '../lcu';
import type { PluginConfig, SettingsPatch, SettingsValues } from '../settings';
import type { SubscribeFn } from '../subscribe';
import type { ReadyCheckPayload } from '../autoAccept';
import type { Champion } from '../features/champions';
import type { ChatMeResponse, LolPresence, ActionResult } from '../features/presence';
import type { Friend } from '../features/profile';
import type { SkinTile } from '../features/skins';
import type { StreamingEffective } from '../features/streaming';
import type { UpdateStatusBody } from '../features/update';
import type { RevealPlayer, RevealSession } from '../features/teamRevealStats';
import type { DrakeStore } from '../app/store/types';
import type {
  RequiredUpdate,
  StreamingHost,
  UpdateUiState,
} from '../app/store/sessionSlice';
import type { DodgeActionResult, LegacyActions, OnboardAction } from '../app/shell/LegacyActions';
import type { MountedUI } from './mount';
import type { OpenMode } from './onboarding';
import type { TeamRevealDom } from './teamRevealDom';
import type { BuildPanel } from './buildPanel';

const TAG = '[Drake]';

type UiChampSession = RevealSession & { benchEnabled?: boolean };

export type StartUIConfig = Pick<PluginConfig, 'port' | 'token' | 'settings'> &
  Partial<Pick<PluginConfig, 'version' | 'streaming_effective' | 'streaming_tool_running'>>;

export interface StartUIOptions {
  cfg: StartUIConfig;
  onSettingsChanged?: ((settings: SettingsValues) => void) | null;
  lcu: Lcu;
  host?: StreamingHost;
  mountParent?: Element | null;
  reloadConfig?: () => Promise<PluginConfig | null | undefined>;
  onPanelChange?: ((open: boolean) => void) | null;
  onUpdateRequired?: ((version: string) => void) | null;
  subscribeImpl?: SubscribeFn;
}

interface RankSteps {
  'rank-div': string;
  'rank-queue': string;
  crystal: string;
}

function readLocalCell(session: UiChampSession | null | undefined): RevealPlayer | null {
  const cellId = Number(session?.localPlayerCellId ?? -1);
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  return team.find((p) => Number(p?.cellId) === cellId) || null;
}

function readLocalChampionId(session: UiChampSession | null | undefined): number {
  return Number(readLocalCell(session)?.championId) || 0;
}

function readLocalPosition(session: UiChampSession | null | undefined): string {
  const cell = readLocalCell(session);
  return cell?.assignedPosition || cell?.position || '';
}

// ARAM champ select exposes the reroll bench; Summoner's Rift does not.
function isAramSession(session: UiChampSession | null | undefined): boolean {
  return Boolean(session?.benchEnabled);
}






const REQUIRED_UPDATE_FIRST_CHECK_MS = 5000;
const REQUIRED_UPDATE_CHECK_MS = 30 * 60 * 1000;

export function startUI({
  cfg,
  onSettingsChanged,
  lcu,
  host = 'client',
  mountParent = null,
  reloadConfig = loadConfig,
  onPanelChange,
  onUpdateRequired,
  subscribeImpl = subscribe,
}: StartUIOptions) {
  const overlayHost = host === 'overlay';
  let settings: SettingsValues = { ...cfg.settings };
  let appVersion = cfg.version || '0.0.0';
  let updateUi: UpdateUiState = { phase: 'idle' };
  let trayDown = false;
  let streamingToolRunning = !!cfg.streaming_tool_running;
  let desiredEffective: StreamingEffective = overlayHost
    ? 'overlay'
    : cfg.streaming_effective || effectiveFrom(settings.streaming_mode, streamingToolRunning);
  let streamingEffective: StreamingEffective = desiredEffective;
  const trayHealth = createTrayHealth();
  let panelApi: MountedUI | null = null;
  let openMode: OpenMode = overlayHost
    ? 'default'
    : decideOpenMode({
        onboardingDone: !!settings.onboarding_done,
        seenVersion: settings.whats_new_seen_version || '',
        currentVersion: appVersion,
      });
  const opened = applyOpenMode(openMode);
  let screen = opened.screen;
  let overlay: string = overlayHost ? '' : opened.overlay;
  let tourIndex = -1;
  let pendingOnboard: SettingsPatch | null = null;
  const onboardLock = { busy: false };
  let shadowRoot: ShadowRoot | null = null;
  let dodgeBusy = false;
  let champSelectActive = false;
  let champSelectSession: unknown = null;
  let statusText = '';
  let champions: Champion[] = [];
  let teamRevealChamps: Champion[] = [];
  let teamRevealChampsLoading: Promise<Champion[]> | null = null;
  let teamRevealDom: TeamRevealDom | null = null;
  let buildPanel: BuildPanel | null = null;
  const summonerIdLoader = makeSummonerIdLoader({ lcu });
  let teamRevealLastLoadMs = 0;
  let teamRevealLastConcurrency = 1;
  let inGameIdle = false;
  
  const status = makeStatus({ lcu });
  let dodgeStatus = (detail: string) => console.log(TAG, 'dodge', detail);
  let say = (text: string | undefined, good: boolean) => console.log(TAG, text, good ? 'ok' : 'err');
  const dodger = makeDodge({
    onStatus: (detail) => dodgeStatus(detail),
  });
  const restarter = makeRestartUx({ lcu });
  const opener = makeOpener({ port: cfg.port, token: cfg.token });
  const presence = makePresence({ lcu });
  const challenges = makeChallenges({ lcu });
  const riotId = makeRiotId({ lcu });
  let lol: LolPresence = {};
  let friends: Friend[] = [];
  let profileTab = 'rank';
  let skins: SkinTile[] = [];
  let backgroundId = 0;
  const background = makeBackground({ lcu });
  const loot = makeLootService({ lcu });
  const sfx = makeSfx();
  
  
  const steps: RankSteps = { 'rank-div': 'I', 'rank-queue': QUEUES[0].id, crystal: 'IRON' };
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

  const baseActions: Partial<LegacyActions> = {
    navigate: () => {},
    close: () => ui.close(),
    openUrl: (url: string) => openCreditUrl(url),
    togglePanel: () => ui.toggle(),
    cancelQueue: async () => {
      store.getState().patchChampSelect({ cancelable: false });
      try {
        await cancelQueue(lcu);
      } catch {
        console.log(TAG, 'could not cancel the queue');
      }
    },
    loadLoot: () => loot.load(),
    disenchantLoot: (plan, options) => loot.disenchant(plan, options),
  };
  const legacyActions = baseActions as LegacyActions;

  const store = createDrakeStore({ settings, appVersion, settingsClient: client });
  if (__DRAKE_DEV__) (window as Window & { __drakeStore?: DrakeStore }).__drakeStore = store;
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
    if (overlayHost) return !!settings.queue_team_reveal_in_client;
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
      if (!inClientChromeAllowed()) {
        forwardView('scouting');
        return;
      }
      if (teamRevealDom && revealAllowed()) teamRevealDom.toggleCards('scouting');
    },
    onBuildPanelToggle: () => {
      if (!inClientChromeAllowed()) {
        forwardView('build');
        return;
      }
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

  function openCreditUrl(url: string) {
    if (!url) return;
    void opener.open(url).then((r) => {
      if (!r.ok) say(r.reason, false);
    });
  }
  
  
  
  
  function setReadyCheck(payload: ReadyCheckPayload | null | undefined) {
    if (inGameIdle) return;
    store.getState().patchChampSelect({ cancelable: canCancel(payload) });
  }

  function replaceSettings(next: SettingsValues) {
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
    const panel = panelApi || ui;
    const hostEl = panel.host?.();
    const allowed = inClientChromeAllowed();
    if (!allowed) panel.close();
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

  function forwardView(view: string) {
    void postOverlay(cfg.port, cfg.token, '/overlay/plugin', { open_view: view }).catch(() => null);
  }

  function toggleView(view: string) {
    if (!teamRevealDom || !revealAllowed()) return;
    teamRevealDom.toggleCards(view === 'build' ? 'build' : 'scouting');
  }

  function setIdle(next: boolean) {
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
  function ensureChampNames(): Promise<Champion[]> {
    if (teamRevealChamps.length) return Promise.resolve(teamRevealChamps);
    if (!teamRevealChampsLoading) {
      teamRevealChampsLoading = loadChampions(lcu)
        .then((list) => {
          teamRevealChamps = Array.isArray(list) ? list : [];
          teamRevealChampsLoading = null;
          return teamRevealChamps;
        })
        .catch((err) => {
          console.log(TAG, 'could not load champion names -', (err as Error | null)?.message || err);
          teamRevealChampsLoading = null;
          return [];
        });
    }
    return teamRevealChampsLoading;
  }

  function feedBuildPanel(session: unknown) {
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
    const payload: { championId: number; position: string; mode: 'aram' | 'ranked' } = {
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

  function setChampSelect(session: unknown) {
    if (inGameIdle) return;
    champSelectSession = session;
    champSelectActive = inChampSelect(session);
    store.getState().patchChampSelect({ active: champSelectActive });
    if (!shadowRoot) return;
    if (teamRevealDom) void teamRevealDom.handleSession(session);
    feedBuildPanel(session);
  }

  async function runDodge(): Promise<DodgeActionResult> {
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

  function wire(shadow: ShadowRoot, api: MountedUI) {
    panelApi = api;
    shadowRoot = shadow;
    startApp(shadow, { sfx, store, actions: legacyActions });

    function sayUi(text: string | undefined, good: boolean) {
      store.getState().setStatusLine({ text: text ?? '', tone: good ? 'good' : 'bad' });
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

    const panel = makeBuildPanel({
      lcu,
      fetchFn: proxyFetch,
      getChampName: (id) => teamRevealChamps.find((c) => c.id === id)?.name || '',
      getSettings: () => settings,
      saveSettings: (patch) => client.save(patch),
      getSummonerId: () => summonerIdLoader.get(),
    });
    buildPanel = panel;
    void summonerIdLoader.load();

    panel.onUpdate(() => store.getState().setBuild(panel.getSnapshot()));
    store.getState().setBuild(panel.getSnapshot());
    const reveal = makeTeamRevealDom({
      publishView: (view) => store.getState().setTeamReveal(view),
      doc: document,
      subscribe: subscribeImpl,
      lcu,
      buildPanel: panel,
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
    teamRevealDom = reveal;
    reveal.setEnabled(revealAllowed());

    if (champSelectSession) void reveal.handleSession(champSelectSession);
    feedBuildPanel(champSelectSession);

    function paint() {
      syncStore();
      store.getState().setStatusLine(null);
    }

    function requireUpdate(version: string | undefined) {
      if (store.getState().session.updateRequired?.version === version) return;
      store.getState().setSession({ updateRequired: { version: version ?? '', phase: 'required' } });
      if (onUpdateRequired) onUpdateRequired(version ?? '');
    }

    async function checkRequiredUpdate() {
      const result = await updater.check();
      if (result.ok && result.status === 'available' && result.mandatory) requireUpdate(result.version);
    }

    function applyUpdateStatus(body: UpdateStatusBody) {
      if (body.status === 'available' && body.mandatory) requireUpdate(body.version);
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
      const result = await updater.check({ force: true });
      if (!result.ok) {
        trayDown = result.reason.includes('not running');
        updateUi = { phase: 'error', message: result.reason };
      } else {
        applyUpdateStatus(result);
      }
      paint();
    }

    
    
    async function commit(patch: SettingsPatch, revert: () => void): Promise<ActionResult> {
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

    async function goToScreen(next: string) {
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
            lol = readLol(await lcu.get<ChatMeResponse>(CHAT_ME));
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

    async function commitOnboard(patch: SettingsPatch) {
      settings = { ...settings, ...patch };
      pendingOnboard = { ...pendingOnboard, ...patch };
      paint();
      return commit(patch, () => {});
    }

    async function finishOnboarding(startTour: boolean) {
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

    async function dismissWhatsNew(target?: string) {
      openMode = 'default';
      await runWhatsNewDismiss(target, SCREENS, {
        mark: () => commitOnboard(markWhatsNewSeenPatch(appVersion)),
        go: async (next) => {
          await goToScreen(next);
          paint();
        },
      });
    }

    async function handleOnboard(action: OnboardAction) {
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

    function applySettingSideEffects(keys: string[]) {
      if (keys.includes('queue_team_reveal_in_client') && teamRevealDom) {
        teamRevealDom.setEnabled(revealAllowed());
      }
      if (keys.includes('streaming_mode') && !overlayHost) {
        desiredEffective = effectiveFrom(settings.streaming_mode, streamingToolRunning);
        refreshStreamingEffective();
      }
    }

    function applySettingsPatch(patch: SettingsPatch) {
      const keys = Object.keys(patch) as (keyof SettingsValues)[];
      const previous = Object.fromEntries(keys.map((key) => [key, settings[key]])) as SettingsPatch;
      settings = { ...settings, ...patch };
      applySettingSideEffects(keys);
      paint();
      return commit(patch, () => {
        settings = { ...settings, ...previous };
        applySettingSideEffects(keys);
      });
    }

    async function revealLobby(providerId: string) {
      let region = '';
      try {
        region = (await lcu.get<{ region?: string }>('/riotclient/region-locale')).region || '';
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

    function setRequired(patch: Partial<RequiredUpdate>) {
      const current = store.getState().session.updateRequired;
      if (current) store.getState().setSession({ updateRequired: { ...current, ...patch } });
    }

    async function installRequiredUpdate() {
      const required = store.getState().session.updateRequired;
      if (!required) return;
      setRequired({ phase: 'installing', reason: '', message: '' });
      let previousToken = cfg.token;
      try {
        previousToken = (await reloadConfig())?.token || previousToken;
      } catch {
      }
      const result = await updater.apply();
      const trayLeft = !result.ok && result.reason.includes('not running');
      if (!result.ok && !trayLeft) {
        setRequired({ phase: 'error', reason: 'failed', message: result.reason });
        return;
      }
      if (result.ok && result.upToDate) {
        setRequired({ phase: 'reloading' });
        await restarter.restart();
        return;
      }
      setRequired({ phase: 'restarting' });
      const outcome = await waitForNewTray({ loadConfig: reloadConfig, previousToken, targetVersion: required.version });
      if (outcome.status !== 'updated') {
        setRequired({ phase: 'error', reason: outcome.status, message: '' });
        return;
      }
      setRequired({ phase: 'reloading' });
      await restarter.restart();
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
      installRequiredUpdate: () => installRequiredUpdate(),
      restartClient: () => restarter.restart(),
    } satisfies Partial<LegacyActions>);

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

    async function runProfileAction<T>(action: () => Promise<T>): Promise<T> {
      const result = await action();
      try {
        lol = readLol(await lcu.get<ChatMeResponse>(CHAT_ME));
      } catch {
      }
      paint();
      return result;
    }

    async function selectProfileTab(tab: string) {
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
    } satisfies Partial<LegacyActions>);

    Object.assign(legacyActions, {
      onboard: (action) => handleOnboard(action),
      dismissWhatsNew: (target) => withOnboardLock(onboardLock, () => dismissWhatsNew(target)),
    } satisfies Partial<LegacyActions>);

    Object.assign(legacyActions, {
      openScouting: () => teamRevealDom?.openCards(),
      closeScouting: () => teamRevealDom?.closeCards(),
      setScoutingTab: (tab) => teamRevealDom?.setActiveTab(tab),
      muteScouting: () => teamRevealDom?.muteAll(),
    } satisfies Partial<LegacyActions>);

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
    } satisfies Partial<LegacyActions>);

    paint();
    applyStreamingPolicy();
    window.setTimeout(() => void checkRequiredUpdate().catch(() => {}), REQUIRED_UPDATE_FIRST_CHECK_MS);
    window.setInterval(() => void checkRequiredUpdate().catch(() => {}), REQUIRED_UPDATE_CHECK_MS);
    if (!overlayHost) {
      window.setInterval(() => {
        void pollStreaming().catch(() => {});
        void pushOverlayPluginState();
        void drainOverlayActions();
      }, 750);
    }
  }

  return { ...ui, setReadyCheck, setChampSelect, setIdle, replaceSettings, toggleView, store, actions: legacyActions };
}

export type DrakeUI = ReturnType<typeof startUI>;
