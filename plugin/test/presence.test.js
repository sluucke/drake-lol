import { describe, it, expect, vi } from 'vitest';
import {
  readLol,
  TIERS,
  DIVISIONS,
  QUEUES,
  makePresence,
  CHAT_ME,
} from '../src/features/presence.js';

describe('readLol', () => {
  it('reads the lol block when it is an object', () => {
    expect(readLol({ lol: { level: '88' } })).toEqual({ level: '88' });
  });

  it('parses the lol block when the client hands it back as a JSON string', () => {
    // The old app handled both shapes for a reason: this field comes back
    // stringified in some client states, and treating it as an object then
    // wipes every existing key on the next write.
    expect(readLol({ lol: '{"level":"88"}' })).toEqual({ level: '88' });
  });

  it('survives a malformed string rather than throwing', () => {
    expect(readLol({ lol: '{not json' })).toEqual({});
  });

  it('is safe on a missing block', () => {
    expect(readLol({})).toEqual({});
    expect(readLol(null)).toEqual({});
  });
});

describe('makePresence', () => {
  function harness(current = { level: '88', bannerIdSelected: '1' }) {
    const lcu = {
      get: vi.fn().mockResolvedValue({ lol: current }),
      put: vi.fn().mockResolvedValue({ ok: true }),
    };
    return { lcu, presence: makePresence({ lcu }) };
  }

  it('merges into the existing presence instead of replacing it', async () => {
    // A bare write drops level, banner, challenge points and everything else
    // the client is broadcasting, so the profile visibly breaks.
    const h = harness();

    await h.presence.setRank({ tier: 'CHALLENGER', division: 'I', queue: 'RANKED_SOLO_5x5' });

    const [route, body] = h.lcu.put.mock.calls[0];
    expect(route).toBe(CHAT_ME);
    expect(body.lol.level).toBe('88');
    expect(body.lol.bannerIdSelected).toBe('1');
    expect(body.lol.rankedLeagueTier).toBe('CHALLENGER');
    expect(body.lol.rankedLeagueDivision).toBe('I');
    expect(body.lol.rankedLeagueQueue).toBe('RANKED_SOLO_5x5');
  });

  it('sets the banner without touching rank', async () => {
    const h = harness({ rankedLeagueTier: 'GOLD' });

    await h.presence.setBanner(4);

    const body = h.lcu.put.mock.calls[0][1];
    expect(body.lol.bannerIdSelected).toBe('4');
    expect(body.lol.rankedLeagueTier).toBe('GOLD');
  });

  it('sets the challenge crystal and title', async () => {
    const h = harness();

    await h.presence.setBadges({ crystal: 'DIAMOND', titleId: '12345' });

    const body = h.lcu.put.mock.calls[0][1];
    expect(body.lol.challengeCrystalLevel).toBe('DIAMOND');
    expect(body.lol.playerTitleSelected).toBe('12345');
  });

  it('clears the rank override back to the real one', async () => {
    // An empty string is how the client is told to stop overriding; deleting
    // the keys leaves the last override in place.
    const h = harness({ rankedLeagueTier: 'CHALLENGER', rankedLeagueDivision: 'I' });

    await h.presence.clearRank();

    const body = h.lcu.put.mock.calls[0][1];
    expect(body.lol.rankedLeagueTier).toBe('');
    expect(body.lol.rankedLeagueDivision).toBe('');
  });

  it('reports a refusal instead of claiming success', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ lol: {} }),
      put: vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    };
    const result = await makePresence({ lcu }).setBanner(2);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('400');
  });

  it('does not write at all when the current presence cannot be read', async () => {
    // Writing a merge built on nothing would blank the whole presence.
    const lcu = {
      get: vi.fn().mockRejectedValue(new Error('offline')),
      put: vi.fn(),
    };
    const result = await makePresence({ lcu }).setBanner(2);
    expect(result.ok).toBe(false);
    expect(lcu.put).not.toHaveBeenCalled();
  });
});

describe('option lists', () => {
  it('offers every ranked tier, highest first', () => {
    expect(TIERS[0]).toBe('CHALLENGER');
    expect(TIERS).toContain('IRON');
  });

  it('offers the four divisions', () => {
    expect(DIVISIONS).toEqual(['I', 'II', 'III', 'IV']);
  });

  it('offers the queues a rank can be shown for', () => {
    expect(QUEUES.map((q) => q.id)).toContain('RANKED_SOLO_5x5');
  });
});
