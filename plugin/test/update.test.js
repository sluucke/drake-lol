import { describe, it, expect, vi } from 'vitest';
import { makeUpdater } from '../src/features/update.js';

describe('makeUpdater', () => {
  it('posts to /update/check with the token', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'current', current: '0.1.0' }),
      }),
    );
    const updater = makeUpdater({ port: 48151, token: 'abc', fetchImpl });

    const result = await updater.check();

    expect(result.ok).toBe(true);
    expect(result.status).toBe('current');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:48151/update/check');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).token).toBe('abc');
  });

  it('maps an available release for the settings screen', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ status: 'available', current: '0.1.0', version: 'v0.2.0' }),
      }),
    );
    const updater = makeUpdater({ port: 48151, token: 'abc', fetchImpl });

    const result = await updater.check();

    expect(result.status).toBe('available');
    expect(result.version).toBe('v0.2.0');
  });

  it('posts to /update/apply when installing', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 204 }));
    const updater = makeUpdater({ port: 48151, token: 'abc', fetchImpl });

    const result = await updater.apply();

    expect(result.ok).toBe(true);
    expect(result.installing).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:48151/update/apply');
  });
});
