import { loadConfig } from './config.js';
import { makeLcu } from './lcu.js';
import { makeTransport } from './transport.js';
import { startAutoAccept } from './autoAccept.js';
import { subscribe } from './subscribe.js';
import { startHeartbeat } from './heartbeat.js';
import { startUI } from './ui/index.js';
import { startUnlocks } from './features/startUnlocks.js';
import { startChampSelectAutomation } from './features/autoPick.js';
import { makeChampSelect } from './features/champSelect.js';

const TAG = '[Drake]';

const lcu = makeLcu();

/// Features that depend on a delay or a one-shot observer are torn down and
/// rebuilt whenever settings change, so a toggle in the panel takes effect
/// immediately. Champ-select automation is the exception: tearing it down
/// drops the live session, and the next event may never come if the lobby is
/// quiet — so it stays up and is only asked to re-read settings.
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
    // Always subscribed, even with auto-accept off: the cancel button needs
    // ready-check state to know when to appear.
    onState: (payload) => ui && ui.setReadyCheck(payload),
  });
  // getSettings is a closure, not a snapshot: the panel can change these
  // mid-champ-select and the next event (or refresh()) must see the new value.
  if (!champSelectCtl) {
    champSelectCtl = startChampSelectAutomation({
      getSettings: () => currentSettings,
      champSelect: makeChampSelect({ lcu }),
      subscribe,
      onResult: (d, r) =>
        console.log(TAG, d.kind, d.championId, r.ok ? 'ok' : 'failed: ' + r.reason),
    });
  } else {
    champSelectCtl.refresh();
  }

  const stopUnlocks = startUnlocks({
    enabled: !!settings.unlock_status_message,
    // The selector points into Riot's own markup, so say out loud when it
    // works. Silence after a client patch is how we learn it stopped matching.
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
    // No config.json means the tray has never written one. The panel still
    // opens -- it is the only place that can tell the user why nothing works.
    console.log(TAG, 'no config.json found; the tray app may not be running');
    ui = startUI({ cfg: { port: 0, token: '', settings: {} }, lcu });
    return;
  }

  const transport = makeTransport({
    port: cfg.port,
    token: cfg.token,
    dataStore: typeof DataStore !== 'undefined' ? DataStore : null,
    // Recovers on its own when the tray restarts and regenerates its token.
    reloadConfig: loadConfig,
  });

  // The tray derives "effective state" from this, so it must happen before
  // anything that can throw. It also has to keep happening: the tray expires
  // a check-in after 20 seconds, so one call at load would make a healthy
  // session look uninjected shortly after it starts.
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await startHeartbeat({ checkIn: transport.checkIn, host });
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));

  ui = startUI({ cfg, onSettingsChanged: wireFeatures, lcu });
  wireFeatures(cfg.settings);
  console.log(TAG, 'UI ready — press Ctrl+D');
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
