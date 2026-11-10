import { describe, it, expect, vi } from 'vitest';
import {
  findSocialBar,
  injectSocialToggleStyles,
  mountSocialToggle,
  socialToggleCss,
  syncSocialToggle,
  SOCIAL_BAR_SELECTOR,
} from '../src/ui/socialToggle';

type Listener = (event: unknown) => void;

interface FakeChild {
  parentNode?: object | null;
  className?: string;
  getAttribute?: (k: string) => string | null | undefined;
}

interface BarExtra {
  className?: string;
  ownerDocument?: object | null;
  children?: FakeChild[];
  rect?: { width: number; height: number };
}

const asDoc = (d: object) => d as unknown as Document;

function makeButton() {
  const listeners: Listener[] = [];
  return {
    type: 'button',
    className: '',
    innerHTML: '',
    style: { cssText: '' },
    parentNode: null as object | null,
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
    getAttribute(k: string) {
      return this.attrs[k];
    },
    addEventListener(_type: string, fn: Listener) {
      listeners.push(fn);
    },
    _click(event: unknown) {
      for (const fn of listeners) fn(event);
    },
  };
}

function barEl(extra: BarExtra = {}) {
  return {
    className: extra.className || 'lol-social-version-bar ember-view',
    ownerDocument: extra.ownerDocument || null,
    children: extra.children || [],
    appendChild(child: FakeChild) {
      child.parentNode = this;
      this.children.push(child);
    },
    insertBefore(child: FakeChild, before: FakeChild) {
      child.parentNode = this;
      const idx = this.children.indexOf(before);
      if (idx === -1) this.children.push(child);
      else this.children.splice(idx, 0, child);
    },
    querySelector(sel: string) {
      if (sel === '[data-drake-toggle]') {
        return this.children.find((c) => c.getAttribute?.('data-drake-toggle') === 'true') || null;
      }
      if (sel === 'button.bug-report-button:not([data-drake-toggle])') {
        return (
          this.children.find(
            (c) =>
              c.className === 'bug-report-button' && c.getAttribute?.('data-drake-toggle') !== 'true',
          ) || null
        );
      }
      return null;
    },
    getBoundingClientRect: () => extra.rect || { width: 200, height: 24 },
  };
}

function topDoc({
  bar = null,
  iframes = [],
  created,
}: {
  bar?: ReturnType<typeof barEl> | null;
  iframes?: Array<{ contentDocument: object }>;
  created?: ReturnType<typeof makeButton>;
} = {}) {
  return {
    querySelector(sel: string) {
      if (sel === SOCIAL_BAR_SELECTOR || sel === '.lol-social-version-bar') return bar;
      if (sel === 'button[data-drake-toggle]') return bar?.querySelector('[data-drake-toggle]') || null;
      if (sel === 'button[data-dd-action-name="button.social.report_bug"]') return null;
      if (sel === 'button.bug-report-button:not([data-drake-toggle])') return null;
      return null;
    },
    querySelectorAll(sel: string) {
      return sel === 'iframe' ? iframes : [];
    },
    createElement(tag: string): object {
      if (tag === 'button') return created || makeButton();
      return { id: '', textContent: '' };
    },
    getElementById: () => null,
    head: { appendChild() {} },
  };
}

