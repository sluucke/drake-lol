import { compareSemver } from '../ui/whatsNew';

import type { PluginConfig } from '../settings';

export const HANDOFF_TIMEOUT_MS = 3 * 60 * 1000;
export const HANDOFF_POLL_MS = 2000;

export type HandoffConfig = Pick<PluginConfig, 'token' | 'version'>;

export type HandoffOutcome<C extends HandoffConfig = HandoffConfig> =
  | { status: 'updated' | 'same-version'; cfg: C }
  | { status: 'timeout'; cfg?: undefined };

export interface WaitForNewTrayOptions<C extends HandoffConfig> {
  loadConfig: () => Promise<C | null | undefined>;
  previousToken: string | null | undefined;
  targetVersion: string | null | undefined;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

function plain(version: string | null | undefined): string {
  return String(version || '').trim().replace(/^v/i, '');
}

export async function waitForNewTray<C extends HandoffConfig = HandoffConfig>({
  loadConfig,
  previousToken,
  targetVersion,
  timeoutMs = HANDOFF_TIMEOUT_MS,
  intervalMs = HANDOFF_POLL_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}: WaitForNewTrayOptions<C>): Promise<HandoffOutcome<C>> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(intervalMs);
    let cfg: C | null | undefined = null;
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
