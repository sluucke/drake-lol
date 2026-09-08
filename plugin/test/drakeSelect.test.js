import { describe, it, expect, vi } from 'vitest';
import {
  renderDrakeSelectHtml,
  wireDrakeSelects,
  isDrakeSelectTarget,
  closeAllDrakeSelects,
} from '../src/ui/drakeSelect.js';

describe('renderDrakeSelectHtml', () => {
  it('marks the selected option and shows its label in the closed state', () => {
    const html = renderDrakeSelectHtml(
      'build-tier',
      [
        { value: 'all', label: 'All Ranks' },
        { value: 'emerald_plus', label: 'Emerald+' },
      ],
      'emerald_plus',
    );
    expect(html).toContain('drake-select-current">Emerald+<');
    expect(html).toMatch(/data-value="emerald_plus"[^>]*role="option">Emerald\+/);
    expect(html).toContain('is-selected');
    expect(html).not.toContain('lol-uikit');
  });

  it('carries the select-field class so sfx/interactive wiring keeps matching it', () => {
    expect(renderDrakeSelectHtml('x', [{ value: 'a', label: 'A' }], 'a')).toContain('select-field');
  });

  it('applies extra attributes and the disabled state', () => {
    const html = renderDrakeSelectHtml('build-tier', [{ value: 'a', label: 'A' }], 'a', {
      disabled: true,
      extraAttrs: { 'data-build-tier': true },
    });
    expect(html).toContain('data-build-tier');
    expect(html).toContain('aria-disabled="true"');
  });

  it('escapes labels so a crafted option cannot inject markup', () => {
    const html = renderDrakeSelectHtml('x', [{ value: 'a', label: '<img src=x onerror=alert(1)>' }], 'a');
    expect(html).not.toContain('<img src=x');
  });
});

// This codebase's tests run in a plain node environment (no jsdom, see
// vitest.config.js), so DOM behavior is hand-mocked rather than real — same
// pattern as buildPanel.test.js's makeNode().
function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, force) => {
      const next = force === undefined ? !set.has(c) : force;
      if (next) set.add(c);
      else set.delete(c);
      return next;
    },
    contains: (c) => set.has(c),
  };
}

function makeOption(value, label) {
  const attrs = { value: String(value) };
  const el = {
    tagName: 'DIV',
    textContent: label,
    dataset: { value: String(value) },
    classList: makeClassList(),
    listeners: {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, v) {
      attrs[name] = String(v);
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    removeEventListener(type, fn) {
      if (this.listeners[type] === fn) delete this.listeners[type];
    },
  };
  return el;
}

function makeSelect({ id, options, disabled = false }) {
  const optionEls = options.map((o) => makeOption(o.value, o.label));
  const current = { textContent: options[0]?.label || '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, removeEventListener(type, fn) { if (this.listeners[type] === fn) delete this.listeners[type]; } };
  const attrs = disabled ? { 'aria-disabled': 'true' } : {};
  const select = {
    id,
    value: options[0]?.value || '',
    dataset: {},
    classList: makeClassList(),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, v) {
      attrs[name] = String(v);
    },
    querySelector(sel) {
      if (sel === '.drake-select-current') return current;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.drake-select-option') return optionEls;
      return [];
    },
  };
  return { select, current, options: optionEls };
}

function makeRoot(selects) {
  return {
    querySelectorAll(sel) {
      if (sel === '.drake-select') return selects;
      if (sel === '.drake-select.is-open') return selects.filter((s) => s.classList.contains('is-open'));
      return [];
    },
  };
}

describe('wireDrakeSelects', () => {
  it('toggles open on clicking the current value, and picks + closes on clicking an option', () => {
    const { select, current, options } = makeSelect({
      id: 'build-tier',
      options: [
        { value: 'all', label: 'All Ranks' },
        { value: 'emerald_plus', label: 'Emerald+' },
      ],
    });
    const root = makeRoot([select]);
    const onSelect = vi.fn();

    wireDrakeSelects(root, onSelect);

    current.listeners.click({ stopPropagation: vi.fn() });
    expect(select.classList.contains('is-open')).toBe(true);

    const emerald = options[1];
    emerald.listeners.click({ stopPropagation: vi.fn() });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'emerald_plus', label: 'Emerald+' }),
    );
    expect(select.classList.contains('is-open')).toBe(false);
    expect(select.value).toBe('emerald_plus');
    expect(current.textContent).toBe('Emerald+');
    expect(emerald.classList.contains('is-selected')).toBe(true);
  });

  it('does not wire a disabled select', () => {
    const { select, current } = makeSelect({ id: 'x', options: [{ value: 'a', label: 'A' }], disabled: true });
    const root = makeRoot([select]);

    wireDrakeSelects(root, vi.fn());
    expect(current.listeners.click).toBeUndefined();
  });

  it('closes any other open select when one is opened', () => {
    const a = makeSelect({ id: 'a', options: [{ value: '1', label: 'One' }] });
    const b = makeSelect({ id: 'b', options: [{ value: '1', label: 'One' }] });
    const root = makeRoot([a.select, b.select]);
    wireDrakeSelects(root, vi.fn());

    a.current.listeners.click({ stopPropagation: vi.fn() });
    expect(a.select.classList.contains('is-open')).toBe(true);

    b.current.listeners.click({ stopPropagation: vi.fn() });
    expect(b.select.classList.contains('is-open')).toBe(true);
    expect(a.select.classList.contains('is-open')).toBe(false);
  });

  it('ignores an option whose value resolves empty instead of throwing', () => {
    const { select, options } = makeSelect({ id: 'x', options: [{ value: '', label: 'Blank' }] });
    const root = makeRoot([select]);
    const onSelect = vi.fn();
    wireDrakeSelects(root, onSelect);

    expect(() => options[0].listeners.click({ stopPropagation: vi.fn() })).not.toThrow();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('closeAllDrakeSelects', () => {
  it('closes every open select except the one passed as an exception', () => {
    const { select } = makeSelect({ id: 'a', options: [{ value: '1', label: 'One' }] });
    select.classList.add('is-open');
    const root = makeRoot([select]);

    closeAllDrakeSelects(root, select);
    expect(select.classList.contains('is-open')).toBe(true);

    closeAllDrakeSelects(root);
    expect(select.classList.contains('is-open')).toBe(false);
  });
});

describe('isDrakeSelectTarget', () => {
  it('detects clicks inside a drake-select', () => {
    expect(isDrakeSelectTarget({ closest: (sel) => (sel === '.drake-select' ? {} : null) })).toBe(true);
    expect(isDrakeSelectTarget({ closest: () => null })).toBe(false);
  });
});
