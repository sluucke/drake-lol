import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findAnchor,
  inChampSelect,
  isVisible,
  layoutDock,
  watchAnchor,
  ROSE_BUTTON_SELECTOR,
  CHAMP_SELECT_BUTTONS,
  DOCK_GAP_PX,
} from '../src/ui/dodgeDock.js';

function el({ rect = { left: 0, top: 0, width: 0, height: 0 }, className = '', matchesRose = false } = {}) {
  return {
    classList: { contains: (c) => className.includes(c) },
    matches: (sel) => matchesRose && sel === ROSE_BUTTON_SELECTOR,
    getBoundingClientRect: () => ({ ...rect }),
  };
}

describe('inChampSelect', () => {
  it('is true when a session payload exists', () => {
    expect(inChampSelect({ localPlayerCellId: 0 })).toBe(true);
  });

  it('is false when the session ended', () => {
    expect(inChampSelect(null)).toBe(false);
  });

  it('is false for the error body the client returns outside champ select', () => {
    expect(
      inChampSelect({ errorCode: 'RPC_ERROR', httpStatus: 404, message: 'no active delegate' }),
    ).toBe(false);
  });
});

describe('isVisible', () => {
  it('requires non-zero size', () => {
    expect(isVisible(el({ rect: { width: 100, height: 32 } }))).toBe(true);
    expect(isVisible(el())).toBe(false);
    expect(isVisible(null)).toBe(false);
  });
});

describe('findAnchor', () => {
  it('prefers the Rose button over the bottom-right stack', () => {
    const rose = el({ rect: { width: 120, height: 28 }, className: 'rose-custom-wheel-button', matchesRose: true });
    const stack = el({ rect: { width: 200, height: 40 } });
    const doc = {
      querySelector: (sel) => {
        if (sel === ROSE_BUTTON_SELECTOR) return rose;
        if (sel === CHAMP_SELECT_BUTTONS) return stack;
        return null;
      },
    };
    expect(findAnchor(doc)).toBe(rose);
  });

  it('returns null when Rose is absent', () => {
    const doc = { querySelector: () => null };
    expect(findAnchor(doc)).toBe(null);
  });

  it('skips hidden anchors', () => {
    const doc = { querySelector: () => el() };
    expect(findAnchor(doc)).toBe(null);
  });
});

describe('layoutDock', () => {
  it('centers above the anchor', () => {
    const dock = { style: {}, dataset: {} };
    const anchor = el({ rect: { left: 800, top: 600, width: 120, height: 28 } });
    const win = { innerHeight: 900 };
    layoutDock(dock, anchor, win);
    expect(dock.style.left).toBe(`${800 + 60}px`);
    expect(dock.style.bottom).toBe(`${900 - 600 + DOCK_GAP_PX}px`);
    expect(dock.style.transform).toBe('translateX(-50%)');
  });

  it('uses a bottom-right fallback when no anchor exists yet', () => {
    const dock = { style: {}, dataset: {} };
    layoutDock(dock, null, { innerHeight: 900 });
    expect(dock.style.right).toBe('20px');
    expect(dock.style.bottom).toBe('70px');
    expect(dock.style.transform).toBe('none');
  });

  it('skips layout writes when nothing moved', () => {
    const dock = { style: {}, dataset: {} };
    const anchor = el({ rect: { left: 800, top: 600, width: 120, height: 28 } });
    const win = { innerHeight: 900 };
    layoutDock(dock, anchor, win);
    dock.style.left = '999px';
    layoutDock(dock, anchor, win);
    expect(dock.style.left).toBe('999px');
  });
});

describe('watchAnchor', () => {
  let doc, win, cb;

  beforeEach(() => {
    cb = vi.fn();
    doc = {
      documentElement: {},
      querySelector: () => null,
    };
    win = {
      innerHeight: 900,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: (fn) => {
        fn();
        return 1;
      },
      cancelAnimationFrame: vi.fn(),
      setInterval: (fn) => {
        fn();
        return 2;
      },
      clearInterval: vi.fn(),
    };
    vi.useFakeTimers();
    globalThis.MutationObserver = class {
      constructor(fn) {
        this.fn = fn;
      }
      observe() {}
      disconnect = vi.fn();
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls back on an interval and cleans up', () => {
    const stop = watchAnchor(doc, win, cb);
    expect(win.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(cb).toHaveBeenCalled();
    stop();
    expect(win.removeEventListener).toHaveBeenCalled();
    expect(win.clearInterval).toHaveBeenCalled();
  });
});
