import { describe, it, expect, vi } from 'vitest';
import { makeTeamRevealDom, STATUS_READY_MS } from '../src/ui/teamRevealDom.js';

function makeRow(cellId, text) {
  const label = { textContent: text, dataset: {} };
  return {
    dataset: { cellId: String(cellId) },
    querySelector: () => label,
    _label: label,
  };
}

function viewSpy() {
  const views = [];
  return { publishView: (view) => views.push(view), last: () => views.at(-1), views };
}

describe('teamRevealDom', () => {
  it('rewrites ally rows and restores them on disable', async () => {
    const rows = [makeRow(1, 'MaskedOne'), makeRow(2, 'MaskedTwo')];
    const doc = {
      querySelectorAll: () => rows,
    };
    const subscribe = vi.fn(() => () => {});
    const loadSnapshot = vi.fn(async () => [
      { cellId: 1, riotId: 'RealOne#TAG', wins: 8, losses: 2, winRate: 80 },
      { cellId: 2, riotId: 'RealTwo#TAG', wins: 4, losses: 6, winRate: 40 },
    ]);

    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });
    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    expect(rows[0]._label.textContent).toBe('RealOne#TAG (8W/2L · 80%)');
    expect(rows[1]._label.textContent).toBe('RealTwo#TAG (4W/6L · 40%)');

    ctl.setEnabled(false);
    expect(rows[0]._label.textContent).toBe('MaskedOne');
    expect(rows[1]._label.textContent).toBe('MaskedTwo');
  });

  it('reapplies idempotently and refreshes on row reorder', async () => {
    const rowA = makeRow(1, 'MaskedOne');
    const rowB = makeRow(2, 'MaskedTwo');
    const rows = [rowA, rowB];
    const doc = {
      querySelectorAll: () => rows,
    };
    const subscribe = vi.fn(() => () => {});
    const loadSnapshot = vi.fn(async () => [
      { cellId: 1, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
      { cellId: 2, riotId: 'RealTwo#TAG', wins: 0, losses: 1, winRate: 0 },
    ]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe,
      loadSnapshot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });
    expect(rowA._label.textContent).toBe('RealOne#TAG (1W/0L · 100%)');

    rows.reverse();
    await ctl.handleSession({ myTeam: [{ cellId: 2 }, { cellId: 1 }] });
    expect(rows[0]._label.textContent).toContain('RealTwo#TAG');
    expect(rows[1]._label.textContent).toContain('RealOne#TAG');
  });

  it('uses recent match W/L on names instead of ranked-stats 0L', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'RealOne#TAG',
        wins: 8,
        losses: 2,
        winRate: 80,
        matchesUsed: 10,
        hasSeason: true,
        seasonWins: 107,
        seasonLosses: 0,
        seasonWinRate: 100,
        soloRank: { tier: 'DIAMOND', division: 'IV', lp: 12, wins: 107, losses: 0, winRate: 100, hasRank: true },
        flexRank: { tier: 'GOLD', division: 'II', lp: 10, wins: 20, losses: 0, winRate: 100, hasRank: true },
      },
    ]);
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, publishView: spy.publishView });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(rows[0]._label.textContent).toBe('RealOne#TAG (8W/2L · 80%)');

    ctl.toggleCards();
    const row = spy.last().rows[0];
    expect(row.wins).toBe(8);
    expect(row.losses).toBe(2);
  });

  it('toggles cards and keeps the open state across session updates', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = {
      querySelectorAll: () => rows,
    };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 5, losses: 5, winRate: 50 },
    ]);
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, publishView: spy.publishView });

    ctl.setEnabled(true);
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };
    await ctl.handleSession(session);
    ctl.toggleCards();
    expect(ctl.isOpen()).toBe(true);
    expect(spy.last().open).toBe(true);

    await ctl.handleSession(session);
    await ctl.handleSession(session);
    expect(ctl.isOpen()).toBe(true);

    ctl.toggleCards();
    expect(ctl.isOpen()).toBe(false);
    expect(spy.last().open).toBe(false);

    await ctl.handleSession(session);
    expect(ctl.isOpen()).toBe(false);

    ctl.toggleCards();
    ctl.setEnabled(false);
    expect(ctl.isOpen()).toBe(false);
  });

  it('keeps the reveal when the phase momentarily cannot be read', async () => {
    // A failed gameflow poll hands the handler null. Reading that as "not champ
    // select" wiped the reveal, and the next session then revealed all over
    // again a few seconds later.
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };

    ctl.setEnabled(true);
    await ctl.handleSession(session);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    phase(null);
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('still drops the reveal when the phase really does leave champ select', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };

    ctl.setEnabled(true);
    await ctl.handleSession(session);
    phase('"None"');
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it('resets labels left over from the last match when champ select starts', async () => {
    // The exit cleanup finds nothing when the client has already pulled the rows
    // out of the document, and the next champ select reuses those same nodes, so
    // the previous lobby's names and W/L were still sitting in them.
    const rows = [makeRow(0, 'MaskedOne')];
    let visible = rows;
    const doc = { querySelectorAll: () => visible };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(rows[0]._label.textContent).toBe('RealOne#TAG (1W/0L · 100%)');

    visible = [];
    phase('"InProgress"');
    visible = rows;
    phase('"ChampSelect"');

    expect(rows[0]._label.textContent).toBe('MaskedOne');
  });

  it('does not wipe a reveal when the first phase it ever sees is champ select', async () => {
    // Starting up mid champ select gives no previous phase to compare against,
    // and treating that as an entry would clear a reveal that just landed.
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    phase('"ChampSelect"');

    expect(rows[0]._label.textContent).toBe('RealOne#TAG (1W/0L · 100%)');
  });

  it('scrubs leftover ally names after disable/re-enable when the next phase is champ select', async () => {
    // In-game idle tears the phase subscription down and clears lastPhase. The
    // exit cleanup already missed the detached rows, so the next champ select's
    // first phase event has no previous phase to compare — without a pending
    // scrub those reused nodes keep the previous lobby's revealed names.
    const rows = [makeRow(0, 'MaskedOne')];
    let visible = rows;
    const doc = { querySelectorAll: () => visible };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'OldAlly#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(rows[0]._label.textContent).toBe('OldAlly#TAG (1W/0L · 100%)');

    visible = [];
    ctl.setEnabled(false);
    ctl.setEnabled(true);
    visible = rows;
    phase('"ChampSelect"');

    expect(rows[0]._label.textContent).toBe('MaskedOne');
  });

  it('does not overwrite client names when scrubbing a reused row the client already rewrote', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    let visible = rows;
    const doc = { querySelectorAll: () => visible };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'OldAlly#TAG', wins: 1, losses: 0, winRate: 100 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });

    visible = [];
    ctl.setEnabled(false);
    ctl.setEnabled(true);
    rows[0]._label.textContent = 'FreshMask';
    visible = rows;
    phase('"ChampSelect"');

    expect(rows[0]._label.textContent).toBe('FreshMask');
    expect(rows[0]._label.dataset.drakeTeamRevealApplied).toBeUndefined();
    expect(rows[0]._label.dataset.drakeTeamRevealOriginal).toBeUndefined();
  });

  it('still restores our reveal markup when the reused row was not rewritten by the client', async () => {
    const label = {
      textContent: 'MaskedOne',
      innerHTML: 'MaskedOne',
      dataset: {},
      style: { cssText: '' },
      querySelector(sel) {
        if (sel === '.drake-reveal-name' && String(this.innerHTML).includes('drake-reveal-name')) {
          return { textContent: 'OldAlly#TAG' };
        }
        return null;
      },
    };
    const rows = [{ dataset: { cellId: '0' }, querySelector: () => label, _label: label }];
    let visible = rows;
    const doc = { querySelectorAll: () => visible };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'OldAlly#TAG', wins: 1, losses: 0, winRate: 100, matchesUsed: 1 },
    ]);
    let phase;
    const subscribe = vi.fn((route, fn) => {
      phase = fn;
      return () => {};
    });
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(label.innerHTML).toContain('drake-reveal-name');

    visible = [];
    phase('"InProgress"');
    visible = rows;
    phase('"ChampSelect"');

    expect(label.innerHTML).toBe('MaskedOne');
    expect(label.dataset.drakeTeamRevealApplied).toBeUndefined();
  });

  it('subscribes once and unsubscribes on teardown', () => {
    const stop = vi.fn();
    const subscribe = vi.fn(() => stop);
    const ctl = makeTeamRevealDom({
      doc: { querySelectorAll: () => [] },
      subscribe,
      loadSnapshot: async () => [],
    });

    ctl.setEnabled(true);
    ctl.setEnabled(true);
    expect(subscribe).toHaveBeenCalledTimes(1);

    ctl.teardown();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('rewrites rows by visual order when data-cell-id is absent', async () => {
    const labels = [
      { textContent: 'MaskedOne', dataset: {} },
      { textContent: 'MaskedTwo', dataset: {} },
    ];
    const doc = {
      querySelectorAll: (selector) => {
        if (selector === '[data-cell-id]') return [];
        if (selector === '[data-testid="summoner-name"]') return labels;
        return [];
      },
    };
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 1, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
        { cellId: 2, riotId: 'RealTwo#TAG', wins: 0, losses: 1, winRate: 0 },
      ],
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    expect(labels[0].textContent).toBe('RealOne#TAG (1W/0L · 100%)');
    expect(labels[1].textContent).toBe('RealTwo#TAG (0W/1L · 0%)');
  });

  it('matches labels by name instead of writing ally rows onto the enemy team', async () => {
    // Without data-cell-id the rows used to be assigned to whatever unapplied
    // labels came first in the document, and the enemy rows come first, so the
    // ally names landed on the enemy team.
    const labels = [
      { textContent: 'Summoner 1', dataset: {} },
      { textContent: 'Summoner 2', dataset: {} },
      { textContent: 'RealOne', dataset: {} },
      { textContent: 'RealTwo', dataset: {} },
    ];
    const doc = {
      querySelectorAll: (selector) =>
        selector === '[data-testid="summoner-name"]' ? labels : [],
    };
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 1, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 },
        { cellId: 2, riotId: 'RealTwo#TAG', wins: 0, losses: 1, winRate: 0 },
      ],
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    expect(labels[0].textContent).toBe('Summoner 1');
    expect(labels[1].textContent).toBe('Summoner 2');
    expect(labels[2].textContent).toBe('RealOne#TAG (1W/0L · 100%)');
    expect(labels[3].textContent).toBe('RealTwo#TAG (0W/1L · 0%)');
  });

  it('keeps each row with its own label when only some names can be found', async () => {
    // Matched labels used to be collected without their rows, so a row that
    // matched nothing shifted every later row onto somebody else's label.
    const labels = [
      { textContent: 'RealTwo', dataset: {} },
    ];
    const doc = {
      querySelectorAll: (selector) =>
        selector === '[data-testid="summoner-name"]' ? labels : [],
    };
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 1, riotId: 'Missing#TAG', wins: 5, losses: 5, winRate: 50 },
        { cellId: 2, riotId: 'RealTwo#TAG', wins: 0, losses: 1, winRate: 0 },
      ],
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    expect(labels[0].textContent).toBe('RealTwo#TAG (0W/1L · 0%)');
  });

  it('does not recompute snapshot for identical session payloads', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = {
      querySelectorAll: () => rows,
    };
    const loadSnapshot = vi.fn(async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };

    ctl.setEnabled(true);
    await ctl.handleSession(session);
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('does not restart reveal while a load is already in flight for the same lobby', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const pending = [];
    const loadSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, publishView: spy.publishView });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };
    const snapshot = [{ cellId: 0, riotId: 'RealOne#TAG', wins: 8, losses: 2, winRate: 80, matchesUsed: 10 }];

    ctl.setEnabled(true);
    const first = ctl.handleSession(session);
    expect(spy.last().statusPhase).toBe('loading');

    void ctl.handleSession({ ...session, timer: { phase: 'BAN_PICK', timeLeft: 50 } });
    void ctl.handleSession({ ...session, myTeam: [{ ...session.myTeam[0], gameName: 'RealOne' }] });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    for (const resolve of pending) resolve(snapshot);
    await first;
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(spy.last().statusPhase).toBe('ready');
    expect(spy.last().side).toEqual({ side: 'BLUE', color: 'blue' });
    expect(rows[0]._label.textContent).toBe('RealOne#TAG (8W/2L · 80%)');
  });

  it('paints names from snapshot progress before load finishes', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const loadSnapshot = vi.fn((_session, hooks) => {
      hooks?.onProgress?.([
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          hasSeason: true,
          seasonWins: 10,
          seasonLosses: 5,
          seasonWinRate: 67,
        },
      ]);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(rows[0]._label.textContent).toBe('RealOne#TAG');

    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100, matchesUsed: 1 }]);
    await pending;
    expect(rows[0]._label.textContent).toBe('RealOne#TAG (1W/0L · 100%)');
  });

  it('adds wl below name after load when label uses innerHTML', async () => {
    const label = { textContent: 'MaskedOne', innerHTML: 'MaskedOne', dataset: {}, style: {} };
    const rows = [{ dataset: { cellId: '0' }, querySelector: () => label, _label: label }];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const loadSnapshot = vi.fn((_session, hooks) => {
      hooks?.onProgress?.([{ cellId: 0, riotId: 'RealOne#TAG' }]);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(label.innerHTML).toContain('RealOne#TAG');
    expect(label.innerHTML).not.toContain('drake-reveal-stats');

    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 8, losses: 2, winRate: 80, matchesUsed: 10 }]);
    await pending;

    expect(label.innerHTML).toContain('drake-reveal-stats');
    expect(label.innerHTML).toContain('8W');
    expect(label.innerHTML).toContain('2L');
  });

  it('publishes the loading then ready status around the snapshot load', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const loadSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, publishView: spy.publishView });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(spy.last().statusPhase).toBe('loading');
    const loadingSeq = spy.last().statusSeq;

    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    await pending;

    expect(spy.last().statusPhase).toBe('ready');
    expect(spy.last().statusSeq).toBeGreaterThan(loadingSeq);
    expect(spy.last().side).toEqual({ side: 'BLUE', color: 'blue' });
  });

  it('hides the revealed status when champ select ends', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(spy.last().statusPhase).toBe('ready');

    await ctl.handleSession(null);
    expect(spy.last().statusPhase).toBe('hidden');
    expect(rows[0]._label.textContent).toBe('MaskedOne');
  });

  it('does not resurrect the status after a dodge during reveal', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const loadSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, publishView: spy.publishView });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    await ctl.handleSession(null);
    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    await pending;

    expect(spy.last().statusPhase).toBe('hidden');
    expect(rows[0]._label.textContent).toBe('MaskedOne');
  });

  it('stops revealing when gameflow leaves champ select', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const handlers = new Map();
    const subscribe = vi.fn((route, handler) => {
      handlers.set(route, handler);
      return () => {};
    });
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe,
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(spy.last().statusPhase).toBe('ready');

    handlers.get('/lol-gameflow/v1/gameflow-phase')('Lobby');
    expect(spy.last().statusPhase).toBe('hidden');
  });

  it('updates card role when lane changes without reloading snapshot', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'RealOne#TAG',
        assignedPosition: 'TOP',
        wins: 1,
        losses: 0,
        winRate: 100,
        soloRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        flexRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
      },
    ]);
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      publishView: spy.publishView,
    });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG', assignedPosition: 'TOP' }],
    };

    ctl.setEnabled(true);
    await ctl.handleSession(session);
    ctl.toggleCards();
    expect(spy.last().rows[0].assignedPosition).toBe('TOP');

    await ctl.handleSession({ ...session, myTeam: [{ ...session.myTeam[0], assignedPosition: 'MIDDLE' }] });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(spy.last().rows[0].assignedPosition).toBe('MIDDLE');
  });

  it('moves revealed names with players when they swap cellIds', async () => {
    const row0 = makeRow(0, 'MaskedMe');
    const row1 = makeRow(1, 'MaskedOther');
    const rows = [row0, row1];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'Me#TAG',
        puuid: 'me',
        wins: 8,
        losses: 2,
        winRate: 80,
        matchesUsed: 10,
        assignedPosition: 'TOP',
      },
      {
        cellId: 1,
        riotId: 'Other#TAG',
        puuid: 'other',
        wins: 1,
        losses: 9,
        winRate: 10,
        matchesUsed: 10,
        assignedPosition: 'MIDDLE',
      },
    ]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [
        { cellId: 0, puuid: 'me', assignedPosition: 'TOP' },
        { cellId: 1, puuid: 'other', assignedPosition: 'MIDDLE' },
      ],
      localPlayerCellId: 0,
    });
    expect(row0._label.textContent).toContain('Me#TAG');
    expect(row1._label.textContent).toContain('Other#TAG');

    await ctl.handleSession({
      myTeam: [
        { cellId: 0, puuid: 'other', assignedPosition: 'TOP' },
        { cellId: 1, puuid: 'me', assignedPosition: 'MIDDLE' },
      ],
      localPlayerCellId: 1,
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(row0._label.textContent).toContain('Other#TAG');
    expect(row0._label.textContent).toContain('1W/9L');
    expect(row1._label.textContent).toContain('Me#TAG');
    expect(row1._label.textContent).toContain('8W/2L');
  });

  it('moves revealed names when local swaps with an obfuscated ally', async () => {
    const row0 = makeRow(0, 'MaskedMe');
    const row1 = makeRow(1, 'MaskedAlly');
    const rows = [row0, row1];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'Me#TAG',
        puuid: 'me',
        wins: 8,
        losses: 2,
        winRate: 80,
        matchesUsed: 10,
        assignedPosition: 'TOP',
      },
      {
        cellId: 1,
        riotId: 'Ally#TAG',
        obfuscatedPuuid: 'ally-obf',
        wins: 1,
        losses: 9,
        winRate: 10,
        matchesUsed: 10,
        assignedPosition: 'MIDDLE',
      },
    ]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [
        { cellId: 0, puuid: 'me', assignedPosition: 'TOP' },
        { cellId: 1, obfuscatedPuuid: 'ally-obf', assignedPosition: 'MIDDLE' },
      ],
      localPlayerCellId: 0,
    });
    expect(row0._label.textContent).toContain('Me#TAG');
    expect(row1._label.textContent).toContain('Ally#TAG');

    await ctl.handleSession({
      myTeam: [
        { cellId: 0, obfuscatedPuuid: 'ally-obf', assignedPosition: 'TOP' },
        { cellId: 1, puuid: 'me', assignedPosition: 'MIDDLE' },
      ],
      localPlayerCellId: 1,
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(row0._label.textContent).toContain('Ally#TAG');
    expect(row0._label.textContent).toContain('1W/9L');
    expect(row1._label.textContent).toContain('Me#TAG');
    expect(row1._label.textContent).toContain('8W/2L');
  });

  it('does not reload when game id or puuid fill in after the first reveal', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100, matchesUsed: 1 },
    ]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, summonerId: 77, obfuscatedPuuid: 'obf' }],
    });
    await ctl.handleSession({
      gameId: 555,
      myTeam: [{ cellId: 0, summonerId: 77, puuid: 'real-puuid', obfuscatedPuuid: 'obf' }],
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reveals again for a new lobby after dodge without clearing session manually', async () => {
    const label = { textContent: 'MaskedOne', innerHTML: 'MaskedOne', dataset: {}, style: {} };
    const rows = [{ dataset: { cellId: '0' }, querySelector: () => label, _label: label }];
    const doc = { querySelectorAll: (sel) => (String(sel).includes('data-drake-reveal-root') ? [label] : rows) };
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce([{ cellId: 0, riotId: 'OldAlly#TAG', wins: 1, losses: 0, winRate: 100, matchesUsed: 1 }])
      .mockResolvedValueOnce([{ cellId: 0, riotId: 'NewAlly#TAG', wins: 4, losses: 6, winRate: 40, matchesUsed: 10 }]);
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      gameId: 111,
      myTeam: [{ cellId: 0, puuid: 'old-puuid' }],
    });
    expect(label.innerHTML).toContain('OldAlly#TAG');
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    await ctl.handleSession({
      gameId: 222,
      myTeam: [{ cellId: 0, puuid: 'new-puuid' }],
    });

    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(label.innerHTML).toContain('NewAlly#TAG');
    expect(label.innerHTML).not.toContain('OldAlly#TAG');
  });
});

