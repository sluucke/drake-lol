import { describe, it, expect } from 'vitest';
import { visibleWindow } from '../src/ui/virtualGrid.js';

const grid = (over = {}) => ({
  total: 2146,
  perRow: 5,
  rowHeight: 90,
  viewportHeight: 300,
  scrollTop: 0,
  overscan: 2,
  ...over,
});

describe('visibleWindow', () => {
  it('renders only what fits, plus overscan, not all 2146 skins', () => {
    // The whole point: 2146 tiles each pulling a splash image would build a
    // huge DOM and hammer the client.
    const w = visibleWindow(grid());
    expect(w.end - w.start).toBeLessThan(60);
  });

  it('starts at the top when not scrolled', () => {
    expect(visibleWindow(grid()).start).toBe(0);
  });

  it('reports the full height so the scrollbar matches the real list', () => {
    // 2146 items / 5 per row = 430 rows.
    expect(visibleWindow(grid()).totalHeight).toBe(430 * 90);
  });

  it('offsets the rendered slice so it sits where it belongs', () => {
    const w = visibleWindow(grid({ scrollTop: 900 }));
    // 900 / 90 = row 10, minus 2 overscan rows = row 8 -> 8 * 5 = item 40.
    expect(w.start).toBe(40);
    expect(w.offsetY).toBe(8 * 90);
  });

  it('never starts before the first item', () => {
    const w = visibleWindow(grid({ scrollTop: 0, overscan: 5 }));
    expect(w.start).toBe(0);
    expect(w.offsetY).toBe(0);
  });

  it('never runs past the end of the list', () => {
    const w = visibleWindow(grid({ scrollTop: 999999 }));
    expect(w.end).toBe(2146);
    expect(w.start).toBeLessThan(2146);
  });

  it('handles a list shorter than one screen', () => {
    const w = visibleWindow(grid({ total: 3 }));
    expect(w.start).toBe(0);
    expect(w.end).toBe(3);
    expect(w.totalHeight).toBe(90);
  });

  it('handles an empty list without dividing by zero', () => {
    const w = visibleWindow(grid({ total: 0 }));
    expect(w.start).toBe(0);
    expect(w.end).toBe(0);
    expect(w.totalHeight).toBe(0);
  });
});
