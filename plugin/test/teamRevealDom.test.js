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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });

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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });

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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });

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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });

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
    const ctl = makeTeamRevealDom({ doc, subscribe, loadSnapshot, overlayRoot: makeOverlayRoot() });

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
      overlayRoot: makeOverlayRoot(),
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
      overlayRoot: makeOverlayRoot(),
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
      'Session revealed · Blue Side · Press Ctrl+Shift+D to view it.',
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
      'Session revealed · Blue Side · Press Ctrl+Shift+D to view it.',
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

  it('renders picked champion games and wr on cards', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const loadSnapshot = vi.fn(async () => [
      {
        cellId: 0,
        riotId: 'RealOne#TAG',
        wins: 1,
        losses: 0,
        winRate: 100,
        pickedChampionId: 11,
        pickedGames: 12,
        pickedWins: 7,
        pickedLosses: 5,
        pickedWinRate: 58,
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
      getChampName: (id) => ({ 11: 'Yi' }[id] || ''),
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, championId: 11 }] });
    ctl.toggleCards();
    const html = overlayRoot.querySelector('.team-reveal-overlay').innerHTML;
    expect(html).toContain('Picked');
    expect(html).toContain('Yi');
    expect(html).toContain('12g · 58%');
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
      overlayRoot: makeOverlayRoot(),
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
      overlayRoot: makeOverlayRoot(),
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
      overlayRoot: makeOverlayRoot(),
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