describe('revealed status auto dismiss', () => {
  it('uses an eight-second default dismiss', () => {
    expect(STATUS_READY_MS).toBe(8000);
  });

  it('injects a local chat name map and rewrites chat authors from reveal originals', async () => {
    const rows = [makeRow(1, 'arongejo'), makeRow(2, 'bob')];
    const chatRoot = {
      className: 'chat-window',
      children: [],
      parentNode: null,
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      querySelector(sel) {
        if (sel === '[data-drake-chat-map]') {
          return this.children.find((c) => c.dataset?.drakeChatMap === '1') || null;
        }
        return null;
      },
    };
    const authorA = { className: 'name', textContent: 'arongejo', dataset: {}, children: [] };
    const authorB = { className: 'name', textContent: 'bob', dataset: {}, children: [] };
    const msgA = { className: 'chat-message', children: [authorA], dataset: {} };
    const msgB = { className: 'chat-message', children: [authorB], dataset: {} };
    chatRoot.children.push(msgA, msgB);
    authorA.parentNode = msgA;
    authorB.parentNode = msgB;

    const body = { children: [chatRoot], className: '', dataset: {} };
    chatRoot.parentNode = body;

    function walk(node, visit) {
      visit(node);
      for (const child of node.children || []) walk(child, visit);
    }

    const doc = {
      body,
      querySelectorAll(sel) {
        if (sel === '[data-cell-id]' || sel === undefined) return rows;
        const out = [];
        walk(body, (node) => {
          if (sel === '.chat-window' && node.className === 'chat-window') out.push(node);
          if (sel === '.name' && node.className === 'name') out.push(node);
          if (sel === '[data-drake-chat-map]' && node.dataset?.drakeChatMap === '1') out.push(node);
          if (sel?.includes?.('chat-window') && String(node.className || '').includes('chat-window')) {
            out.push(node);
          }
        });
        if (sel === '[data-cell-id]') return rows;
        return out;
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      createElement() {
        return {
          className: '',
          textContent: '',
          dataset: {},
          style: {},
          children: [],
          parentNode: null,
          isConnected: true,
          setAttribute(name, value) {
            if (name.startsWith('data-')) {
              const key = name
                .slice(5)
                .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              this.dataset[key] = value;
            }
          },
          getAttribute(name) {
            if (name.startsWith('data-')) {
              const key = name
                .slice(5)
                .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
              return this.dataset[key] ?? null;
            }
            return null;
          },
          removeAttribute() {},
          appendChild(child) {
            this.children.push(child);
            child.parentNode = this;
            return child;
          },
          remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
            this.parentNode = null;
            this.isConnected = false;
          },
          querySelector(sel) {
            if (sel === '[data-drake-chat-map]') {
              return this.children.find((c) => c.dataset?.drakeChatMap === '1') || null;
            }
            return null;
          },
        };
      },
    };

    // toLabelNode uses row.querySelector — makeRow already provides that.
    rows.forEach((row) => {
      row.isConnected = true;
    });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 1, riotId: 'xyz#br1', wins: 1, losses: 0, winRate: 100 },
        { cellId: 2, riotId: 'bob#na1', wins: 0, losses: 1, winRate: 0 },
      ],
      MutationObserverImpl: null,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    const mapNode = chatRoot.children.find((c) => c.dataset?.drakeChatMap === '1');
    expect(mapNode?.textContent).toBe('arongejo → xyz#br1\nbob → bob#na1');
    expect(authorA.textContent).toBe('xyz#br1');
    expect(authorB.textContent).toBe('bob#na1');

    ctl.setEnabled(false);
    expect(chatRoot.children.find((c) => c.dataset?.drakeChatMap === '1')).toBeFalsy();
    expect(authorA.textContent).toBe('arongejo');
    expect(authorB.textContent).toBe('bob');
  });
});