describe('socialToggle', () => {
  it('finds the social version bar without requiring ember-view', () => {
    const bar = barEl({ className: 'lol-social-version-bar' });
    const doc = topDoc({ bar });
    expect(findSocialBar(asDoc(doc))).toBe(bar);
  });

  it('finds the social bar inside a nested iframe', () => {
    const innerBar = barEl();
    const iframeDoc = {
      querySelector(sel: string) {
        return sel === '.lol-social-version-bar' || sel === SOCIAL_BAR_SELECTOR ? innerBar : null;
      },
    };
    const doc = topDoc({
      iframes: [{ contentDocument: iframeDoc }],
    });
    expect(findSocialBar(asDoc(doc))).toBe(innerBar);
  });

  it('falls back to the bug-report button parent', () => {
    const bug: { className: string; getAttribute: (k: string) => string | null; parentElement?: object } = {
      className: 'bug-report-button',
      getAttribute: (k: string) => (k === 'data-dd-action-name' ? 'button.social.report_bug' : null),
    };
    const bar = barEl();
    bug.parentElement = bar;
    const doc = {
      querySelector(sel: string) {
        if (sel.includes('button.social.report_bug') || sel.includes('bug-report-button')) return bug;
        return null;
      },
      querySelectorAll: () => [],
    };
    expect(findSocialBar(asDoc(doc))).toBe(bar);
  });

  it('injects drake icon styles once', () => {
    type StyleEl = { id: string; textContent: string };
    const head: { children: StyleEl[]; appendChild?: (n: StyleEl) => number } = { children: [] };
    head.appendChild = (n) => head.children.push(n);
    let styleEl: StyleEl | null = null;
    const doc = {
      getElementById: (id: string) => (id === 'drake-social-toggle-style' ? styleEl : null),
      head,
      createElement: () => {
        styleEl = { id: '', textContent: '' };
        return styleEl;
      },
    };
    injectSocialToggleStyles(asDoc(doc));
    injectSocialToggleStyles(asDoc(doc));
    expect(head.children).toHaveLength(1);
    expect(head.children[0].textContent).toContain('data-drake-toggle');
  });

  it('mounts a visible duck-icon button into the social bar', () => {
    const created = makeButton();
    const bar = barEl();
    const onToggle = vi.fn();
    const doc = topDoc({ bar, created });

    expect(mountSocialToggle(asDoc(doc), { onToggle, isOpen: () => false })).toBe(true);
    expect(created.className).toBe('bug-report-button');
    expect(created.getAttribute('data-drake-toggle')).toBe('true');
    expect(created.getAttribute('data-dd-action-name')).toBe('button.social.drake');
    expect(created.innerHTML).toBe('');
    created._click({ stopPropagation() {}, preventDefault() {} });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('creates the button on the bar ownerDocument when the bar is in an iframe', () => {
    const created = makeButton();
    const owner = {
      createElement(tag: string) {
        return tag === 'button' ? created : { id: '', textContent: '' };
      },
      getElementById: () => null,
      head: { appendChild() {} },
      querySelector: () => null,
    };
    const innerBar = barEl({ ownerDocument: owner });
    const iframeDoc = {
      querySelector(sel: string) {
        return sel === '.lol-social-version-bar' ? innerBar : null;
      },
    };
    const top = topDoc({
      iframes: [{ contentDocument: iframeDoc }],
    });
    top.createElement = () => {
      throw new Error('must create the button in the iframe document');
    };

    expect(mountSocialToggle(asDoc(top), { onToggle: () => {}, isOpen: () => false })).toBe(true);
    expect(innerBar.children).toContain(created);
    expect(created.innerHTML).toBe('');
  });

  it('syncSocialToggle updates aria state', () => {
    const btn = {
      attrs: {} as Record<string, string>,
      setAttribute(key: string, value: string) {
        this.attrs[key] = value;
      },
    };
    const doc = { querySelector: () => btn };

    syncSocialToggle(asDoc(doc), true);
    expect(btn.attrs['aria-pressed']).toBe('true');
    expect(btn.attrs['aria-label']).toBe('Close Drake');

    syncSocialToggle(asDoc(doc), false);
    expect(btn.attrs['aria-pressed']).toBe('false');
    expect(btn.attrs['aria-label']).toBe('Open Drake');
  });

  it('socialToggleCss uses a 4-state background sprite', () => {
    const css = socialToggleCss();
    expect(css).toContain('data-drake-toggle');
    expect(css).toContain('background-image');
    expect(css).toContain('background-size: 100% 400%');
    expect(css).toContain('background-position: 0 33.333%');
    expect(css).toContain('background-position: 0 66.666%');
    expect(css).toContain('background-position: 0 100%');
  });
});
