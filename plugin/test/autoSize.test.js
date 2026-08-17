import { describe, it, expect } from 'vitest';
import { fittedHeight, autoSize, markManual } from '../src/ui/autoSize.js';

describe('fittedHeight', () => {
  it('grows the box to whatever the content needs', () => {
    expect(fittedHeight({ scrollHeight: 300, min: 120, max: 400 })).toBe(300);
  });

  it('never shrinks below the resting size', () => {
    // An empty box collapsing to nothing would be worse than a small one.
    expect(fittedHeight({ scrollHeight: 20, min: 120, max: 400 })).toBe(120);
  });

  it('stops growing at the cap so the panel cannot outgrow the screen', () => {
    expect(fittedHeight({ scrollHeight: 9000, min: 120, max: 400 })).toBe(400);
  });
});

describe('autoSize', () => {
  it('measures from scratch rather than from its own last result', () => {
    // Reading scrollHeight while the old height is still applied reports the
    // OLD height for shrinking content, so the box would only ever grow.
    const seen = [];
    const el = {
      scrollHeight: 200,
      style: {
        set height(v) {
          seen.push(v);
        },
        get height() {
          return seen[seen.length - 1];
        },
      },
    };

    autoSize(el, { min: 120, max: 400 });

    expect(seen[0]).toBe('auto');
    expect(seen[seen.length - 1]).toBe('200px');
  });

  it('does nothing when handed no element', () => {
    expect(() => autoSize(null, { min: 1, max: 2 })).not.toThrow();
  });

  it('stops auto-sizing once the user has dragged the grip', () => {
    // Otherwise the next keystroke would snap the box back to the fitted
    // height and undo the size they just chose.
    const el = { scrollHeight: 200, style: { height: '' }, dataset: { manualHeight: '1' } };

    autoSize(el, { min: 120, max: 400 });

    expect(el.style.height).toBe('');
  });
});

describe('markManual', () => {
  it('marks the element so later auto-sizing backs off', () => {
    const el = { dataset: {} };
    markManual(el);
    expect(el.dataset.manualHeight).toBe('1');
  });

  it('is safe on a missing element', () => {
    expect(() => markManual(null)).not.toThrow();
  });
});