describe('teamRevealDom matchup & builds tab', () => {
  it('renders tab switcher with scouting and matchup tabs', async () => {
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
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('team-reveal-tabs');
    expect(overlay.innerHTML).toContain('Team Scouting');
    expect(overlay.innerHTML).toContain('Matchup &amp; Builds');
    expect(overlay.innerHTML).toContain('team-reveal-panel');
  });

  it('shows prompt in matchup tab when local player has no champion picked', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', isLocalPlayer: true, pickedChampionId: 0 }],
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, championId: 0 }], localPlayerCellId: 0 });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    expect(overlay.innerHTML).toContain('team-reveal-matchup-view');
    expect(overlay.innerHTML).toContain('Pick a champion to view matchup');
  });

  it('fetches and renders matchup, runes, skill order, items, and top players', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const mockOpggMatchup = {
      winRate: 53.4,
      totalMatches: 8420,
      skills: ['Q', 'E', 'W'],
      coreItems: [3078, 3053, 6632],
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135],
      },
      hasData: true,
    };

    const mockLogData = {
      topPlayers: [
        {
          ranking: 1,
          name: 'Faker#KR1',
          region: 'KR',
          tier: 'Challenger',
          winRate: 68.5,
          played: 120,
        },
      ],
      proBuild: {
        items: [3078, 3053],
        skills: ['Q', 'E', 'W'],
        winRate: 54.0,
      },
      hasData: true,
    };

    const fetchOpggMatchupImpl = vi.fn().mockResolvedValue(mockOpggMatchup);
    const fetchLeagueOfGraphsImpl = vi.fn().mockResolvedValue(mockLogData);

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MIDDLE',
        },
      ],
      overlayRoot,
      fetchOpggMatchupImpl,
      fetchLeagueOfGraphsImpl,
      getChampName: (id) => ({ 103: 'Ahri', 84: 'Akali' }[id] || ''),
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MIDDLE' }],
      theirTeam: [{ cellId: 5, championId: 84, assignedPosition: 'MIDDLE' }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(fetchOpggMatchupImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          championId: 103,
          lane: 'MIDDLE',
          enemyChampionId: 84,
        }),
      );
      expect(overlay.innerHTML).toContain('Ahri');
    });

    expect(overlay.innerHTML).toContain('Akali');
    expect(overlay.innerHTML).toContain('53.4% WR');
    expect(overlay.innerHTML).toContain('Advantage');
    expect(overlay.innerHTML).toContain('⚡ Apply Runes');
    expect(overlay.innerHTML).toContain('Conqueror');
    expect(overlay.innerHTML).toContain('team-reveal-keystone-icon');
    expect(overlay.innerHTML).toContain('Faker#KR1');
    expect(overlay.innerHTML).toContain('Challenger');
    expect(overlay.innerHTML).toContain('68.5%');
    expect(overlay.innerHTML).toContain('View Build');
  });

  it('allows clicking View Build on a top player to fetch and display their common build', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const mockOpggMatchup = {
      winRate: 52.5,
      totalMatches: 5000,
      skills: ['Q', 'W', 'E'],
      coreItems: [3078],
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5001],
        winRate: 54.2,
      },
      runePages: [
        {
          primaryStyleId: 8000,
          subStyleId: 8100,
          selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5001],
          winRate: 54.2,
        },
      ],
      hasData: true,
    };

    const mockLogData = {
      topPlayers: [
        {
          ranking: 1,
          name: 'ProPlayer#KR1',
          region: 'KR',
          tier: 'Challenger',
          winRate: 70.0,
          played: 150,
        },
      ],
      proBuild: {
        items: [3078],
        skills: ['Q', 'E', 'W'],
        winRate: 54.0,
      },
      hasData: true,
    };

    const mockPlayerMatchesText =
      'LolListSummonerMatches(Data([GameHistory("gid","2026-08-31T03:52:38+09:00","SUMMONERS_RIFT","SOLORANKED",1942,AverageTierInfo("MASTER",1,"url"),[Participant(Summoner("puuid","ProPlayer","KR1","url",null),103,"Ahri","RED","MID",[3089,3157,3135],["Deathcap","Zhonya","Void"],Rune(8200,8229,8100),[3,4],Stats(16,29220,25329,1015,15,0,8,10,9,7,2,4,204,null,null,8,16301,6605,"WIN",5.05,5,OpScoreTimelineAnalysis("UP","UP","FAIR")),3006)],[Team("BLUE",GameStat(false,38,false,0,0,3,0,3,0,0,68417),[55],["Katarina"]),Team("RED",GameStat(true,45,true,1,1,2,1,8,0,0,72100),[58],["Renekton"])]))';

    const fetchFn = vi.fn().mockImplementation(async (url, opts) => {
      if (typeof opts?.body === 'string' && opts.body.includes('lol_list_summoner_matches')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              content: [{ type: 'text', text: mockPlayerMatchesText }],
            },
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MID',
        },
      ],
      overlayRoot,
      fetchFn,
      fetchOpggMatchupImpl: vi.fn().mockResolvedValue(mockOpggMatchup),
      fetchLeagueOfGraphsImpl: vi.fn().mockResolvedValue(mockLogData),
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID' }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('ProPlayer#KR1');
      expect(overlay.innerHTML).toContain('View Build');
    });

    // Click View Build on the player
    const viewBuildBtn = {
      dataset: {
        teamRevealPlayerBuild: 'ProPlayer#KR1',
        teamRevealPlayerRegion: 'KR',
      },
      matches(sel) {
        return sel.includes('data-team-reveal-player-build');
      },
      closest(sel) {
        return sel.includes('data-team-reveal-player-build') ? this : null;
      },
    };
    await overlay.dispatch('click', { target: viewBuildBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('Arcane Comet');
      expect(overlay.innerHTML).toContain('✓ Viewing');
    });
  });

  it('allows switching between multiple rune page slots and applies the selected slot', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const mockOpggMatchup = {
      winRate: 52.5,
      totalMatches: 5000,
      skills: ['Q', 'W', 'E'],
      coreItems: [3078],
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5001],
        winRate: 54.2,
      },
      runePages: [
        {
          primaryStyleId: 8000,
          subStyleId: 8100,
          selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5001],
          winRate: 54.2,
        },
        {
          primaryStyleId: 8100,
          subStyleId: 8000,
          selectedPerkIds: [8112, 8139, 8140, 8106, 9111, 8014, 5008, 5008, 5001],
          winRate: 51.0,
        },
      ],
      hasData: true,
    };

    const fetchOpggMatchupImpl = vi.fn().mockResolvedValue(mockOpggMatchup);
    const fetchLeagueOfGraphsImpl = vi.fn().mockResolvedValue({ topPlayers: [], proBuild: {}, hasData: false });
    const applyRunePageImpl = vi.fn().mockResolvedValue({ success: true, pageId: 101 });
    const mockLcu = { get: vi.fn(), post: vi.fn(), put: vi.fn() };

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MID',
        },
      ],
      overlayRoot,
      lcu: mockLcu,
      fetchOpggMatchupImpl,
      fetchLeagueOfGraphsImpl,
      applyRunePageImpl,
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID' }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('54.2% WR');
      expect(overlay.innerHTML).toContain('51% WR');
      expect(overlay.innerHTML).toContain('Conqueror');
    });

    // Switch to slot 2 (Electrocute · 51% WR)
    const slot2Btn = {
      dataset: { teamRevealRuneSlot: '1' },
      matches(sel) {
        return sel.includes('data-team-reveal-rune-slot');
      },
      closest(sel) {
        return sel.includes('data-team-reveal-rune-slot') ? this : null;
      },
    };
    overlay.dispatch('click', { target: slot2Btn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('Electrocute');
    });

    // Click apply runes button
    const applyRunesBtn = {
      dataset: { teamRevealApplyRunes: '1' },
      closest(sel) {
        return sel.includes('data-team-reveal-apply-runes') ? this : null;
      },
    };
    await overlay.dispatch('click', { target: applyRunesBtn, stopPropagation() {} });

    expect(applyRunePageImpl).toHaveBeenCalledWith(
      mockLcu,
      expect.objectContaining({
        name: 'Ahri Matchup',
        primaryStyleId: 8100,
        subStyleId: 8000,
        selectedPerkIds: [8112, 8139, 8140, 8106, 9111, 8014, 5008, 5008, 5001],
      }),
    );
  });

  it('applies runes when Apply Runes button is clicked', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const mockOpggMatchup = {
      winRate: 51.0,
      totalMatches: 2500,
      skills: ['Q', 'W', 'E'],
      coreItems: [3078],
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135],
      },
      hasData: true,
    };

    const fetchOpggMatchupImpl = vi.fn().mockResolvedValue(mockOpggMatchup);
    const fetchLeagueOfGraphsImpl = vi.fn().mockResolvedValue({ topPlayers: [], proBuild: {}, hasData: false });
    const applyRunePageImpl = vi.fn().mockResolvedValue({ success: true, pageId: 99 });
    const mockLcu = { get: vi.fn(), post: vi.fn(), put: vi.fn() };

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MID',
        },
      ],
      overlayRoot,
      lcu: mockLcu,
      fetchOpggMatchupImpl,
      fetchLeagueOfGraphsImpl,
      applyRunePageImpl,
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID' }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('⚡ Apply Runes');
    });

    const applyRunesBtn = {
      dataset: { teamRevealApplyRunes: '1' },
      closest(sel) {
        return sel.includes('data-team-reveal-apply-runes') ? this : null;
      },
    };
    await overlay.dispatch('click', { target: applyRunesBtn, stopPropagation() {} });

    expect(applyRunePageImpl).toHaveBeenCalledWith(
      mockLcu,
      expect.objectContaining({
        name: 'Ahri Matchup',
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010, 9111, 9104, 8014, 8139, 8135],
      }),
    );

    expect(overlay.innerHTML).toContain('✓ Applied');
  });

  it('handles apply runes failure gracefully', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const mockOpggMatchup = {
      winRate: 48.0,
      totalMatches: 1200,
      runes: {
        primaryStyleId: 8000,
        subStyleId: 8100,
        selectedPerkIds: [8010],
      },
      hasData: true,
    };

    const fetchOpggMatchupImpl = vi.fn().mockResolvedValue(mockOpggMatchup);
    const fetchLeagueOfGraphsImpl = vi.fn().mockResolvedValue({ topPlayers: [], proBuild: {}, hasData: false });
    const applyRunePageImpl = vi.fn().mockResolvedValue({ success: false, error: 'LCU error' });
    const mockLcu = { get: vi.fn() };

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MID',
        },
      ],
      overlayRoot,
      lcu: mockLcu,
      fetchOpggMatchupImpl,
      fetchLeagueOfGraphsImpl,
      applyRunePageImpl,
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID' }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('⚡ Apply Runes');
    });

    const applyRunesBtn = {
      dataset: { teamRevealApplyRunes: '1' },
      closest(sel) {
        return sel.includes('data-team-reveal-apply-runes') ? this : null;
      },
    };
    await overlay.dispatch('click', { target: applyRunesBtn, stopPropagation() {} });

    expect(overlay.innerHTML).toContain('Failed (Retry)');
  });

  it('switches back to scouting tab when scouting tab is clicked', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', isLocalPlayer: true, pickedChampionId: 0 }],
      overlayRoot,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0 }] });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });
    expect(overlay.innerHTML).toContain('team-reveal-matchup-view');

    const tabScoutingBtn = {
      dataset: { teamRevealTab: 'scouting' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabScoutingBtn, stopPropagation() {} });
    expect(overlay.innerHTML).toContain('team-reveal-panel');
  });

  it('allows selecting an enemy champion manually and refetches matchup vs selected opponent', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();

    const fetchOpggMatchupImpl = vi.fn().mockImplementation(async ({ enemyChampionId }) => {
      if (enemyChampionId === 238) {
        return {
          winRate: 48.2,
          totalMatches: 3100,
          skills: ['Q', 'E', 'W'],
          coreItems: [3157],
          hasData: true,
        };
      }
      return {
        winRate: 53.4,
        totalMatches: 1200,
        skills: ['Q', 'W', 'E'],
        coreItems: [3078],
        hasData: true,
      };
    });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        {
          cellId: 0,
          riotId: 'RealOne#TAG',
          isLocalPlayer: true,
          pickedChampionId: 103,
          assignedPosition: 'MIDDLE',
        },
      ],
      overlayRoot,
      fetchOpggMatchupImpl,
      fetchLeagueOfGraphsImpl: async () => ({ topPlayers: [], proBuild: { items: [], skills: [] }, hasData: true }),
      getChampName: (id) => ({ 103: 'Ahri', 84: 'Akali', 238: 'Zed' }[id] || ''),
      getChampions: () => [
        { id: 84, name: 'Akali' },
        { id: 238, name: 'Zed' },
      ],
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MIDDLE' }],
      theirTeam: [
        { cellId: 5, championId: 84, assignedPosition: 'MIDDLE' },
        { cellId: 6, championId: 238, assignedPosition: 'TOP' },
      ],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(fetchOpggMatchupImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          championId: 103,
          lane: 'MIDDLE',
          enemyChampionId: 84,
        }),
      );
      expect(overlay.innerHTML).toContain('team-reveal-enemy-chip');
      expect(overlay.innerHTML).toContain('team-reveal-enemy-chip-icon');
      expect(overlay.innerHTML).toContain('Akali');
      expect(overlay.innerHTML).toContain('Zed');
    });

    const selectTarget = {
      dataset: { teamRevealEnemySelect: '238' },
      matches(sel) {
        return sel.includes('data-team-reveal-enemy-select');
      },
      closest(sel) {
        return sel.includes('data-team-reveal-enemy-select') ? this : null;
      },
    };
    overlay.dispatch('click', { target: selectTarget, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(fetchOpggMatchupImpl).toHaveBeenCalledWith(
        expect.objectContaining({
          championId: 103,
          lane: 'MIDDLE',
          enemyChampionId: 238,
        }),
      );
      expect(overlay.innerHTML).toContain('48.2% WR');
      expect(overlay.innerHTML).toContain('Zed');
    });
  });
});

