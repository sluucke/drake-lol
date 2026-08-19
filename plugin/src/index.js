import { loadConfig } from './config.js';
import { makeLcu } from './lcu.js';
import { makeTransport } from './transport.js';
import { PLUGIN_BUILD } from './buildId.js';
import { startAutoAccept } from './autoAccept.js';
import { socketPushAvailable, subscribe } from './subscribe.js';
import { startHeartbeat } from './heartbeat.js';
import { startUI } from './ui/index.js';
import { startUnlocks } from './features/startUnlocks.js';
import { startChampSelectAutomation } from './features/autoPick.js';
import { makeChampSelect } from './features/champSelect.js';
import { startInGameIdle } from './features/inGameIdle.js';
import { makePresence } from './features/presence.js';
import { startProfileRankRefresh } from './features/profileRank.js';

const TAG = '[Drake]';

const lcu = makeLcu();
const presence = makePresence({ lcu });






let stopFeatures = () => {};
let stopProfileRank = () => {};
let champSelectCtl = null;
let ui = null;
let currentSettings = {};
let idleInGame = false;

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

function wireFeatures(settings) {
  currentSettings = settings;
  stopFeatures();
  stopProfileRank();
  if (idleInGame) return;
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
          `| action had ${was ? was.championId : '-'} completed ${was ? was.completed : '-'}`,
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
  stopFeatures = () => {
    stopProfileRank();
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

  const transport = makeTransport({
    port: cfg.port,
    token: cfg.token,
    dataStore: typeof DataStore !== 'undefined' ? DataStore : null,
    reloadConfig: loadConfig,
    pluginBuild: PLUGIN_BUILD,
  });

  
  
  
  
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await startHeartbeat({ checkIn: transport.checkIn, host });
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));
  console.log(TAG, 'lcu events', socketPushAvailable() ? 'pushed by the loader' : 'polled');

  ui = startUI({ cfg, onSettingsChanged: wireFeatures, lcu });
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
