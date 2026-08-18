import { describe, it, expect, vi } from 'vitest';
import {
  buildRevealUrl,
  PROVIDERS,
  collectNames,
  formatRiotId,
  lobbyPlayers,
  resolveLobbyNames,
  resolvePlayerName,
  makeReveal,
} from '../src/features/reveal.js';
import { obfuscateChampSelectPuuid } from '../src/features/champSelectPuuid.js';

describe('buildRevealUrl', () => {
  const names = ['Faker#KR1', 'Dude Guy#BR1'];

  it('builds a Porofessor pregame url', () => {
    expect(buildRevealUrl('porofessor', 'BR', names)).toBe(
      'https://porofessor.gg/pregame/br/Faker%23KR1%2CDude%20Guy%23BR1/soloqueue/season',
    );
  });

  it('builds an OP.GG multisearch url', () => {
    expect(buildRevealUrl('opgg', 'BR', names)).toBe(
      'https://www.op.gg/multisearch/br?summoners=Faker%23KR1%2CDude%20Guy%23BR1',
    );
  });

  it('encodes the # in Riot IDs, which would otherwise truncate the url', () => {
    expect(buildRevealUrl('opgg', 'NA', ['A#B'])).toContain('A%23B');
    expect(buildRevealUrl('opgg', 'NA', ['A#B'])).not.toContain('A#B');
  });

  it('falls back to Porofessor for an unknown provider', () => {
    expect(buildRevealUrl('nonsense', 'BR', names)).toContain('porofessor.gg');
  });

  it('lowercases the region, which both sites require', () => {
    expect(buildRevealUrl('opgg', 'EUW', names)).toContain('/multisearch/euw?');
  });
});

describe('collectNames', () => {
  it('reads gameName#tagLine from champ select', () => {
    expect(
      collectNames([
        { gameName: 'Faker', tagLine: 'KR1' },
        { gameName: 'Dude', tagLine: 'BR1' },
      ]),
    ).toEqual(['Faker#KR1', 'Dude#BR1']);
  });

  it('skips players whose name has not resolved yet', () => {
    expect(collectNames([{ gameName: '', tagLine: 'X' }, { gameName: 'Ok', tagLine: 'Y' }])).toEqual(['Ok#Y']);
  });

  it('handles a missing tagLine', () => {
    expect(collectNames([{ gameName: 'Solo' }])).toEqual(['Solo']);
  });

  it('is safe on nothing at all', () => {
    expect(collectNames(null)).toEqual([]);
  });
});

describe('lobbyPlayers', () => {
  it('includes players who already have a riot id on the session', () => {
    expect(
      lobbyPlayers({
        myTeam: [{ gameName: 'Faker', tagLine: 'KR1' }],
        theirTeam: [],
      }),
    ).toHaveLength(1);
  });

  it('includes both teams when they have identifiers', () => {
    expect(
      lobbyPlayers({
        myTeam: [{ summonerId: 1 }],
        theirTeam: [{ summonerId: 2 }],
      }),
    ).toHaveLength(2);
  });
});

describe('resolvePlayerName', () => {
  const realPuuid = '01234567-89ab-cdef-0123-456789abcdef';

  it('uses names already on the session', async () => {
    const lcu = { get: vi.fn() };
    await expect(resolvePlayerName({ gameName: 'Faker', tagLine: 'KR1' }, lcu)).resolves.toBe('Faker#KR1');
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('looks up a player by puuid when names are blank', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ gameName: 'Ally', tagLine: 'BR1' }),
    };
    await expect(resolvePlayerName({ puuid: realPuuid }, lcu)).resolves.toBe('Ally#BR1');
    expect(lcu.get).toHaveBeenCalledWith(`/lol-summoner/v2/summoners/puuid/${realPuuid}`);
  });

  it('deobfuscates streamer-mode players before lookup', async () => {
    const obfuscated = obfuscateChampSelectPuuid(realPuuid);
    const lcu = {
      get: vi.fn().mockResolvedValue({ gameName: 'Hidden', tagLine: 'NA1' }),
    };
    await expect(
      resolvePlayerName({ nameVisibilityType: 'HIDDEN', obfuscatedPuuid: obfuscated }, lcu),
    ).resolves.toBe('Hidden#NA1');
    expect(lcu.get).toHaveBeenCalledWith(`/lol-summoner/v2/summoners/puuid/${realPuuid}`);
  });

  it('falls back to summoner id when puuid lookup fails', async () => {
    const lcu = {
      get: vi.fn().mockImplementation(async (route) => {
        if (route === '/lol-summoner/v1/summoners/42') {
          return { gameName: 'Old', tagLine: 'EUW' };
        }
        throw new Error(`unexpected ${route}`);
      }),
    };
    await expect(resolvePlayerName({ summonerId: 42 }, lcu)).resolves.toBe('Old#EUW');
    expect(lcu.get).toHaveBeenCalledWith('/lol-summoner/v1/summoners/42');
  });
});

describe('resolveLobbyNames', () => {
  it('deduplicates players across both teams', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ gameName: 'Same', tagLine: 'BR1' }),
    };
    const names = await resolveLobbyNames(
      {
        myTeam: [{ puuid: '01234567-89ab-cdef-0123-456789abcdef' }],
        theirTeam: [{ gameName: 'Same', tagLine: 'BR1' }],
      },
      lcu,
    );
    expect(names).toEqual(['Same#BR1']);
  });
});

describe('makeReveal', () => {
  it('opens the url for everyone currently in champ select', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === '/lol-champ-select/v1/session') {
          return {
            myTeam: [
              { gameName: 'Faker', tagLine: 'KR1' },
              { puuid: '01234567-89ab-cdef-0123-456789abcdef' },
            ],
            theirTeam: [{ summonerId: 9 }],
          };
        }
        if (route.startsWith('/lol-summoner/v2/summoners/puuid/')) {
          return { gameName: 'Ally', tagLine: 'BR1' };
        }
        if (route === '/lol-summoner/v1/summoners/9') {
          return { gameName: 'Enemy', tagLine: 'BR1' };
        }
        throw new Error(`unexpected ${route}`);
      }),
    };
    const opened = [];
    const r = makeReveal({ lcu, region: 'BR', open: (u) => opened.push(u) });

    const result = await r.reveal('porofessor');

    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
    expect(opened[0]).toContain('porofessor.gg/pregame/br/');
    expect(opened[0]).toContain('Faker%23KR1');
    expect(opened[0]).toContain('Ally%23BR1');
    expect(opened[0]).toContain('Enemy%23BR1');
  });

  it('explains itself when there is nobody to look up', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ myTeam: [], theirTeam: [] }) };
    const r = makeReveal({ lcu, region: 'BR', open: () => {} });

    const result = await r.reveal('porofessor');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/champ select/i);
  });

  it('does not open a browser tab when the lookup fails', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('no session')) };
    let opened = 0;
    const r = makeReveal({ lcu, region: 'BR', open: () => { opened += 1; } });

    const result = await r.reveal('porofessor');

    expect(result.ok).toBe(false);
    expect(opened).toBe(0);
  });
});

describe('PROVIDERS', () => {
  it('offers both sites the old app supported', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['porofessor', 'opgg']);
  });
});

describe('formatRiotId', () => {
  it('joins gameName and tagLine', () => {
    expect(formatRiotId({ gameName: 'A', tagLine: 'B' })).toBe('A#B');
  });
});
