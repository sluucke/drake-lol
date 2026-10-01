import { compareSemver } from '../ui/whatsNew.js';

export const HANDOFF_TIMEOUT_MS = 3 * 60 * 1000;
export const HANDOFF_POLL_MS = 2000;

function plain(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

export async function waitForNewTray({
  loadConfig,
  previousToken,
  targetVersion,
  timeoutMs = HANDOFF_TIMEOUT_MS,
  intervalMs = HANDOFF_POLL_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(intervalMs);
    let cfg = null;
    try {
      cfg = await loadConfig();
    } catch {
      cfg = null;
    }
    if (!cfg?.token || cfg.token === previousToken) continue;
    const updated = compareSemver(plain(cfg.version), plain(targetVersion)) >= 0;
    return { status: updated ? 'updated' : 'same-version', cfg };
  }
  return { status: 'timeout' };
}
