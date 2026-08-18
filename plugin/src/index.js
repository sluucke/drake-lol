import { loadConfig } from './config.js';
import { makeLcu } from './lcu.js';
import { makeTransport } from './transport.js';
import { PLUGIN_BUILD } from './buildId.js';
import { startAutoAccept } from './autoAccept.js';
import { subscribe } from './subscribe.js';
import { startHeartbeat } from './heartbeat.js';
import { startUI } from './ui/index.js';
import { startUnlocks } from './features/startUnlocks.js';
import { startChampSelectAutomation } from './features/autoPick.js';
import { makeChampSelect } from './features/champSelect.js';

const TAG = '[Drake]';

const lcu = makeLcu();






let stopFeatures = () => {};
let champSelectCtl = null;
let ui = null;
let currentSettings = {};

function wireFeatures(settings) {
  currentSettings = settings;
  stopFeatures();
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
      onResult: (d, r) =>
        console.log(TAG, d.kind, d.championId, r.ok ? 'ok' : 'failed: ' + r.reason),
      onSession: (session) => ui && ui.setChampSelect(session),
    });
  } else {
    champSelectCtl.refresh();
  }

  const stopUnlocks = startUnlocks({
    enabled: !!settings.unlock_status_message,
    
    
    onFirstUnlock: (n) => console.log(TAG, 'unlocked the status message input', n > 1 ? n : ''),
  });
  stopFeatures = () => {
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

  ui = startUI({ cfg, onSettingsChanged: wireFeatures, lcu });
  wireFeatures(cfg.settings);
  console.log(TAG, 'UI ready — press Ctrl+D');
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
