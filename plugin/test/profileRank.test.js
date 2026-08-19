import { describe, it, expect, vi } from 'vitest';
import { GAMEFLOW_PHASE_ROUTE } from '../src/features/dodge.js';
import {
  readProfileRank,
  profileRankPatch,
  rankNeedsRefresh,
  applyProfileRank,
  startProfileRankRefresh,
} from '../src/features/profileRank.js';

describe('readProfileRank', () => {
  it('reads saved rank fields from settings', () => {
    expect(
      readProfileRank({
        profile_rank_tier: 'DIAMOND',
        profile_rank_division: 'II',
        profile_rank_queue: 'RANKED_FLEX_SR',
        profile_rank_crystal: 'PLATINUM',
      }),
    ).toEqual({
      tier: 'DIAMOND',
      division: 'II',
      queue: 'RANKED_FLEX_SR',
      crystal: 'PLATINUM',
    });
  });

  it('treats an empty tier as disabled', () => {
    expect(readProfileRank({ profile_rank_tier: '' }).tier).toBe('');
  });
});

describe('rankNeedsRefresh', () => {
  it('detects when presence drifted from the saved rank', () => {
    expect(
      rankNeedsRefresh(
        { rankedLeagueTier: 'GOLD', rankedLeagueDivision: 'I', rankedLeagueQueue: 'RANKED_SOLO_5x5', challengeCrystalLevel: 'IRON' },
        readProfileRank({ profile_rank_tier: 'DIAMOND', profile_rank_division: 'II', profile_rank_queue: 'RANKED_SOLO_5x5', profile_rank_crystal: 'IRON' }),
      ),
    ).toBe(true);
  });

  it('is false when presence already matches', () => {
    expect(
      rankNeedsRefresh(
        { rankedLeagueTier: 'DIAMOND', rankedLeagueDivision: 'II', rankedLeagueQueue: 'RANKED_SOLO_5x5', challengeCrystalLevel: 'PLATINUM' },
        readProfileRank({ profile_rank_tier: 'DIAMOND', profile_rank_division: 'II', profile_rank_queue: 'RANKED_SOLO_5x5', profile_rank_crystal: 'PLATINUM' }),
      ),
    ).toBe(false);
  });
});

describe('applyProfileRank', () => {
  it('writes rank and crystal when a tier is configured', async () => {
    const presence = {
      setRank: vi.fn().mockResolvedValue({ ok: true }),
      setBadges: vi.fn().mockResolvedValue({ ok: true }),
    };
    const result = await applyProfileRank(presence, readProfileRank({ profile_rank_tier: 'GOLD', profile_rank_division: 'III', profile_rank_queue: 'RANKED_SOLO_5x5', profile_rank_crystal: 'SILVER' }));
    expect(result.ok).toBe(true);
    expect(presence.setRank).toHaveBeenCalledWith({ tier: 'GOLD', division: 'III', queue: 'RANKED_SOLO_5x5' });
    expect(presence.setBadges).toHaveBeenCalledWith({ crystal: 'SILVER' });
  });
});

describe('startProfileRankRefresh', () => {
  it('re-applies saved rank when gameflow returns to the client', async () => {
    const handlers = new Map();
    const presence = {
      setRank: vi.fn().mockResolvedValue({ ok: true }),
      setBadges: vi.fn().mockResolvedValue({ ok: true }),
    };
    const lcu = {
      get: vi.fn().mockResolvedValue({
        lol: {
          rankedLeagueTier: 'GOLD',
          rankedLeagueDivision: 'I',
          rankedLeagueQueue: 'RANKED_SOLO_5x5',
          challengeCrystalLevel: 'IRON',
        },
      }),
    };
    startProfileRankRefresh({
      subscribe: (route, fn) => {
        handlers.set(route, fn);
        return () => {};
      },
      getSettings: () => ({
        profile_rank_tier: 'DIAMOND',
        profile_rank_division: 'II',
        profile_rank_queue: 'RANKED_SOLO_5x5',
        profile_rank_crystal: 'PLATINUM',
      }),
      presence,
      lcu,
    });

    await vi.waitFor(() => expect(presence.setRank).toHaveBeenCalledTimes(1));

    presence.setRank.mockClear();
    presence.setBadges.mockClear();
    await handlers.get(GAMEFLOW_PHASE_ROUTE)('InProgress');
    expect(presence.setRank).not.toHaveBeenCalled();

    await handlers.get(GAMEFLOW_PHASE_ROUTE)('Lobby');
    await vi.waitFor(() => expect(presence.setRank).toHaveBeenCalledTimes(1));
  });
});

describe('profileRankPatch', () => {
  it('builds a settings patch object', () => {
    expect(profileRankPatch({ tier: 'GOLD', division: 'IV', queue: 'RANKED_TFT', crystal: 'BRONZE' })).toEqual({
      profile_rank_tier: 'GOLD',
      profile_rank_division: 'IV',
      profile_rank_queue: 'RANKED_TFT',
      profile_rank_crystal: 'BRONZE',
    });
  });
});
