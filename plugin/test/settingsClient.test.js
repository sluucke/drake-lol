import { describe, it, expect, vi } from 'vitest';
import { makeSettingsClient } from '../src/ui/settingsClient.js';

const ok = () => Promise.resolve({ ok: true, status: 200 });

describe('makeSettingsClient', () => {
  it('posts the settings with the token to the tray', async () => {
    const fetchImpl = vi.fn(ok);
    const client = makeSettingsClient({ port: 48151, token: 'abc', fetchImpl });

    const result = await client.save({ auto_accept: true });

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:48151/settings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      token: 'abc',
      settings: { auto_accept: true },
    });
  });

  it('reports failure instead of throwing when the tray is not running', async () => {


    const fetchImpl = vi.fn(() => Promise.reject(new Error('connection refused')));
    const client = makeSettingsClient({ port: 48151, token: 'abc', fetchImpl });

    const result = await client.save({ auto_accept: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/tray/i);
  });

  it('refreshes the token once on 401 and retries', async () => {


    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const reloadConfig = vi.fn(() =>
      Promise.resolve({ token: 'fresh', port: 48151, settings: {} }),
    );
    const client = makeSettingsClient({ port: 48151, token: 'stale', fetchImpl, reloadConfig });

    const result = await client.save({ auto_accept: true });

    expect(result.ok).toBe(true);
    expect(reloadConfig).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).token).toBe('fresh');
  });

  it('gives up after one refresh rather than looping', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false, status: 401 }));
    const reloadConfig = vi.fn(() =>
      Promise.resolve({ token: 'still-wrong', port: 48151, settings: {} }),
    );
    const client = makeSettingsClient({ port: 48151, token: 'stale', fetchImpl, reloadConfig });

    const result = await client.save({ auto_accept: true });

    expect(result.ok).toBe(false);
    expect(reloadConfig).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports a non-401 error status without retrying', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
    const client = makeSettingsClient({ port: 48151, token: 'abc', fetchImpl });

    const result = await client.save({ auto_accept: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('500');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
