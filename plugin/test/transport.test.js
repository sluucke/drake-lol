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
});