describe('teamRevealDom map side display', () => {
  it('renders blue side badge in tabs header when enabled', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      getShowMapSide: () => true,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, team: 100 }] });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('drake-map-side is-blue');
    expect(overlay.innerHTML).toContain('Blue Side');
  });

  it('renders red side badge in tabs header when on red side', async () => {
    const rows = [makeRow(5, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 5, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      getShowMapSide: () => true,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 5, team: 200 }] });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('drake-map-side is-red');
    expect(overlay.innerHTML).toContain('Red Side');
  });

  it('omits map side badge when getShowMapSide is false', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      getShowMapSide: () => false,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, team: 1 }] });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).not.toContain('drake-map-side');
    expect(overlay.innerHTML).not.toContain('Blue Side');
  });

  it('renders map side badge in matchup view header when enabled', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 0, riotId: 'RealOne#TAG', isLocalPlayer: true, pickedChampionId: 103, assignedPosition: 'MID' },
      ],
      overlayRoot,
      getShowMapSide: () => true,
      fetchOpggMatchupImpl: async () => ({ winRate: 50.0, totalMatches: 100, hasData: true }),
      fetchLeagueOfGraphsImpl: async () => ({ topPlayers: [], proBuild: {}, hasData: false }),
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID', team: 100 }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('team-reveal-matchup-head');
    });

    expect(overlay.innerHTML).toContain('drake-map-side is-blue');
    expect(overlay.innerHTML).toContain('Blue Side');
  });

  it('omits map side badge in matchup view when disabled', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [
        { cellId: 0, riotId: 'RealOne#TAG', isLocalPlayer: true, pickedChampionId: 103, assignedPosition: 'MID' },
      ],
      overlayRoot,
      getShowMapSide: () => false,
      fetchOpggMatchupImpl: async () => ({ winRate: 50.0, totalMatches: 100, hasData: true }),
      fetchLeagueOfGraphsImpl: async () => ({ topPlayers: [], proBuild: {}, hasData: false }),
      getChampName: () => 'Ahri',
    });

    ctl.setEnabled(true);
    await ctl.handleSession({
      myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'MID', team: 100 }],
      localPlayerCellId: 0,
    });
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const tabMatchupBtn = {
      dataset: { teamRevealTab: 'matchup' },
      closest(sel) {
        return sel.includes('data-team-reveal-tab') ? this : null;
      },
    };
    overlay.dispatch('click', { target: tabMatchupBtn, stopPropagation() {} });

    await vi.waitFor(() => {
      expect(overlay.innerHTML).toContain('team-reveal-matchup-head');
    });

    expect(overlay.innerHTML).not.toContain('drake-map-side');
  });

  it('omits side text in status toast when getShowMapSide is false', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      getShowMapSide: () => false,
    });

    ctl.setEnabled(true);
    await ctl.handleSession({ myTeam: [{ cellId: 0, team: 1 }] });

    const status = overlayRoot.querySelector('.team-reveal-status');
    expect(status.querySelector('.team-reveal-status-text').textContent).toBe(
      'Session revealed. Press Ctrl+Shift+D to view it.',
    );
  });
});

