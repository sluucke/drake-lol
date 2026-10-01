import { describe, it, expect, vi } from 'vitest';
import { waitForNewTray } from '../src/features/updateHandoff.js';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

describe('waitForNewTray', () => {
  it('waits until a new tray writes its config with the new version', async () => {
    const c = clock();
    const loadConfig = vi
      .fn()
      .mockResolvedValueOnce({ token: 'old', version: '0.4.3' })
      .mockRejectedValueOnce(new Error('not there yet'))
      .mockResolvedValueOnce({ token: 'new', version: '0.4.4' });
    const out = await waitForNewTray({ loadConfig, previousToken: 'old', targetVersion: 'v0.4.4', ...c });
    expect(out.status).toBe('updated');
    expect(loadConfig).toHaveBeenCalledTimes(3);
  });

  it('notices when Drake came back on the old version', async () => {
    const c = clock();
    const loadConfig = vi.fn().mockResolvedValue({ token: 'new', version: '0.4.3' });
    const out = await waitForNewTray({ loadConfig, previousToken: 'old', targetVersion: 'v0.4.4', ...c });
    expect(out.status).toBe('same-version');
  });

  it('gives up after the timeout', async () => {
    const c = clock();
    const loadConfig = vi.fn().mockResolvedValue({ token: 'old', version: '0.4.3' });
    const out = await waitForNewTray({ loadConfig, previousToken: 'old', targetVersion: '0.4.4', timeoutMs: 10000, intervalMs: 2000, ...c });
    expect(out.status).toBe('timeout');
    expect(loadConfig).toHaveBeenCalledTimes(5);
  });
});