describe('teamRevealDom map side display', () => {
  it('publishes the blue side when enabled', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
      getShowMapSide: () => true,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, team: 100 }] });
    ctl.toggleCards();

    expect(spy.last().side).toEqual({ side: 'BLUE', color: 'blue' });
  });

  it('publishes the red side when on red side', async () => {
    const rows = [makeRow(5, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 5, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
      getShowMapSide: () => true,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 5, team: 200 }] });
    ctl.toggleCards();

    expect(spy.last().side).toEqual({ side: 'RED', color: 'red' });
  });

  it('omits the map side when getShowMapSide is false', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
      getShowMapSide: () => false,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, team: 1 }] });
    ctl.toggleCards();

    expect(spy.last().side).toEqual(null);
  });

});

describe('teamRevealDom mute all', () => {
  it('mutes teammates and publishes the muted state', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 2, totalTeammates: 2, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
      lcu: mockLcu,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    const session = { myTeam: [{ cellId: 0 }, { cellId: 1 }, { cellId: 2 }], localPlayerCellId: 0 };
    await ctl.handleSession(session);
    ctl.toggleCards();

    const muting = ctl.muteAll();
    expect(spy.last().muteStatus).toBe('muting');
    await muting;

    expect(muteTeammatesImpl).toHaveBeenCalledWith(mockLcu, session);
    expect(spy.last().muteStatus).toBe('muted');
  });

  it('publishes the failed state when muteTeammates fails', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const spy = viewSpy();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 0, totalTeammates: 2, success: false });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      publishView: spy.publishView,
      lcu: mockLcu,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    const session = { myTeam: [{ cellId: 0 }, { cellId: 1 }], localPlayerCellId: 0 };
    await ctl.handleSession(session);
    ctl.toggleCards();

    const muting = ctl.muteAll();
    expect(spy.last().muteStatus).toBe('muting');
    await muting;

    expect(muteTeammatesImpl).toHaveBeenCalledWith(mockLcu, session);
    expect(spy.last().muteStatus).toBe('failed');
  });

  it('automatically triggers muteTeammates once per session when getAutoMute returns true', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 2, totalTeammates: 2, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMute: () => true,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    const session = {
      gameId: 12345,
      myTeam: [{ cellId: 0 }, { cellId: 1 }],
      localPlayerCellId: 0,
    };

    await ctl.handleSession(session);
    expect(muteTeammatesImpl).toHaveBeenCalledTimes(1);
    expect(muteTeammatesImpl).toHaveBeenCalledWith(mockLcu, session);

    await ctl.handleSession(session);
    await ctl.handleSession(session);
    expect(muteTeammatesImpl).toHaveBeenCalledTimes(1);
  });

  it('does not trigger muteTeammates automatically when getAutoMute is false', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 0, totalTeammates: 0, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMute: () => false,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(muteTeammatesImpl).not.toHaveBeenCalled();
  });
});

