import { describe, it, expect, vi } from 'vitest';
import { buildRevealUrl, PROVIDERS, collectNames, makeReveal } from '../src/features/reveal.js';

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
    // An unencoded # starts the fragment, so every name after the first
    // player would silently disappear from the search.
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
    // Champ select populates names asynchronously; a blank entry would send
    // an empty slot into the multi-search and break the whole query.
    expect(collectNames([{ gameName: '', tagLine: 'X' }, { gameName: 'Ok', tagLine: 'Y' }])).toEqual(
      ['Ok#Y'],
    );
  });

  it('handles a missing tagLine', () => {
    expect(collectNames([{ gameName: 'Solo' }])).toEqual(['Solo']);
  });

  it('is safe on nothing at all', () => {
    expect(collectNames(null)).toEqual([]);
  });
});

describe('makeReveal', () => {
  it('opens the url for everyone currently in champ select', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({
        myTeam: [
          { gameName: 'Faker', tagLine: 'KR1' },
          { gameName: 'Dude', tagLine: 'BR1' },
        ],
      }),
    };
    const opened = [];
    const r = makeReveal({ lcu, region: 'BR', open: (u) => opened.push(u) });

    const result = await r.reveal('porofessor');

    expect(result.ok).toBe(true);
    expect(opened[0]).toContain('porofessor.gg/pregame/br/');
    expect(opened[0]).toContain('Faker%23KR1');
  });

  it('explains itself when there is nobody to look up', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ myTeam: [] }) };
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
