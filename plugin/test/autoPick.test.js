import { describe, it, expect, vi } from 'vitest';
import { decideAction, startChampSelectAutomation } from '../src/features/autoPick.js';
import { renderAutoPick } from '../src/ui/panel.js';

const act = (over = {}) => ({
  id: 1,
  actorCellId: 0,
  championId: 0,
  completed: false,
  isInProgress: true,
  type: 'pick',
  ...over,
});
const session = (actions, extra = {}) => ({ localPlayerCellId: 0, actions: [actions], ...extra });

const settings = (over = {}) => ({
  auto_pick: false,
  auto_pick_champion_id: 0,
  auto_pick_champion_id_2: 0,
  insta_lock: false,
  auto_ban: false,
  auto_ban_champion_id: 0,
  ...over,
});

describe('decideAction', () => {
  it('does nothing when both features are off', () => {
    expect(decideAction(session([act()]), settings())).toBe(null);
  });

  it('hovers the pick when auto pick is on and insta lock is off', () => {
    // Hover, not lock: it shows the team your intent while leaving you free to
    // change your mind, which is what most people want from "auto pick".
    const d = decideAction(
      session([act({ id: 5 })]),
      settings({ auto_pick: true, auto_pick_champion_id: 103 }),
    );
    expect(d).toEqual({ actionId: 5, championId: 103, completed: false, kind: 'pick' });
  });

  it('locks the pick immediately when insta lock is on', () => {
    const d = decideAction(
      session([act({ id: 5 })]),
      settings({ auto_pick: true, auto_pick_champion_id: 103, insta_lock: true }),
    );
    expect(d.completed).toBe(true);
  });

  it('always completes a ban, because a hovered ban bans nothing', () => {
    const d = decideAction(
      session([act({ id: 8, type: 'ban' })]),
      settings({ auto_ban: true, auto_ban_champion_id: 55 }),
    );
    expect(d).toEqual({ actionId: 8, championId: 55, completed: true, kind: 'ban' });
  });

  it('bans before it picks when both are pending', () => {
    // Ban phase comes first, and acting on the pick during it is rejected.
    const d = decideAction(
      session([act({ id: 8, type: 'ban' }), act({ id: 9, type: 'pick' })]),
      settings({
        auto_pick: true,
        auto_pick_champion_id: 103,
        auto_ban: true,
        auto_ban_champion_id: 55,
      }),
    );
    expect(d.kind).toBe('ban');
  });

  it('ignores a feature with no champion chosen', () => {
    // Champion id 0 is "none". Sending it would blank the hover.
    expect(
      decideAction(session([act()]), settings({ auto_pick: true, auto_pick_champion_id: 0 })),
    ).toBe(null);
  });

  it('does nothing when the action belongs to someone else', () => {
    expect(
      decideAction(
        session([act({ actorCellId: 4 })]),
        settings({ auto_pick: true, auto_pick_champion_id: 103 }),
      ),
    ).toBe(null);
  });

  it('falls back to the second pick when the first is banned', () => {
    const d = decideAction(
      session([act({ id: 5 })], { bans: { myTeamBans: [103], theirTeamBans: [] } }),
      settings({ auto_pick: true, auto_pick_champion_id: 103, auto_pick_champion_id_2: 64 }),
    );
    expect(d.championId).toBe(64);
  });

  it('falls back when a teammate already locked the first champion', () => {
    const d = decideAction(
      session([
        act({ id: 1, actorCellId: 1, championId: 103, completed: true, isInProgress: false }),
        act({ id: 5 }),
      ]),
      settings({ auto_pick: true, auto_pick_champion_id: 103, auto_pick_champion_id_2: 64 }),
    );
    expect(d.championId).toBe(64);
  });

  it('keeps the first pick when it is still available', () => {
    const d = decideAction(
      session([act({ id: 5 })]),
      settings({ auto_pick: true, auto_pick_champion_id: 103, auto_pick_champion_id_2: 64 }),
    );
    expect(d.championId).toBe(103);
  });

  it('does nothing when both picks are unavailable', () => {
    expect(
      decideAction(
        session([act({ id: 5 })], { bans: { myTeamBans: [103, 64], theirTeamBans: [] } }),
        settings({ auto_pick: true, auto_pick_champion_id: 103, auto_pick_champion_id_2: 64 }),
      ),
    ).toBe(null);
  });

  it('uses the second pick when the first is unset', () => {
    const d = decideAction(
      session([act({ id: 5 })]),
      settings({ auto_pick: true, auto_pick_champion_id: 0, auto_pick_champion_id_2: 64 }),
    );
    expect(d.championId).toBe(64);
  });
});

