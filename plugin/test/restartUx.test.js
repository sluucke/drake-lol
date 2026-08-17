import { describe, it, expect, vi } from 'vitest';
import { makeRestartUx, RESTART_UX_ROUTE } from '../src/features/restartUx.js';
import { renderSettings } from '../src/ui/panel.js';

describe('makeRestartUx', () => {
  it('posts the same kill-and-restart-ux call the tray menu uses', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await makeRestartUx({ lcu }).restart();

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(RESTART_UX_ROUTE);
    expect(RESTART_UX_ROUTE).toBe('/riotclient/kill-and-restart-ux');
  });

  it('reports a refusal instead of pretending the client is restarting', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 401 }) };

    const result = await makeRestartUx({ lcu }).restart();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('401');
  });

  it('survives the call throwing', async () => {
    const lcu = { post: vi.fn().mockRejectedValue(new Error('gone')) };

    const result = await makeRestartUx({ lcu }).restart();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/gone|client/i);
  });
});

describe('renderSettings', () => {
  it('offers a Restart client action, not only the auto-reload checkbox', () => {
    const html = renderSettings({}, { disabled: false });
    expect(html).toMatch(/id="restart-client"/);
    expect(html).toMatch(/Restart client/);
  });
});
