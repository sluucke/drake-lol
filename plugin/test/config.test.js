import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('reads config.json via the absolute plugins:// URL and busts the cache', async () => {
    let seen;
    const fakeFetch = async (url) => {
      seen = url;
      return { ok: true, json: async () => ({ token: 't', port: 1, settings: {} }) };
    };
    const cfg = await loadConfig(fakeFetch);
    expect(cfg.token).toBe('t');
    expect(seen).toMatch(/^https:\/\/plugins\/Drake\/config\.json\?/);
  });

  it('returns null instead of throwing when the file is missing', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404 });
    expect(await loadConfig(fakeFetch)).toBeNull();
  });
});