describe('startChampSelectAutomation', () => {
  function harness(over = {}) {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    let handler;
    const subscribe = (_r, fn) => {
      handler = fn;
      return () => {};
    };
    const stop = startChampSelectAutomation({
      getSettings: () => settings(over),
      champSelect: { commit },
      subscribe,
    });
    return { commit, fire: (s) => handler(s), stop };
  }

  it('commits the decided action', async () => {
    const h = harness({ auto_pick: true, auto_pick_champion_id: 103 });
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledWith(5, 103, false);
  });

  it('does not fire twice for the same action', async () => {
    // The session route emits on every change, and champ select changes
    // constantly. Without this every teammate's hover would re-send our pick.
    const h = harness({ auto_pick: true, auto_pick_champion_id: 103 });
    await h.fire(session([act({ id: 5 })]));
    await h.fire(session([act({ id: 5 })]));
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledTimes(1);
  });

  it('acts again for a different action', async () => {
    const h = harness({
      auto_pick: true,
      auto_pick_champion_id: 103,
      auto_ban: true,
      auto_ban_champion_id: 55,
    });
    await h.fire(session([act({ id: 8, type: 'ban' })]));
    await h.fire(session([act({ id: 9, type: 'pick' })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('forgets what it did once champ select ends', async () => {
    // Action ids restart, so remembering across sessions would make the next
    // game's action look already handled.
    const h = harness({ auto_pick: true, auto_pick_champion_id: 103 });
    await h.fire(session([act({ id: 5 })]));
    await h.fire(null);
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('replaces the hover when the champion is changed mid-select', async () => {
    // The panel can change the pick while the clock is still running. The next
    // look at the session (or a refresh with no new event) must send the new
    // champion, not keep the one it already hovered.
    let current = settings({ auto_pick: true, auto_pick_champion_id: 103 });
    const commit = vi.fn().mockResolvedValue({ ok: true });
    let handler;
    const ctl = startChampSelectAutomation({
      getSettings: () => current,
      champSelect: { commit },
      subscribe: (_r, fn) => {
        handler = fn;
        return () => {};
      },
    });

    await handler(session([act({ id: 5, championId: 0 })]));
    current = settings({ auto_pick: true, auto_pick_champion_id: 64 });
    await ctl.refresh();

    expect(commit).toHaveBeenNthCalledWith(1, 5, 103, false);
    expect(commit).toHaveBeenNthCalledWith(2, 5, 64, false);
  });

  it('locks after insta lock is turned on mid-hover', async () => {
    let current = settings({ auto_pick: true, auto_pick_champion_id: 103, insta_lock: false });
    const commit = vi.fn().mockResolvedValue({ ok: true });
    let handler;
    const ctl = startChampSelectAutomation({
      getSettings: () => current,
      champSelect: { commit },
      subscribe: (_r, fn) => {
        handler = fn;
        return () => {};
      },
    });

    await handler(session([act({ id: 5, championId: 0 })]));
    current = settings({ auto_pick: true, auto_pick_champion_id: 103, insta_lock: true });
    await handler(session([act({ id: 5, championId: 103 })]));

    expect(commit.mock.calls[0][2]).toBe(false);
    expect(commit.mock.calls[1]).toEqual([5, 103, true]);
  });

  it('picks again after a dodge even if the empty session never arrived', async () => {
    // Practice Tool dodge often jumps straight into a new session. Action ids
    // restart, the champion is the same, and the Delete/404 can be missed —
    // remembering the last action would skip the new game's pick.
    const h = harness({ auto_pick: true, auto_pick_champion_id: 103, insta_lock: true });
    await h.fire(session([act({ id: 5, championId: 0 })]));
    await h.fire(session([act({ id: 5, championId: 103, completed: true, isInProgress: false })]));
    await h.fire(session([act({ id: 5, championId: 0 })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('retries after a refusal rather than giving up on the action', async () => {
    // A ban can be refused because somebody banned it a moment earlier; a pick
    // can be refused mid-transition. The phase is still open, so try again.
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'refused (409)' })
      .mockResolvedValueOnce({ ok: true });
    let handler;
    startChampSelectAutomation({
      getSettings: () => settings({ auto_pick: true, auto_pick_champion_id: 103 }),
      champSelect: { commit },
      subscribe: (_r, fn) => { handler = fn; return () => {}; },
    });

    await handler(session([act({ id: 5 })]));
    await handler(session([act({ id: 5 })]));

    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('tries the second pick after the client refuses the first', async () => {
    // 409 lands before the session has the ban listed, so availability has
    // to remember the refusal rather than wait for an update that may not
    // arrive before the clock runs out.
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'refused (409)' })
      .mockResolvedValueOnce({ ok: true });
    let handler;
    startChampSelectAutomation({
      getSettings: () =>
        settings({ auto_pick: true, auto_pick_champion_id: 103, auto_pick_champion_id_2: 64 }),
      champSelect: { commit },
      subscribe: (_r, fn) => {
        handler = fn;
        return () => {};
      },
    });

    await handler(session([act({ id: 5 })]));
    await handler(session([act({ id: 5 })]));

    expect(commit.mock.calls[0][1]).toBe(103);
    expect(commit.mock.calls[1][1]).toBe(64);
  });
});

describe('renderAutoPick', () => {
  it('offers first and second pick slots', () => {
    const html = renderAutoPick(
      {
        auto_pick: true,
        auto_pick_champion_id: 103,
        auto_pick_champion_id_2: 64,
        insta_lock: false,
      },
      {
        disabled: false,
        list: [{ id: 103, name: 'Ahri' }],
        query: '',
        list2: [{ id: 64, name: 'Lee Sin' }],
        query2: '',
      },
    );
    expect(html).toContain('First pick');
    expect(html).toContain('Second pick');
    expect(html).toContain('data-for="auto_pick_champion_id"');
    expect(html).toContain('data-for="auto_pick_champion_id_2"');
  });
});
