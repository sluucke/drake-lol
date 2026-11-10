import { loadConfig } from './config';
import { makeLcu } from './lcu';
import { makeTransport } from './transport';
import { installErrorReporter, ownedByPlugin, sendToTray } from './errorReporter';
import { PLUGIN_BUILD } from './buildId';
import { startAutoAccept } from './autoAccept';
import { socketPushAvailable, subscribe } from './subscribe';
import { startHeartbeat } from './heartbeat';
import { startUI } from './ui/index';
import { startUnlocks } from './features/startUnlocks';
import { startChampSelectAutomation } from './features/autoPick';
import { makeChampSelect } from './features/champSelect';
import { startInGameIdle } from './features/inGameIdle';
import { makePresence } from './features/presence';
import { startProfileRankRefresh } from './features/profileRank';
import { startPresenceLock } from './features/presenceLock';
import type { SettingsValues } from './settings';
import type { ClientInfo } from './transport';
import type { ChampSelectAutomation } from './features/autoPick';
import type { DrakeUI } from './ui/index';

const TAG = '[Drake]';

const lcu = makeLcu();
const presence = makePresence({ lcu });






let stopFeatures = () => {};
let stopProfileRank = () => {};
let champSelectCtl: ChampSelectAutomation | null = null;
let ui: DrakeUI | null = null;
let currentSettings: SettingsValues = {};
let idleInGame = false;
let updateRequired = false;

function blockForUpdate() {
  updateRequired = true;
  stopFeatures();
  stopProfileRank();
  if (champSelectCtl) {
    champSelectCtl.stop();
    champSelectCtl = null;
  }
}

function sleepPlugin() {
  stopFeatures();
  if (champSelectCtl) {
    champSelectCtl.stop();
    champSelectCtl = null;
  }
  if (ui) ui.setIdle(true);
}

function wakePlugin() {
  if (ui) ui.setIdle(false);
  wireFeatures(currentSettings);
}

function wireFeatures(settings: SettingsValues) {
  currentSettings = settings;
  stopFeatures();
  stopProfileRank();
  if (idleInGame || updateRequired) return;
  const stopAutoAccept = startAutoAccept({
    enabled: !!settings.auto_accept,
    delayMs: settings.auto_accept_delay_ms || 0,
    lcu,
    subscribe,
    
    
    onState: (payload) => ui && ui.setReadyCheck(payload),
  });
  
  
  if (!champSelectCtl) {
    champSelectCtl = startChampSelectAutomation({
      getSettings: () => currentSettings,
      champSelect: makeChampSelect({ lcu }),
      subscribe,
      getSession: () => lcu.get('/lol-champ-select/v1/session'),
      onResult: (d, r, was) =>
        console.log(
          TAG,
          d.kind,
          d.championId,
          r.ok ? 'ok' : 'failed: ' + r.reason,
          `| hover ${r.hoverStatus ?? '-'} complete ${r.completeStatus ?? '-'}`,
          `| action ${was ? was.actionId : '-'} had ${was ? was.championId : '-'} completed ${was ? was.completed : '-'}`,
          `| phase ${was && was.phase ? was.phase : '-'}`,
        ),
      onSession: (session) => ui && ui.setChampSelect(session),
    });
  } else {
    champSelectCtl.refresh();
  }

  const stopUnlocks = startUnlocks({
    enabled: !!settings.unlock_status_message,
    
    
    onFirstUnlock: (n) => console.log(TAG, 'unlocked the status message input', n > 1 ? n : ''),
  });
  stopProfileRank = startProfileRankRefresh({
    subscribe,
    getSettings: () => currentSettings,
    presence,
    lcu,
  });
  const stopPresenceLock = startPresenceLock({
    subscribe,
    getSettings: () => currentSettings,
    presence,
    lcu,
  });
  stopFeatures = () => {
    stopProfileRank();
    stopPresenceLock();
    if (typeof stopAutoAccept === 'function') stopAutoAccept();
    stopUnlocks();
  };
}

async function start() {
  const cfg = await loadConfig();

  if (!cfg) {
    
    
    console.log(TAG, 'no config.json found; the tray app may not be running');
    ui = startUI({ cfg: { port: 0, token: '', settings: {} }, lcu });
    return;
  }

  installErrorReporter({
    send: sendToTray({ port: cfg.port, token: cfg.token }),
    source: 'plugin',
    ownsError: ownedByPlugin,
  });

  let clientInfo: ClientInfo | null = null;
  const readClientInfo = async () => {
    try {
      const body = await lcu.get<{ region?: string; locale?: string } | null>('/riotclient/region-locale');
      if (body?.region || body?.locale) clientInfo = { region: body.region || '', locale: body.locale || '' };
    } catch {
    }
  };
  void readClientInfo();

  const transport = makeTransport({
    port: cfg.port,
    token: cfg.token,
    dataStore: typeof DataStore !== 'undefined' ? DataStore : null,
    reloadConfig: loadConfig,
    pluginBuild: PLUGIN_BUILD,
    clientInfo: () => {
      if (!clientInfo) void readClientInfo();
      return clientInfo;
    },
  });

  
  
  
  
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await startHeartbeat({ checkIn: transport.checkIn, host });
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));
  console.log(TAG, 'lcu events', socketPushAvailable() ? 'pushed by the loader' : 'polled');

  ui = startUI({ cfg, onSettingsChanged: wireFeatures, onUpdateRequired: blockForUpdate, lcu });
  wireFeatures(cfg.settings);
  startInGameIdle({
    subscribe,
    onChange(idle) {
      idleInGame = idle;
      console.log(TAG, idle ? 'idle in game' : 'active in client');
      if (idle) sleepPlugin();
      else wakePlugin();
    },
  });
  console.log(TAG, 'UI ready — press Ctrl+D');
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
