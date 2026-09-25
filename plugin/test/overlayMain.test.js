import { describe, it, expect } from 'vitest';
import { makeOverlayFetch } from '../src/overlayMain.jsx';

describe('makeOverlayFetch', () => {
  it('posts lcu proxy calls', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { ok: true, status: 200, body: { hello: 1 } };
        },
      };
    };
    globalThis.fetch = fetchImpl;
    const proxy = makeOverlayFetch(48151, 'tok');
    const res = await proxy('/lol-summoner/v1/current-summoner');
    expect(calls[0].url).toBe('http://127.0.0.1:48151/overlay/lcu');
    const body = JSON.parse(calls[0].init.body);
    expect(body).toEqual({
      token: 'tok',
      method: 'GET',
      route: '/lol-summoner/v1/current-summoner',
      body: undefined,
    });
    expect(await res.json()).toEqual({ hello: 1 });
  });
});
