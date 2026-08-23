import { describe, it, expect, vi } from 'vitest';
import { decideAction, startChampSelectAutomation } from '../src/features/autoPick.js';
import { SESSION_ROUTE } from '../src/features/champSelect.js';
import { GAMEFLOW_PHASE_ROUTE } from '../src/features/dodge.js';
import { renderAutoPick, renderAutoBan, autoPickOrder, toggleAutoPickChampion } from '../src/ui/panel.js';
import { emptyAutoPickByRole } from '../src/features/autoPickRoles.js';

const act = (over = {}) => ({
  id: 1,
  actorCellId: 0,
  championId: 0,
  completed: false,
  isInProgress: true,
  type: 'pick',
  ...over,
});

const session = (actions, extra = {}) => ({
  localPlayerCellId: 0,
  actions: [actions],
  myTeam: [{ cellId: 0, assignedPosition: 'MIDDLE' }],
  ...extra,
});

const rolePicks = (over = {}) => ({ ...emptyAutoPickByRole(), ...over });

const mid = (...ids) => ({
  auto_pick: true,
  auto_pick_by_role: rolePicks({ MIDDLE: ids }),
});

const settings = (over = {}) => ({
  auto_pick: false,
  auto_pick_by_role: rolePicks(),
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
    const d = decideAction(session([act({ id: 5 })]), settings(mid(103)));
    expect(d).toEqual({ actionId: 5, championId: 103, completed: false, kind: 'pick' });
  });

  it('locks the pick immediately when insta lock is on', () => {
    const d = decideAction(
      session([act({ id: 5 })]),
      settings({ ...mid(103), insta_lock: true }),
    );
    expect(d.completed).toBe(true);
  });

  it('does not try to ban during planning, since nothing completes there', () => {
    expect(
      decideAction(
        session([act({ id: 8, type: 'ban', isInProgress: true })], {
          timer: { phase: 'PLANNING' },
        }),
        settings({ auto_ban: true, auto_ban_champion_id: 55 }),
      ),
    ).toBe(null);
  });

  it('does not try to ban a champion that is already banned', () => {
    expect(
      decideAction(
        session([act({ id: 8, type: 'ban' })], { bans: { theirTeamBans: [67] } }),
        settings({ auto_ban: true, auto_ban_champion_id: 67 }),
      ),
    ).toBe(null);
  });

  it('hovers without locking during planning even when the action is in progress', () => {
    const d = decideAction(
      session([act({ id: 5, isInProgress: true })], { timer: { phase: 'PLANNING' } }),
      settings({ ...mid(103), insta_lock: true }),
    );
    expect(d).toEqual({ actionId: 5, championId: 103, completed: false, kind: 'pick' });
  });

  it('locks once planning gives way to the real pick turn', () => {
    const d = decideAction(
      session([act({ id: 5, isInProgress: true })], { timer: { phase: 'BAN_PICK' } }),
      settings({ ...mid(103), insta_lock: true }),
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
    const d = decideAction(
      session([act({ id: 8, type: 'ban' }), act({ id: 9, type: 'pick' })]),
      settings({
        ...mid(103),
        auto_ban: true,
        auto_ban_champion_id: 55,
      }),
    );
    expect(d.kind).toBe('ban');
  });

  it('ignores a feature with no champion chosen for the assigned role', () => {
    expect(decideAction(session([act()]), settings({ auto_pick: true }))).toBe(null);
  });

  it('does nothing when the assigned role is fill', () => {
    expect(
      decideAction(
        session([act()], { myTeam: [{ cellId: 0, assignedPosition: 'FILL' }] }),
        settings(mid(103)),
      ),
    ).toBe(null);
  });

  it('does nothing when no role is assigned yet', () => {
    expect(
      decideAction(
        session([act()], { myTeam: [{ cellId: 0, assignedPosition: '' }] }),
        settings(mid(103)),
      ),
    ).toBe(null);
  });

  it('uses only the picks configured for the assigned role', () => {
    const d = decideAction(
      session([act({ id: 5 })], { myTeam: [{ cellId: 0, assignedPosition: 'TOP' }] }),
      settings({
        auto_pick: true,
        auto_pick_by_role: rolePicks({ TOP: [64], MIDDLE: [103] }),
      }),
    );
    expect(d.championId).toBe(64);
  });

  it('does nothing when the action belongs to someone else', () => {
    expect(
      decideAction(session([act({ actorCellId: 4 })]), settings(mid(103))),
    ).toBe(null);
  });

  it('falls back to the second pick when the first is banned', () => {
    const d = decideAction(
      session([act({ id: 5 })], { bans: { myTeamBans: [103], theirTeamBans: [] } }),
      settings(mid(103, 64)),
    );
    expect(d.championId).toBe(64);
  });

  it('falls back when a teammate already locked the first champion', () => {
    const d = decideAction(
      session([
        act({ id: 1, actorCellId: 1, championId: 103, completed: true, isInProgress: false }),
        act({ id: 5 }),
      ]),
      settings(mid(103, 64)),
    );
    expect(d.championId).toBe(64);
  });

  it('keeps the first pick when it is still available', () => {
    const d = decideAction(session([act({ id: 5 })]), settings(mid(103, 64)));
    expect(d.championId).toBe(103);
  });

  it('does nothing when both picks are unavailable', () => {
    expect(
      decideAction(
        session([act({ id: 5 })], { bans: { myTeamBans: [103, 64], theirTeamBans: [] } }),
        settings(mid(103, 64)),
      ),
    ).toBe(null);
  });

  it('hovers during planning even when the pick is not in progress yet', () => {
    const d = decideAction(
      session([act({ id: 5, isInProgress: false })], { timer: { phase: 'PLANNING' } }),
      settings({ ...mid(103), insta_lock: true }),
    );
    expect(d).toEqual({ actionId: 5, championId: 103, completed: false, kind: 'pick' });
  });

  it('does not ban until the ban action is in progress', () => {
    expect(
      decideAction(
        session([act({ id: 8, type: 'ban', isInProgress: false })]),
        settings({ auto_ban: true, auto_ban_champion_id: 55 }),
      ),
    ).toBe(null);
  });
});

