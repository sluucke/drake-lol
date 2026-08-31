import { describe, it, expect, vi } from 'vitest';
import { makeSummonerIdLoader, CURRENT_SUMMONER_ROUTE } from '../src/features/summonerId.js';

describe('makeSummonerIdLoader', () => {
  it('reads the summoner id from the current-summoner route', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ summonerId: 4242 }) };
    const loader = makeSummonerIdLoader({ lcu });

    expect(loader.get()).toBe(0);
    expect(await loader.load()).toBe(4242);
    expect(lcu.get).toHaveBeenCalledWith(CURRENT_SUMMONER_ROUTE);
    expect(loader.get()).toBe(4242);
  });

  it('retries after a failure instead of caching zero for the session', async () => {
    // The client is still booting at plugin mount and rejects the first call.
    const lcu = {
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error('not logged in'))
        .mockResolvedValue({ summonerId: 77 }),
    };
    const loader = makeSummonerIdLoader({ lcu });

    expect(await loader.load()).toBe(0);
    expect(loader.get()).toBe(0);

    // A later champ select must be able to recover.
    expect(await loader.load()).toBe(77);
    expect(loader.get()).toBe(77);
    expect(lcu.get).toHaveBeenCalledTimes(2);
  });

  it('stops calling the client once an id has been resolved', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ summonerId: 5 }) };
    const loader = makeSummonerIdLoader({ lcu });

    await loader.load();
    await loader.load();
    await loader.load();
    expect(lcu.get).toHaveBeenCalledTimes(1);
  });

  it('does not fire overlapping requests', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ summonerId: 9 }) };
    const loader = makeSummonerIdLoader({ lcu });

    const [a, b] = await Promise.all([loader.load(), loader.load()]);
    expect(a).toBe(9);
    expect(b).toBe(9);
    expect(lcu.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to accountId when summonerId is absent', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ accountId: 31 }) };
    const loader = makeSummonerIdLoader({ lcu });
    expect(await loader.load()).toBe(31);
  });
});