describe('teamRevealDom auto message', () => {
  it('triggers sendChampSelectMessage once when auto message is configured', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMessage: () => 'gl hf team',
      sendChampSelectMessageImpl,
    });

    ctl.setEnabled(true);
    const session = {
      gameId: 12345,
      myTeam: [{ cellId: 0 }, { cellId: 1 }],
      localPlayerCellId: 0,
    };

    await ctl.handleSession(session);
    expect(sendChampSelectMessageImpl).toHaveBeenCalledTimes(1);
    expect(sendChampSelectMessageImpl).toHaveBeenCalledWith(mockLcu, session, 'gl hf team');
  });

  it('does not re-send message repeatedly on intermediate session updates', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMessage: () => 'pref mid please',
      sendChampSelectMessageImpl,
    });

    ctl.setEnabled(true);
    const session = {
      gameId: 12345,
      myTeam: [{ cellId: 0 }, { cellId: 1 }],
      localPlayerCellId: 0,
    };

    await ctl.handleSession(session);
    await ctl.handleSession({ ...session, timer: { phase: 'BAN_PICK', timeLeft: 20 } });
    await ctl.handleSession({ ...session, timer: { phase: 'FINALIZATION', timeLeft: 10 } });

    expect(sendChampSelectMessageImpl).toHaveBeenCalledTimes(1);
  });

  it('skips sending when getAutoMessage is empty or whitespace only', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn();

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMessage: () => '   ',
      sendChampSelectMessageImpl,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(sendChampSelectMessageImpl).not.toHaveBeenCalled();
  });

  it('resets lobby tracking when leaving champ select so message is sent on next game', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      lcu: mockLcu,
      getAutoMessage: () => 'hello all',
      sendChampSelectMessageImpl,
    });

    ctl.setEnabled(true);
    const session1 = { gameId: 111, myTeam: [{ cellId: 0 }] };
    await ctl.handleSession(session1);
    expect(sendChampSelectMessageImpl).toHaveBeenCalledTimes(1);

    await ctl.handleSession(null);

    const session2 = { gameId: 222, myTeam: [{ cellId: 0 }] };
    await ctl.handleSession(session2);
    expect(sendChampSelectMessageImpl).toHaveBeenCalledTimes(2);
  });

  describe('unified tabbed modal and build panel integration', () => {
    it('switches to the build tab and loads the build', async () => {
      const rows = [makeRow(0, 'MaskedOne')];
      const doc = { querySelectorAll: () => rows };
      const loadSnapshot = async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 5, losses: 5, winRate: 50 }];
      const mockBuildPanel = {
        loadBuild: vi.fn(),
        getStateSig: () => 'sig1',
        onUpdate: vi.fn(),
      };
      const spy = viewSpy();

      const ctl = makeTeamRevealDom({
        doc,
        subscribe: () => () => {},
        loadSnapshot,
        publishView: spy.publishView,
        buildPanel: mockBuildPanel,
      });

      ctl.setEnabled(true);
      await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
      ctl.toggleCards();
      ctl.setActiveTab('build');

      expect(ctl.getActiveTab()).toBe('build');
      expect(mockBuildPanel.loadBuild).toHaveBeenCalled();
      expect(spy.last().activeTab).toBe('build');
      expect(spy.last().buildSig).toBe('sig1');
    });

    it('opens directly to build tab with toggleCards("build")', async () => {
      const rows = [makeRow(0, 'MaskedOne')];
      const doc = { querySelectorAll: () => rows };
      const loadSnapshot = async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 5, losses: 5, winRate: 50 }];
      const mockBuildPanel = {
        loadBuild: vi.fn(),
        getStateSig: () => 'sig1',
        onUpdate: vi.fn(),
      };
      const spy = viewSpy();

      const ctl = makeTeamRevealDom({
        doc,
        subscribe: () => () => {},
        loadSnapshot,
        publishView: spy.publishView,
        buildPanel: mockBuildPanel,
      });

      ctl.setEnabled(true);
      await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
      ctl.toggleCards('build');

      expect(ctl.isOpen()).toBe(true);
      expect(ctl.getActiveTab()).toBe('build');
      expect(mockBuildPanel.loadBuild).toHaveBeenCalled();
      expect(spy.last()).toMatchObject({ open: true, activeTab: 'build' });
    });

  });
});
