import { describe, it, expect, vi } from 'vitest';
import {
  findMyAction,
  isBanPhase,
  actionRoute,
  makeChampSelect,
  unavailableChampionIds,
} from '../src/features/champSelect.js';

const session = ({ cell = 0, actions = [], ...extra } = {}) => ({
  localPlayerCellId: cell,
  actions,
  ...extra,
});

const action = (over = {}) => ({
  id: 1,
  actorCellId: 0,
  championId: 0,
  completed: false,
  isInProgress: true,
  type: 'pick',
  ...over,
});

describe('findMyAction', () => {
  it('finds my in-progress pick', () => {
    const s = session({ actions: [[action({ id: 7 })]] });
    expect(findMyAction(s, 'pick').id).toBe(7);
  });

  it('ignores actions belonging to other players', () => {


    const s = session({ actions: [[action({ id: 7, actorCellId: 3 })]] });
    expect(findMyAction(s, 'pick')).toBe(null);
  });

  it('ignores an action that is already done', () => {
    const s = session({ actions: [[action({ completed: true })]] });
    expect(findMyAction(s, 'pick')).toBe(null);
  });

  it('ignores an action that has not started yet', () => {

    const s = session({ actions: [[action({ isInProgress: false })]] });
    expect(findMyAction(s, 'pick')).toBe(null);
  });

  it('does not confuse a ban with a pick', () => {
    const s = session({ actions: [[action({ id: 4, type: 'ban' })]] });
    expect(findMyAction(s, 'pick')).toBe(null);
    expect(findMyAction(s, 'ban').id).toBe(4);
  });

  it('searches every phase, not just the first', () => {
    const s = session({
      actions: [
        [action({ id: 1, type: 'ban', completed: true })],
        [action({ id: 9, type: 'pick' })],
      ],
    });
    expect(findMyAction(s, 'pick').id).toBe(9);
  });

  it('is safe on a session that is not champ select at all', () => {
    expect(findMyAction(null, 'pick')).toBe(null);
    expect(findMyAction({}, 'pick')).toBe(null);
  });
});

describe('isBanPhase', () => {
  it('is true while any ban action is in progress', () => {
    expect(isBanPhase(session({ actions: [[action({ type: 'ban' })]] }))).toBe(true);
  });

  it('is false once bans are done', () => {
    expect(
      isBanPhase(session({ actions: [[action({ type: 'ban', isInProgress: false })]] })),
    ).toBe(false);
  });
});

describe('unavailableChampionIds', () => {
  it('treats team bans as unavailable', () => {
    const ids = unavailableChampionIds(
      session({ bans: { myTeamBans: [103], theirTeamBans: [55] } }),
    );
    expect([...ids].sort((a, b) => a - b)).toEqual([55, 103]);
  });

  it('treats a completed pick as taken', () => {
    const ids = unavailableChampionIds(
      session({
        actions: [[action({ championId: 64, completed: true, isInProgress: false })]],
      }),
    );
    expect(ids.has(64)).toBe(true);
  });

  it('does not treat a mere hover as taken', () => {

    const ids = unavailableChampionIds(
      session({ actions: [[action({ championId: 64, completed: false })]] }),
    );
    expect(ids.has(64)).toBe(false);
  });
});

describe('actionRoute', () => {
  it('targets the action by id', () => {
    expect(actionRoute(42)).toBe('/lol-champ-select/v1/session/actions/42');
  });
});

describe('makeChampSelect', () => {
  it('locks a champion by hovering, completing, then marking the action done', async () => {
    const lcu = { patch: vi.fn().mockResolvedValue({ ok: true }), post: vi.fn().mockResolvedValue({ ok: true, status: 204 }) };

    const result = await makeChampSelect({ lcu }).commit(42, 103, true, 'pick');

    expect(result.ok).toBe(true);
    expect(lcu.patch).toHaveBeenNthCalledWith(1, actionRoute(42), {
      championId: 103,
    });
    expect(lcu.post).toHaveBeenCalledWith('/lol-champ-select/v1/session/actions/42/complete');
    expect(lcu.patch).toHaveBeenLastCalledWith(actionRoute(42), {
      championId: 103,
      completed: true,
    });
  });

  it('hovers without locking when asked not to complete', async () => {

    const lcu = { patch: vi.fn().mockResolvedValue({ ok: true }) };

    await makeChampSelect({ lcu }).commit(42, 103, false);

    expect(lcu.patch).toHaveBeenCalledWith(actionRoute(42), {
      championId: 103,
    });
  });

  it('falls back to a single completed patch when complete is refused', async () => {
    const lcu = {
      patch: vi.fn().mockResolvedValue({ ok: true }),
      post: vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    };

    const result = await makeChampSelect({ lcu }).commit(42, 55, true, 'ban');

    expect(result.ok).toBe(true);
    expect(lcu.patch).toHaveBeenLastCalledWith(actionRoute(42), {
      championId: 55,
      completed: true,
    });
  });

  it('survives the call throwing', async () => {
    const lcu = { patch: vi.fn().mockRejectedValue(new Error('gone')) };
    const result = await makeChampSelect({ lcu }).commit(1, 2, true);
    expect(result.ok).toBe(false);
  });
});