describe('startChampSelectAutomation', () => {
  function makeSubscribe() {
    const handlers = new Map();
    const subscribe = (route, fn) => {
      handlers.set(route, fn);
      return () => handlers.delete(route);
    };
    return {
      subscribe,
      enterChampSelect: () => handlers.get(GAMEFLOW_PHASE_ROUTE)('ChampSelect'),
      fireSession: (session) => handlers.get(SESSION_ROUTE)?.(session),
    };
  }

  function harness(over = {}) {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    const stop = startChampSelectAutomation({
      getSettings: () => settings(over),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();
    return { commit, fire: fireSession, stop };
  }

  it('does not subscribe to session while gameflow is not ChampSelect', () => {
    const routes = [];
    const subscribe = vi.fn((route, fn) => {
      routes.push(route);
      return () => {};
    });
    startChampSelectAutomation({
      getSettings: () => settings(),
      champSelect: { commit: vi.fn() },
      subscribe,
    });
    expect(routes).toEqual([GAMEFLOW_PHASE_ROUTE]);
  });

  it('arms session polling only after entering ChampSelect', () => {
    const handlers = new Map();
    const routes = [];
    const subscribe = (route, fn) => {
      routes.push(route);
      handlers.set(route, fn);
      return () => handlers.delete(route);
    };
    startChampSelectAutomation({
      getSettings: () => settings(),
      champSelect: { commit: vi.fn() },
      subscribe,
    });
    expect(routes).toEqual([GAMEFLOW_PHASE_ROUTE]);
    handlers.get(GAMEFLOW_PHASE_ROUTE)('Lobby');
    expect(routes).toEqual([GAMEFLOW_PHASE_ROUTE]);
    handlers.get(GAMEFLOW_PHASE_ROUTE)('ChampSelect');
    expect(routes).toEqual([GAMEFLOW_PHASE_ROUTE, SESSION_ROUTE]);
    handlers.get(GAMEFLOW_PHASE_ROUTE)('Lobby');
    expect(routes).toEqual([GAMEFLOW_PHASE_ROUTE, SESSION_ROUTE]);
  });

  it('commits the decided action', async () => {
    const h = harness(mid(103));
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledWith(5, 103, false, 'pick');
  });

  it('does not fire twice for the same action', async () => {


    const h = harness(mid(103));
    await h.fire(session([act({ id: 5 })]));
    await h.fire(session([act({ id: 5 })]));
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledTimes(1);
  });

  it('acts again for a different action', async () => {
    const h = harness({ ...mid(103), auto_ban: true, auto_ban_champion_id: 55 });
    await h.fire(session([act({ id: 8, type: 'ban' })]));
    await h.fire(session([act({ id: 9, type: 'pick' })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('forgets what it did once champ select ends', async () => {


    const h = harness(mid(103));
    await h.fire(session([act({ id: 5 })]));
    await h.fire(null);
    await h.fire(session([act({ id: 5 })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('replaces the hover when the champion is changed mid-select', async () => {



    let current = settings(mid(103));
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    const ctl = startChampSelectAutomation({
      getSettings: () => current,
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5, championId: 0 })]));
    current = settings(mid(64));
    await ctl.refresh();

    expect(commit).toHaveBeenNthCalledWith(1, 5, 103, false, 'pick');
    expect(commit).toHaveBeenNthCalledWith(2, 5, 64, false, 'pick');
  });

  it('locks after insta lock is turned on mid-hover', async () => {
    let current = settings({ ...mid(103), insta_lock: false });
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    const ctl = startChampSelectAutomation({
      getSettings: () => current,
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5, championId: 0 })]));
    current = settings({ ...mid(103), insta_lock: true });
    await fireSession(session([act({ id: 5, championId: 103 })]));

    expect(commit.mock.calls[0][2]).toBe(false);
    expect(commit.mock.calls[1]).toEqual([5, 103, true, 'pick']);
  });

  it('retries confirm when the champion is selected but not completed', async () => {
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () =>
        settings({ ...mid(103), insta_lock: true }),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5, championId: 0 })]));
    await fireSession(session([act({ id: 5, championId: 103, completed: false })]));

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[0]).toEqual([5, 103, true, 'pick']);
    expect(commit.mock.calls[1]).toEqual([5, 103, true, 'pick']);
  });

  it('picks again after a dodge even if the empty session never arrived', async () => {



    const h = harness({ ...mid(103), insta_lock: true });
    await h.fire(session([act({ id: 5, championId: 0 })]));
    await h.fire(session([act({ id: 5, championId: 103, completed: true, isInProgress: false })]));
    await h.fire(session([act({ id: 5, championId: 0 })]));
    expect(h.commit).toHaveBeenCalledTimes(2);
  });

  it('retries after a refusal rather than giving up on the action', async () => {


    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'refused (409)' })
      .mockResolvedValueOnce({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () => settings(mid(103)),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5 })]));
    await fireSession(session([act({ id: 5 })]));

    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('picks once the turn becomes in progress on a later poll', async () => {
    vi.useFakeTimers();
    const commit = vi.fn().mockResolvedValue({ ok: true });
    let n = 0;
    const getSession = vi.fn(async () => {
      n += 1;
      return session([act({ id: 5, isInProgress: n >= 1 })]);
    });
    startChampSelectAutomation({
      getSettings: () => settings({ ...mid(103), insta_lock: true }),
      champSelect: { commit },
      subscribe: (route, fn) => {
        if (route === GAMEFLOW_PHASE_ROUTE) fn('ChampSelect');
        if (route === SESSION_ROUTE) void fn(session([act({ id: 5, isInProgress: false })]));
        return () => {};
      },
      getSession,
      setTimeoutImpl: setTimeout,
    });

    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    expect(commit).toHaveBeenCalledWith(5, 103, true, 'pick');
  });

  it('tries the second pick after the client refuses the first', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'refused (409)' })
      .mockResolvedValueOnce({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () =>
        settings(mid(103, 64)),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5 })]));
    await fireSession(session([act({ id: 5 })]));

    expect(commit.mock.calls[0][1]).toBe(103);
    expect(commit.mock.calls[1][1]).toBe(64);
  });

  it('keeps the same champion when only the lock was refused', async () => {
    // A refused hover means the champion is gone, but a refused completion just
    // means it could not be locked yet. Giving up on the first pick there would
    // hand the player their second choice for no reason.
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retry: true, reason: 'would not lock it (500)' })
      .mockResolvedValueOnce({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () =>
        settings(mid(103, 64)),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 5 })]));
    await fireSession(session([act({ id: 5 })]));

    expect(commit.mock.calls[0][1]).toBe(103);
    expect(commit.mock.calls[1][1]).toBe(103);
  });

  it('stops asking for a ban the client has refused', async () => {
    // A refused ban is not going to start working on the next poll, and there is
    // no second ban target to fall back to, so retrying it every 500ms only
    // hammers the client for the rest of the ban phase.
    const commit = vi.fn().mockResolvedValue({ ok: false, reason: 'refused (400)' });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () => settings({ auto_ban: true, auto_ban_champion_id: 55 }),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 8, type: 'ban' })]));
    await fireSession(session([act({ id: 8, type: 'ban' })]));

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('keeps trying a ban whose completion was only refused for now', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retry: true, reason: 'would not ban it (500)' })
      .mockResolvedValueOnce({ ok: true });
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () => settings({ auto_ban: true, auto_ban_champion_id: 55 }),
      champSelect: { commit },
      subscribe,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 8, type: 'ban' })]));
    await fireSession(session([act({ id: 8, type: 'ban' })]));

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1][1]).toBe(55);
  });

  it('reports what the action looked like when it committed', async () => {
    // A commit that reports success while the action keeps its old champion
    // means the client accepted the call and ignored it.
    const commit = vi.fn().mockResolvedValue({ ok: true });
    const onResult = vi.fn();
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () => settings({ auto_ban: true, auto_ban_champion_id: 55 }),
      champSelect: { commit },
      subscribe,
      onResult,
    });
    enterChampSelect();

    await fireSession(session([act({ id: 8, type: 'ban', championId: 0 })]));

    expect(onResult.mock.calls[0][2]).toEqual({
      actionId: 8,
      championId: 0,
      completed: false,
      phase: '',
    });
  });

  it('tells the UI the session is gone when it is stopped', async () => {
    // Going in game stops the controller directly, and whoever hears the phase
    // change first decides whether anything clears the dodge dock. Leaving that
    // to chance is what left the button on screen for the rest of the session.
    const onSession = vi.fn();
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    const ctl = startChampSelectAutomation({
      getSettings: () => settings(),
      champSelect: { commit: vi.fn() },
      subscribe,
      onSession,
    });
    enterChampSelect();
    await fireSession(session([act({ id: 5 })]));
    onSession.mockClear();

    ctl.stop();

    expect(onSession).toHaveBeenCalledWith(null);
  });

  it('treats an error body from the client as no session at all', async () => {
    // Outside champ select the endpoint answers 404 with a JSON error body,
    // which is not null and so used to count as a live champ select.
    const onSession = vi.fn();
    const { subscribe, enterChampSelect, fireSession } = makeSubscribe();
    startChampSelectAutomation({
      getSettings: () => settings(),
      champSelect: { commit: vi.fn() },
      subscribe,
      onSession,
    });
    enterChampSelect();

    await fireSession({ errorCode: 'RPC_ERROR', httpStatus: 404, message: 'no active delegate' });

    expect(onSession).toHaveBeenLastCalledWith(null);
  });
});

