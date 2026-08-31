import { describe, it, expect, vi } from 'vitest';
import {
  MUTE_TOGGLE_ROUTE,
  MUTED_PLAYERS_ROUTE,
  isPlayerMuted,
  muteTeammates,
} from '../src/features/muteAll.js';

describe('isPlayerMuted', () => {
  it('returns false for empty input or empty list', () => {
    expect(isPlayerMuted(null, [])).toBe(false);
    expect(isPlayerMuted({}, [])).toBe(false);
    expect(isPlayerMuted({ puuid: 'p1' }, null)).toBe(false);
    expect(isPlayerMuted({ puuid: 'p1' }, [])).toBe(false);
  });

  it('matches by puuid', () => {
    const player = { puuid: 'puuid-1', summonerId: 100 };
    const mutedList = [{ puuid: 'puuid-1' }, { puuid: 'puuid-2' }];
    expect(isPlayerMuted(player, mutedList)).toBe(true);
    expect(isPlayerMuted({ puuid: 'puuid-3' }, mutedList)).toBe(false);
  });

  it('matches by summonerId', () => {
    const player = { summonerId: 12345 };
    const mutedList = [{ summonerId: '12345' }];
    expect(isPlayerMuted(player, mutedList)).toBe(true);
    expect(isPlayerMuted({ summonerId: 99999 }, mutedList)).toBe(false);
  });

  it('matches by obfuscatedPuuid', () => {
    const player = { obfuscatedPuuid: 'obf-puuid-1' };
    const mutedList = [{ obfuscatedPuuid: 'obf-puuid-1' }];
    expect(isPlayerMuted(player, mutedList)).toBe(true);
    expect(isPlayerMuted({ obfuscatedPuuid: 'obf-puuid-2' }, mutedList)).toBe(false);
  });

  it('matches by obfuscatedSummonerId', () => {
    const player = { obfuscatedSummonerId: 54321 };
    const mutedList = [{ obfuscatedSummonerId: 54321 }];
    expect(isPlayerMuted(player, mutedList)).toBe(true);
    expect(isPlayerMuted({ obfuscatedSummonerId: 11111 }, mutedList)).toBe(false);
  });

  it('does not match on empty strings or zeros', () => {
    const player = { puuid: '', summonerId: 0, obfuscatedPuuid: '', obfuscatedSummonerId: 0 };
    const mutedList = [{ puuid: '', summonerId: 0, obfuscatedPuuid: '', obfuscatedSummonerId: 0 }];
    expect(isPlayerMuted(player, mutedList)).toBe(false);
  });
});

describe('muteTeammates', () => {
  it('returns failure when lcu is not provided', async () => {
    const res = await muteTeammates(null, { myTeam: [{ cellId: 1 }] });
    expect(res).toEqual({ mutedCount: 0, totalTeammates: 0, success: false });
  });

  it('returns success with 0 teammates when myTeam is empty', async () => {
    const lcu = { get: vi.fn(), post: vi.fn() };
    const res = await muteTeammates(lcu, { myTeam: [], localPlayerCellId: 0 });
    expect(res).toEqual({ mutedCount: 0, totalTeammates: 0, success: true });
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('excludes localPlayerCellId from teammates', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'local-puuid', summonerId: 1 },
        { cellId: 1, puuid: 'mate-puuid-1', summonerId: 2 },
        { cellId: 2, puuid: 'mate-puuid-2', summonerId: 3 },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(res).toEqual({ mutedCount: 2, totalTeammates: 2, success: true });
    expect(lcu.post).toHaveBeenCalledTimes(2);
    expect(lcu.post).not.toHaveBeenCalledWith(
      MUTE_TOGGLE_ROUTE,
      expect.objectContaining({ puuid: 'local-puuid' })
    );
  });

  it('mutes all unmuted teammates when none are already muted', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'me', summonerId: 100 },
        { cellId: 1, puuid: 'mate1', summonerId: 101, obfuscatedPuuid: 'obf1', obfuscatedSummonerId: 201 },
        { cellId: 2, puuid: 'mate2', summonerId: 102, obfuscatedPuuid: 'obf2', obfuscatedSummonerId: 202 },
        { cellId: 3, puuid: 'mate3', summonerId: 103, obfuscatedPuuid: 'obf3', obfuscatedSummonerId: 203 },
        { cellId: 4, puuid: 'mate4', summonerId: 104, obfuscatedPuuid: 'obf4', obfuscatedSummonerId: 204 },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(lcu.get).toHaveBeenCalledWith(MUTED_PLAYERS_ROUTE);
    expect(lcu.post).toHaveBeenCalledTimes(4);
    expect(lcu.post).toHaveBeenCalledWith(MUTE_TOGGLE_ROUTE, {
      puuid: 'mate1',
      summonerId: 101,
      obfuscatedPuuid: 'obf1',
      obfuscatedSummonerId: 201,
    });
    expect(res).toEqual({ mutedCount: 4, totalTeammates: 4, success: true });
  });

  it('skips teammates that are already muted', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { puuid: 'mate1' },
        { summonerId: 103 },
      ]),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'me' },
        { cellId: 1, puuid: 'mate1', summonerId: 101 },
        { cellId: 2, puuid: 'mate2', summonerId: 102 },
        { cellId: 3, puuid: 'mate3', summonerId: 103 },
        { cellId: 4, puuid: 'mate4', summonerId: 104 },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(lcu.post).toHaveBeenCalledTimes(2);
    expect(lcu.post).toHaveBeenCalledWith(
      MUTE_TOGGLE_ROUTE,
      expect.objectContaining({ puuid: 'mate2' })
    );
    expect(lcu.post).toHaveBeenCalledWith(
      MUTE_TOGGLE_ROUTE,
      expect.objectContaining({ puuid: 'mate4' })
    );
    expect(res).toEqual({ mutedCount: 2, totalTeammates: 4, success: true });
  });

  it('succeeds with 0 muted when all teammates are already muted', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { puuid: 'mate1' },
        { puuid: 'mate2' },
      ]),
      post: vi.fn(),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'me' },
        { cellId: 1, puuid: 'mate1' },
        { cellId: 2, puuid: 'mate2' },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(lcu.post).not.toHaveBeenCalled();
    expect(res).toEqual({ mutedCount: 0, totalTeammates: 2, success: true });
  });

  it('handles GET muted-players failure gracefully by assuming empty list', async () => {
    const lcu = {
      get: vi.fn().mockRejectedValue(new Error('LCU error')),
      post: vi.fn().mockResolvedValue({ ok: true }),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'me' },
        { cellId: 1, puuid: 'mate1' },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(lcu.post).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ mutedCount: 1, totalTeammates: 1, success: true });
  });

  it('handles POST mute failures and reports success: false', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('Network error')),
    };
    const session = {
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, puuid: 'me' },
        { cellId: 1, puuid: 'mate1' },
        { cellId: 2, puuid: 'mate2' },
      ],
    };

    const res = await muteTeammates(lcu, session);
    expect(res).toEqual({ mutedCount: 1, totalTeammates: 2, success: false });
  });
});
