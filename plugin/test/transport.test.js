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
});
