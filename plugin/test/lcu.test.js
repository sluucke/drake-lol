import { describe, it, expect, vi } from 'vitest';
import { makeLcu, METHODS } from '../src/lcu.js';
import { STATUS_ROUTE } from '../src/features/status.js';
import { actionRoute } from '../src/features/champSelect.js';

describe('makeLcu', () => {
  it('provides every method the features call', () => {
    // The bug this exists for: `patch` was missing from the real object while
    // every champ-select test passed, because they all mocked it. Auto Pick
    // failed live with "lcu.patch is not a function".
    const lcu = makeLcu(vi.fn());
    for (const m of METHODS) {
      expect(typeof lcu[m], `lcu.${m} must exist`).toBe('function');
    }
  });

  it('sends a JSON body on patch, which is how champ select actions work', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await makeLcu(fetchImpl).patch(actionRoute(7), { championId: 103, completed: true });

    const [route, init] = fetchImpl.mock.calls[0];
    expect(route).toBe('/lol-champ-select/v1/session/actions/7');
    expect(init.method).toBe('PATCH');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ championId: 103, completed: true });
  });

  it('sends a JSON body on put, which is how the status message works', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await makeLcu(fetchImpl).put(STATUS_ROUTE, { statusMessage: 'hi' });

    const [route, init] = fetchImpl.mock.calls[0];
    expect(route).toBe(STATUS_ROUTE);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ statusMessage: 'hi' });
  });

  it('omits the body entirely when there is none', async () => {
    // A POST with a JSON content-type and no body is rejected by some routes.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await makeLcu(fetchImpl).post('/whatever');

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('parses get responses as json', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => ({ region: 'BR' }) });
    expect(await makeLcu(fetchImpl).get('/riotclient/region-locale')).toEqual({ region: 'BR' });
  });
});
