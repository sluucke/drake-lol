import { loadConfig } from './config.js';
import { makeTransport } from './transport.js';

const TAG = '[Drake]';

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
  // anything that can throw.
  const host = (typeof Pengu !== 'undefined' && Pengu.version) ? `pengu ${Pengu.version}` : 'unknown';
  const ok = await transport.checkIn(host);
  console.log(TAG, 'check-in', ok ? 'ok' : 'failed', '| settings', JSON.stringify(cfg.settings));
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);
