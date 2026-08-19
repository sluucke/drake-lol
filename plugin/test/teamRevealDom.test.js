import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeTeamRevealDom, STATUS_READY_MS } from '../src/ui/teamRevealDom.js';

function makeRow(cellId, text) {
  const label = { textContent: text, dataset: {} };
  return {
    dataset: { cellId: String(cellId) },
    querySelector: () => label,
    _label: label,
  };
}

function makeOverlayRoot() {
  const children = [];
  function createNode() {
    const node = {
      className: '',
      hidden: true,
      innerHTML: '',
      textContent: '',
      type: '',
      parentNode: null,
      dataset: {},
      style: { display: '' },
      children: [],
      listeners: {},
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      querySelector(sel) {
        const cls = String(sel).replace(/^\./, '');
        const attr = String(sel).match(/\[([^=]+)="([^"]+)"\]/);
        const stack = [...this.children];
        while (stack.length) {
          const current = stack.shift();
          if (sel.startsWith('.') && current.className === cls) return current;
          if (attr && current.dataset?.[attr[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === attr[2]) {
            return current;
          }
          if (Array.isArray(current.children)) stack.push(...current.children);
        }
        return null;
      },
      addEventListener(type, fn) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(fn);
      },
      dispatch(type, event) {
        for (const fn of this.listeners[type] || []) fn(event);
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
        this.parentNode = null;
      },
    };
    return node;
  }
  return {
    children,
    appendChild(node) {
      children.push(node);
      node.parentNode = this;
    },
    querySelector(sel) {
      const cls = String(sel).replace(/^\./, '');
      const stack = [...children];
      while (stack.length) {
        const current = stack.shift();
        if (sel.startsWith('.') && current.className === cls) return current;
        if (Array.isArray(current.children)) stack.push(...current.children);
      }
      return null;
    },
    ownerDocument: {
      createElement: () => createNode(),
    },
  };
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
    const overlayRoot = makeOverlayRoot();

    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot });
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
      overlayRoot: makeOverlayRoot(),
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

  it('does not rewrite overlay html on unchanged session updates', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const snapshot = [{ cellId: 0, riotId: 'RealOne#TAG', wins: 5, losses: 5, winRate: 50, sharedGames: [] }];
    const loadSnapshot = vi.fn(async () => snapshot);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };
    await ctl.handleSession(session);
    ctl.toggleCards();
    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const firstHtml = overlay.innerHTML;

    await ctl.handleSession(session);
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(overlay.innerHTML).toBe(firstHtml);
  });

  it('shows you tag without shared games', async () => {
    const rows = [makeRow(0, 'MaskedMe'), makeRow(1, 'MaskedMate')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'Me#TAG',
        isLocalPlayer: true,
        wins: 1,
        losses: 0,
        winRate: 100,
        kda: 2,
        last12hWins: 1,
        last12hLosses: 0,
        soloRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        flexRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        sharedGames: [],
      },
      {
        cellId: 1,
        riotId: 'Mate#TAG',
        isLocalPlayer: false,
        wins: 2,
        losses: 1,
        winRate: 67,
        kda: 3,
        last12hWins: 0,
        last12hLosses: 1,
        soloRank: { tier: 'GOLD', division: 'II', lp: 67, wins: 45, losses: 32, winRate: 58, hasRank: true },
        flexRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        sharedGames: [{ championId: 99, win: false }],
      },
    ]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
      getChampName: (id) => ({ 99: 'Lux' }[id] || ''),
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }, { cellId: 1 }], localPlayerCellId: 0 });
    ctl.toggleCards();
    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('Me#TAG');
    expect(overlay.innerHTML).toContain('(You)');
    expect(overlay.innerHTML).toContain('is-you');
    expect(overlay.innerHTML).not.toContain('Played together');
    expect(overlay.innerHTML).not.toContain('107W');
    expect(overlay.innerHTML).toContain('Gold II');
  });

  it('renders last games with champion and KDA', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'RealOne#TAG',
        wins: 1,
        losses: 1,
        winRate: 50,
        matchesUsed: 2,
        recentGames: [
          { championId: 11, win: true, kills: 8, deaths: 2, assists: 4 },
          { championId: 22, win: false, kills: 1, deaths: 6, assists: 3 },
        ],
        soloRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        flexRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
      },
    ]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
      getChampName: (id) => ({ 11: 'Yi', 22: 'Ashe' }[id] || ''),
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    ctl.toggleCards();
    const html = overlayRoot.querySelector('.team-reveal-overlay').innerHTML;
    expect(html).toContain('Last 5');
    expect(html).toContain('Yi');
    expect(html).toContain('8/2/4');
    expect(html).toContain('Ashe');
    expect(html).toContain('1/6/3');
    expect(html).toContain('is-win');
    expect(html).toContain('is-loss');
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    expect(rows[0]._label.textContent).toBe('RealOne#TAG (8W/2L · 80%)');

    ctl.toggleCards();
    const html = overlayRoot.querySelector('.team-reveal-overlay').innerHTML;
    expect(html).toContain('8W');
    expect(html).toContain('2L');
    expect(html).not.toContain('107W');
    expect(html).not.toContain('team-reveal-rank-wl');
  });

  it('toggles cards overlay and force closes when disabled', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = {
      querySelectorAll: () => rows,
    };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 5, losses: 5, winRate: 50 },
    ]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };
    await ctl.handleSession(session);
    ctl.toggleCards();
    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.hidden).toBe(false);

    await ctl.handleSession(session);
    await ctl.handleSession(session);
    expect(overlay.hidden).toBe(false);

    ctl.toggleCards();
    expect(overlay.hidden).toBe(true);

    await ctl.handleSession(session);
    expect(overlay.hidden).toBe(true);
  });

  it('closes cards when backdrop is clicked', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      { cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 1, winRate: 50 },
    ]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    ctl.toggleCards();
    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.hidden).toBe(false);

    overlay.dispatch('click', { target: overlay });
    expect(overlay.hidden).toBe(true);
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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });
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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });
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

  it('subscribes once and unsubscribes on teardown', () => {
    const stop = vi.fn();
    const subscribe = vi.fn(() => stop);
    const ctl = makeTeamRevealDom({
      doc: { querySelectorAll: () => [] },
      subscribe,
      loadSnapshot: async () => [],
      overlayRoot: makeOverlayRoot(),
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
      overlayRoot: makeOverlayRoot(),
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 1 }, { cellId: 2 }] });

    expect(labels[0].textContent).toBe('RealOne#TAG (1W/0L · 100%)');
    expect(labels[1].textContent).toBe('RealTwo#TAG (0W/1L · 0%)');
  });

  it('does not recompute snapshot for identical session payloads', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = {
      querySelectorAll: () => rows,
    };
    const loadSnapshot = vi.fn(async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG' }],
      localPlayerCellId: 0,
    };
    const snapshot = [{ cellId: 0, riotId: 'RealOne#TAG', wins: 8, losses: 2, winRate: 80, matchesUsed: 10 }];

    ctl.setEnabled(true);
    const first = ctl.handleSession(session);
    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.querySelector('.team-reveal-status-text').textContent).toBe('Revealing lobby');

    void ctl.handleSession({ ...session, timer: { phase: 'BAN_PICK', timeLeft: 50 } });
    void ctl.handleSession({ ...session, myTeam: [{ ...session.myTeam[0], gameName: 'RealOne' }] });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    for (const resolve of pending) resolve(snapshot);
    await first;
    await ctl.handleSession(session);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(status.querySelector('.team-reveal-status-text').textContent).toBe(
      'Session revealed. Press Ctrl+Shift+D to view it.',
    );
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
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
      overlayRoot: makeOverlayRoot(),
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

  it('shows revealing status then a view button after snapshot loads', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const loadSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.hidden).toBe(false);
    expect(status.querySelector('.team-reveal-status-text').textContent).toBe('Revealing lobby');
    expect(status.querySelector('.team-reveal-status-spinner').hidden).toBe(false);
    expect(status.querySelector('.team-reveal-status-open').hidden).toBe(true);

    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    await pending;

    expect(status.querySelector('.team-reveal-status-text').textContent).toBe(
      'Session revealed. Press Ctrl+Shift+D to view it.',
    );
    expect(status.querySelector('.team-reveal-status-spinner').hidden).toBe(true);
    expect(status.querySelector('.team-reveal-status-open').hidden).toBe(false);
  });

  it('hides the revealed status when champ select ends', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.hidden).toBe(false);

    await ctl.handleSession(null);
    expect(status.hidden).toBe(true);
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({ doc, subscribe: () => () => {}, loadSnapshot, overlayRoot });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    await ctl.handleSession(null);
    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    await pending;

    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.hidden).toBe(true);
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe,
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.hidden).toBe(false);

    handlers.get('/lol-gameflow/v1/gameflow-phase')('Lobby');
    expect(status.hidden).toBe(true);
  });

  it('opens from the status button and closes from the modal close button', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 1, winRate: 50 }],
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    overlayRoot.querySelector('.team-reveal-status-open').dispatch('click', {
      stopPropagation() {},
      preventDefault() {},
    });

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.hidden).toBe(false);
    expect(overlay.innerHTML).toContain('data-team-reveal-close');

    const closeTarget = {
      closest(sel) {
        return String(sel).includes('team-reveal-close') ? closeTarget : null;
      },
    };
    overlay.dispatch('click', { target: closeTarget, stopPropagation() {} });
    expect(overlay.hidden).toBe(true);
  });

  it('renders role icon on card from assignedPosition', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'RealOne#TAG',
        assignedPosition: 'JUNGLE',
        wins: 1,
        losses: 0,
        winRate: 100,
        soloRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
        flexRank: { tier: '', division: '', lp: 0, wins: 0, losses: 0, winRate: 0, hasRank: false },
      },
    ]);
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, assignedPosition: 'JUNGLE' }] });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('team-reveal-role-icon');
    expect(overlay.innerHTML).toContain('data:image/svg+xml,');
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
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot,
      overlayRoot,
    });
    const session = {
      myTeam: [{ cellId: 0, puuid: 'x', gameName: 'RealOne', tagLine: 'TAG', assignedPosition: 'TOP' }],
    };

    ctl.setEnabled(true);
    await ctl.handleSession(session);
    ctl.toggleCards();
    expect(overlayRoot.querySelector('.team-reveal-overlay').innerHTML).toContain('data:image/svg+xml,');

    await ctl.handleSession({ ...session, myTeam: [{ ...session.myTeam[0], assignedPosition: 'MIDDLE' }] });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(overlayRoot.querySelector('.team-reveal-overlay').innerHTML).toContain('data:image/svg+xml,');
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
      overlayRoot: makeOverlayRoot(),
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
      overlayRoot: makeOverlayRoot(),
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
  afterEach(() => {
    vi.useRealTimers();
  });

  async function readyCtl(extra = {}) {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout,
      ...extra,
    });
    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    return { ctl, overlayRoot };
  }

  it('shows a bottom progress bar after the snapshot loads', async () => {
    vi.useFakeTimers();
    const { overlayRoot } = await readyCtl();
    const status = overlayRoot.querySelector('.team-reveal-status');
    const bar = status.querySelector('.team-reveal-status-bar');
    expect(bar).toBeTruthy();
    expect(bar.hidden).toBe(false);
  });

  it('keeps the bar hidden while revealing', async () => {
    vi.useFakeTimers();
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    let finish;
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      overlayRoot,
      setTimeoutImpl: setTimeout,
      clearTimeoutImpl: clearTimeout,
    });

    ctl.setEnabled(true);
    const pending = ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    const bar = overlayRoot.querySelector('.team-reveal-status').querySelector('.team-reveal-status-bar');
    expect(bar.hidden).toBe(true);

    finish([{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }]);
    await pending;
    expect(bar.hidden).toBe(false);
  });

  it('hides the toast when the progress reaches zero', async () => {
    vi.useFakeTimers();
    const { overlayRoot } = await readyCtl({ statusReadyMs: 4000 });
    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(3999);
    expect(status.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(status.hidden).toBe(true);
    expect(status.querySelector('.team-reveal-status-bar').hidden).toBe(true);
  });

  it('uses an eight-second default dismiss', () => {
    expect(STATUS_READY_MS).toBe(8000);
  });
});