describe('renderAutoPick', () => {
  const champs = [
    { id: 103, name: 'Ahri' },
    { id: 64, name: 'Lee Sin' },
  ];

  it('shows role tabs and pick order for the active role', () => {
    const html = renderAutoPick(
      {
        auto_pick: true,
        auto_pick_by_role: rolePicks({ TOP: [103, 64], MIDDLE: [157] }),
        insta_lock: false,
      },
      {
        disabled: false,
        list: champs,
        allList: champs,
        query: '',
        activeRole: 'TOP',
      },
    );
    expect(html).toContain('data-auto-pick-role="TOP"');
    expect(html).toContain('data-auto-pick-role="MIDDLE"');
    expect(html).toContain('role-tab-count');
    expect(html).toContain('pick-order-item');
    expect(html).toContain('data-remove-pick="103"');
    expect(html).toContain('data-remove-pick="64"');
    expect(html).toContain('Ahri');
    expect(html).toContain('Lee Sin');
    expect(html).toContain('champ-slot');
    expect(html).toContain('data-for="auto_pick"');
    expect(html).not.toContain('Yasuo');
  });
});

describe('renderAutoBan', () => {
  const champs = [
    { id: 55, name: 'Katarina' },
    { id: 157, name: 'Yasuo' },
  ];

  it('shows selected champion chip with remove control', () => {
    const html = renderAutoBan(
      { auto_ban: true, auto_ban_champion_id: 55 },
      {
        disabled: false,
        list: [{ id: 157, name: 'Yasuo' }],
        allList: champs,
        query: 'yas',
      },
    );
    expect(html).toContain('pick-order-item');
    expect(html).toContain('Katarina');
    expect(html).toContain('data-remove-ban="55"');
    expect(html).toContain('data-for="auto_ban_champion_id"');
    expect(html).not.toContain('champ-on');
  });

  it('highlights the selected champion in the grid', () => {
    const html = renderAutoBan(
      { auto_ban: true, auto_ban_champion_id: 55 },
      { disabled: false, list: champs, allList: champs, query: '' },
    );
    expect(html).toContain('champ-on');
    expect(html).toContain('data-champ="55"');
  });

  it('shows empty state when no ban champion is chosen', () => {
    const html = renderAutoBan(
      { auto_ban: true, auto_ban_champion_id: 0 },
      { disabled: false, list: champs, allList: champs, query: '' },
    );
    expect(html).toContain('none chosen');
    expect(html).not.toContain('data-remove-ban');
  });
});

