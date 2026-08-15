import { loadConfig } from './config.js';
import { makeTransport } from './transport.js';
import { startAutoAccept } from './autoAccept.js';
import { subscribe } from './subscribe.js';
import { startHeartbeat } from './heartbeat.js';

const TAG = '[Drake]';

// Same-origin inside the client: no lockfile, no port, no password. Measured
// in the viability spike.
const lcu = {
  post: (route) => fetch(route, { method: 'POST' }),
  get: (route) => fetch(route).then((r) => r.json()),
};

function wireFeatures(cfg) {
  startAutoAccept({ enabled: !!cfg.settings.auto_accept, lcu, subscribe });
}

async function start() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.log(TAG, 'no config.json found; the tray app may not be running');
    return;
  }

  const transport = makeTransport({
    port: cfg.port,
    token: cfg.token,
    dataStore: typeof DataStore !== 'undefined' ? DataStore : null,
  });

  // The tray derives "effective state" from this, so it must happen before
  // anything that can throw. It also has to keep happening: the tray expires
  // a check-in after 20 seconds, so one call at load would make a healthy
  // session look uninjected shortly after it starts.
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await startHeartbeat({ checkIn: transport.checkIn, host });
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));

  wireFeatures(cfg);
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