describe('teamRevealDom mute all', () => {
  it('renders mute all button in overlay header', async () => {
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
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    expect(overlay.innerHTML).toContain('team-reveal-mute-btn');
    expect(overlay.innerHTML).toContain('data-team-reveal-mute="1"');
    expect(overlay.innerHTML).toContain('Mute All');
  });

  it('triggers muteTeammates when mute all button is clicked and shows feedback', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 2, totalTeammates: 2, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      lcu: mockLcu,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    const session = { myTeam: [{ cellId: 0 }, { cellId: 1 }, { cellId: 2 }], localPlayerCellId: 0 };
    await ctl.handleSession(session);
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const muteBtn = {
      dataset: { teamRevealMute: '1' },
      closest(sel) {
        return sel.includes('data-team-reveal-mute') ? this : null;
      },
    };

    await overlay.dispatch('click', { target: muteBtn, stopPropagation() {} });

    expect(muteTeammatesImpl).toHaveBeenCalledWith(mockLcu, session);
    expect(overlay.innerHTML).toContain('✓ Muted');
    expect(overlay.innerHTML).toContain('is-muted');
  });

  it('shows failure state when muteTeammates fails', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 0, totalTeammates: 2, success: false });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
      lcu: mockLcu,
      muteTeammatesImpl,
    });

    ctl.setEnabled(true);
    const session = { myTeam: [{ cellId: 0 }, { cellId: 1 }], localPlayerCellId: 0 };
    await ctl.handleSession(session);
    ctl.toggleCards();

    const overlay = overlayRoot.querySelector('.team-reveal-overlay');
    const muteBtn = {
      dataset: { teamRevealMute: '1' },
      closest(sel) {
        return sel.includes('data-team-reveal-mute') ? this : null;
      },
    };

    await overlay.dispatch('click', { target: muteBtn, stopPropagation() {} });

    expect(overlay.innerHTML).toContain('Mute Failed');
  });

  it('automatically triggers muteTeammates once per session when getAutoMute returns true', async () => {
    const rows = [makeRow(0, 'MaskedOne')];
    const doc = { querySelectorAll: () => rows };
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 2, totalTeammates: 2, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const muteTeammatesImpl = vi.fn().mockResolvedValue({ mutedCount: 0, totalTeammates: 0, success: true });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn();

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
    const overlayRoot = makeOverlayRoot();
    const mockLcu = { get: vi.fn(), post: vi.fn() };
    const sendChampSelectMessageImpl = vi.fn().mockResolvedValue({ success: true, conversationId: 'c1' });

    const ctl = makeTeamRevealDom({
      doc,
      subscribe: () => () => {},
      loadSnapshot: async () => [{ cellId: 0, riotId: 'RealOne#TAG', wins: 1, losses: 0, winRate: 100 }],
      overlayRoot,
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
});