describe('toggleAutoPickChampion', () => {
  const base = { auto_pick_by_role: rolePicks() };

  it('adds first and second picks in order for one role', () => {
    let s = toggleAutoPickChampion(base, 'JUNGLE', 103);
    expect(autoPickOrder(s, 'JUNGLE')).toEqual([103]);
    s = toggleAutoPickChampion(s, 'JUNGLE', 64);
    expect(autoPickOrder(s, 'JUNGLE')).toEqual([103, 64]);
    expect(autoPickOrder(s, 'TOP')).toEqual([]);
  });

  it('removes picks and compacts order', () => {
    const s = { auto_pick_by_role: rolePicks({ MIDDLE: [103, 64] }) };
    expect(autoPickOrder(toggleAutoPickChampion(s, 'MIDDLE', 103), 'MIDDLE')).toEqual([64]);
    expect(autoPickOrder(toggleAutoPickChampion(s, 'MIDDLE', 64), 'MIDDLE')).toEqual([103]);
  });

  it('replaces the backup when a third champion is chosen', () => {
    const s = { auto_pick_by_role: rolePicks({ MIDDLE: [103, 64] }) };
    expect(autoPickOrder(toggleAutoPickChampion(s, 'MIDDLE', 157), 'MIDDLE')).toEqual([103, 157]);
  });
});
