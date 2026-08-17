import { describe, it, expect, vi } from 'vitest';
import {
  splitRiotId,
  makeRiotId,
  SAVE_ALIAS,
  normaliseFriends,
  loadFriends,
  FRIENDS_ROUTE,
  removeAllFriends,
} from '../src/features/profile.js';

describe('splitRiotId', () => {
  it('splits name and tag', () => {
    expect(splitRiotId('Faker#KR1')).toEqual({ gameName: 'Faker', tagLine: 'KR1' });
  });

  it('keeps a name containing spaces', () => {
    expect(splitRiotId('Dude Guy#BR1')).toEqual({ gameName: 'Dude Guy', tagLine: 'BR1' });
  });

  it('splits on the LAST hash, since a name may contain one', () => {
    expect(splitRiotId('a#b#TAG')).toEqual({ gameName: 'a#b', tagLine: 'TAG' });
  });

  it('trims surrounding whitespace', () => {
    expect(splitRiotId('  Faker # KR1 ')).toEqual({ gameName: 'Faker', tagLine: 'KR1' });
  });

  it('rejects input with no tag', () => {
    expect(splitRiotId('Faker')).toBe(null);
  });

  it('rejects an empty name or tag', () => {
    expect(splitRiotId('#KR1')).toBe(null);
    expect(splitRiotId('Faker#')).toBe(null);
    expect(splitRiotId('')).toBe(null);
  });
});

describe('makeRiotId', () => {
  it('saves a valid id', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await makeRiotId({ lcu }).save('Faker#KR1');

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(SAVE_ALIAS, { gameName: 'Faker', tagLine: 'KR1' });
  });

  it('refuses malformed input without calling the client', async () => {
    const lcu = { post: vi.fn() };

    const result = await makeRiotId({ lcu }).save('nope');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/name#tag/i);
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('passes the client\'s refusal through, since it owns the real rules', async () => {
    // Availability, cooldowns and banned words are Riot's to enforce.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 409 }) };

    const result = await makeRiotId({ lcu }).save('Taken#BR1');

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('409');
  });
});

describe('normaliseFriends', () => {
  const raw = [
    { gameName: 'B', gameTag: 'BR1', availability: 'chat', note: '', statusMessage: 'hi' },
    { gameName: 'A', gameTag: 'BR1', availability: 'offline', note: 'duo partner' },
    { name: 'Legacy', availability: 'dnd' },
  ];

  it('sorts online friends before offline ones, alphabetically within each', () => {
    // An alphabetical list alone buries the people you can actually play with.
    // 'B' (chat) and 'Legacy' (dnd) are both online, so they sort by name;
    // 'A' is offline and goes last despite being first alphabetically.
    expect(normaliseFriends(raw).map((f) => f.name)).toEqual(['B', 'Legacy', 'A']);
  });

  it('treats "dnd" and "away" as online, because they are', () => {
    const list = normaliseFriends([
      { gameName: 'Busy', gameTag: 'X', availability: 'dnd' },
      { gameName: 'Gone', gameTag: 'X', availability: 'offline' },
    ]);
    expect(list.find((f) => f.name === 'Busy').online).toBe(true);
    expect(list.find((f) => f.name === 'Gone').online).toBe(false);
  });

  it('builds the display name from gameName#gameTag', () => {
    expect(normaliseFriends(raw).find((f) => f.name === 'B').riotId).toBe('B#BR1');
  });

  it('falls back to the legacy name field', () => {
    expect(normaliseFriends(raw).find((f) => f.name === 'Legacy').riotId).toBe('Legacy');
  });

  it('keeps the personal note, which is the point of the screen', () => {
    expect(normaliseFriends(raw).find((f) => f.name === 'A').note).toBe('duo partner');
  });

  it('is safe on nothing', () => {
    expect(normaliseFriends(null)).toEqual([]);
  });
});

describe('loadFriends', () => {
  it('reads the friends list', async () => {
    const lcu = { get: vi.fn().mockResolvedValue([{ gameName: 'A', gameTag: 'B' }]) };
    const list = await loadFriends(lcu);
    expect(lcu.get).toHaveBeenCalledWith(FRIENDS_ROUTE);
    expect(list).toHaveLength(1);
  });

  it('returns an empty list rather than throwing', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('offline')) };
    expect(await loadFriends(lcu)).toEqual([]);
  });
});

describe('removeAllFriends', () => {
  it('deletes every friend by id', async () => {
    const lcu = { delete: vi.fn().mockResolvedValue({ ok: true }) };
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const result = await removeAllFriends({ lcu, friends: list });

    expect(result.removed).toBe(3);
    expect(lcu.delete.mock.calls.map((c) => c[0])).toEqual([
      '/lol-chat/v1/friends/a',
      '/lol-chat/v1/friends/b',
      '/lol-chat/v1/friends/c',
    ]);
  });

  it('keeps going when one deletion fails, and reports the count', async () => {
    // Stopping at the first failure would leave the list half-cleared with no
    // indication of how far it got.
    const lcu = {
      delete: vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('gone'))
        .mockResolvedValueOnce({ ok: true }),
    };

    const result = await removeAllFriends({
      lcu,
      friends: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });

    expect(result.removed).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('counts a refusal as a failure rather than a removal', async () => {
    const lcu = { delete: vi.fn().mockResolvedValue({ ok: false, status: 500 }) };
    const result = await removeAllFriends({ lcu, friends: [{ id: 'a' }] });
    expect(result.removed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('does nothing on an empty list', async () => {
    const lcu = { delete: vi.fn() };
    const result = await removeAllFriends({ lcu, friends: [] });
    expect(result.removed).toBe(0);
    expect(lcu.delete).not.toHaveBeenCalled();
  });
});
