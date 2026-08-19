import { describe, it, expect, vi } from 'vitest';
import { CHAT_ME } from '../src/features/presence.js';
import {
  CHALLENGE_PREFS_ROUTE,
  CHALLENGE_CLIENT_STATE_ROUTE,
  readChallengeIdSlots,
  readFirstSlotChallengeId,
  readEquippedChallengeIds,
  makeChallenges,
} from '../src/features/challenges.js';

describe('readChallengeIdSlots', () => {
  it('reads preference ids from client state', () => {
    expect(readChallengeIdSlots({ challengeIds: [101, 0, -1] })).toEqual([101, 0, -1]);
  });

  it('reads comma-separated tokens from chat presence', () => {
    expect(
      readChallengeIdSlots({
        lol: { challengeTokensSelected: '504001,301301,501004' },
      }),
    ).toEqual([504001, 301301, 501004]);
  });

  it('reads nested preferences from summary payloads', () => {
    expect(
      readChallengeIdSlots({
        preferences: { challengeIds: [42, 99, 7] },
      }),
    ).toEqual([42, 99, 7]);
  });

  it('is safe on missing payload', () => {
    expect(readChallengeIdSlots(null)).toEqual([]);
    expect(readChallengeIdSlots({})).toEqual([]);
  });
});

describe('readFirstSlotChallengeId', () => {
  it('uses the first slot only', () => {
    expect(readFirstSlotChallengeId({ challengeIds: [42, 99, 7] })).toBe(42);
    expect(readFirstSlotChallengeId({ challengeIds: [0, 99, 7] })).toBe(0);
    expect(readFirstSlotChallengeId({ lol: { challengeTokensSelected: '504001,301301' } })).toBe(
      504001,
    );
  });
});

describe('readEquippedChallengeIds', () => {
  it('drops empty slots', () => {
    expect(readEquippedChallengeIds({ challengeIds: [101, 0, -1, 101] })).toEqual([101, 101]);
  });
});

describe('makeChallenges', () => {
  it('clears equipped badges', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const result = await makeChallenges({ lcu }).removeBadges();
    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(CHALLENGE_PREFS_ROUTE, { challengeIds: [] });
  });

  it('clones the first equipped badge into all three slots', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ challengeIds: [42, 99, 7] }),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const result = await makeChallenges({ lcu }).cloneFirstBadge();
    expect(result.ok).toBe(true);
    expect(lcu.get).toHaveBeenCalledWith(CHALLENGE_CLIENT_STATE_ROUTE);
    expect(lcu.post).toHaveBeenCalledWith(CHALLENGE_PREFS_ROUTE, { challengeIds: [42, 42, 42] });
  });

  it('falls back to chat presence when client state has no first slot badge', async () => {
    const lcu = {
      get: vi.fn(async (route) => {
        if (route === CHALLENGE_CLIENT_STATE_ROUTE) return { challengeIds: [0, 99, 7] };
        if (route === CHAT_ME) return { lol: { challengeTokensSelected: '504001,301301' } };
        return {};
      }),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const result = await makeChallenges({ lcu }).cloneFirstBadge();
    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(CHALLENGE_PREFS_ROUTE, {
      challengeIds: [504001, 504001, 504001],
    });
  });

  it('refuses to clone when no first badge is equipped', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue({ challengeIds: [] }),
      post: vi.fn(),
    };
    const result = await makeChallenges({ lcu }).cloneFirstBadge();
    expect(result.ok).toBe(false);
    expect(lcu.post).not.toHaveBeenCalled();
  });
});
