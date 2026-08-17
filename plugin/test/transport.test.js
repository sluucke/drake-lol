import { describe, it, expect } from 'vitest';
import { makeTransport } from '../src/transport.js';

describe('transport', () => {
  it('posts a check-in carrying the token', async () => {
    let body;
    const fakeFetch = async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 204 };
    };
    const t = makeTransport({ port: 48151, token: 'sekret', fetchImpl: fakeFetch });
    expect(await t.checkIn('Drake')).toBe(true);
    expect(body).toEqual({ token: 'sekret', host: 'Drake' });
  });

  it('falls back to DataStore when localhost is unreachable', async () => {
    const store = {};
    const t = makeTransport({
      port: 48151,
      token: 'sekret',
      fetchImpl: async () => { throw new Error('blocked'); },
      dataStore: { set: (k, v) => { store[k] = v; } },
    });
    expect(await t.checkIn('Drake')).toBe(true);
    expect(JSON.parse(store['drake_checkin']).host).toBe('Drake');
  });

  it('reports failure when both paths are unavailable', async () => {
    const t = makeTransport({
      port: 48151,
      token: 'sekret',
      fetchImpl: async () => { throw new Error('blocked'); },
    });
    expect(await t.checkIn('Drake')).toBe(false);
  });

  it('does not touch DataStore when localhost succeeds', async () => {
    let dataStoreTouched = false;
    const t = makeTransport({
      port: 48151,
      token: 'sekret',
      fetchImpl: async () => ({ ok: true, status: 204 }),
      dataStore: { set: () => { dataStoreTouched = true; } },
    });
    expect(await t.checkIn('Drake')).toBe(true);
    expect(dataStoreTouched).toBe(false);
  });

  it('reports failure (not a fallback) when the tray rejects the token', async () => {
    let dataStoreTouched = false;
    const t = makeTransport({
      port: 48151,
      token: 'stale',
      fetchImpl: async () => ({ ok: false, status: 401 }),
      dataStore: { set: () => { dataStoreTouched = true; } },
    });
    expect(await t.checkIn('Drake')).toBe(false);
    expect(dataStoreTouched).toBe(false);
  });

  it('picks up the new token when the tray has restarted', async () => {
    // Observed live: restarting the tray regenerates its token, and the plugin
    // kept posting the old one every 5s forever. The tray therefore believed
    // the client was uninjected for the rest of the session, permanently
    // lighting "Reload client to apply".
    const sent = [];
    const fetchImpl = async (_url, init) => {
      const { token } = JSON.parse(init.body);
      sent.push(token);
      return token === 'fresh' ? { ok: true, status: 204 } : { ok: false, status: 401 };
    };
    const t = makeTransport({
      port: 48151,
      token: 'stale',
      fetchImpl,
      reloadConfig: async () => ({ token: 'fresh', port: 48151 }),
    });

    expect(await t.checkIn('Drake')).toBe(true);
    expect(sent).toEqual(['stale', 'fresh']);
  });

  it('keeps using the refreshed token on later beats', async () => {
    // Otherwise every beat would pay a 401 plus a config re-read, forever.
    const sent = [];
    const fetchImpl = async (_url, init) => {
      const { token } = JSON.parse(init.body);
      sent.push(token);
      return token === 'fresh' ? { ok: true, status: 204 } : { ok: false, status: 401 };
    };
    let reloads = 0;
    const t = makeTransport({
      port: 48151,
      token: 'stale',
      fetchImpl,
      reloadConfig: async () => { reloads += 1; return { token: 'fresh', port: 48151 }; },
    });

    await t.checkIn('Drake');
    await t.checkIn('Drake');

    expect(reloads).toBe(1);
    expect(sent).toEqual(['stale', 'fresh', 'fresh']);
  });

  it('gives up after one refresh rather than retrying in a loop', async () => {
    let reloads = 0;
    const t = makeTransport({
      port: 48151,
      token: 'stale',
      fetchImpl: async () => ({ ok: false, status: 401 }),
      reloadConfig: async () => { reloads += 1; return { token: 'also-wrong', port: 48151 }; },
    });

    expect(await t.checkIn('Drake')).toBe(false);
    expect(reloads).toBe(1);
  });
});
