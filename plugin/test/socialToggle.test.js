import { describe, it, expect, vi } from 'vitest';
import {
  findSocialBar,
  injectSocialToggleStyles,
  mountSocialToggle,
  socialToggleCss,
  syncSocialToggle,
  SOCIAL_BAR_SELECTOR,
} from '../src/ui/socialToggle.js';

function makeButton() {
  const listeners = [];
  return {
    type: 'button',
    className: '',
    innerHTML: '',
    style: { cssText: '' },
    parentNode: null,
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k];
    },
    addEventListener(_type, fn) {
      listeners.push(fn);
    },
    _click(event) {
      for (const fn of listeners) fn(event);
    },
  };
}

function barEl(extra = {}) {
  return {
    className: extra.className || 'lol-social-version-bar ember-view',
    ownerDocument: extra.ownerDocument || null,
    children: extra.children || [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    insertBefore(child, before) {
      child.parentNode = this;
      const idx = this.children.indexOf(before);
      if (idx === -1) this.children.push(child);
      else this.children.splice(idx, 0, child);
    },
    querySelector(sel) {
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

function topDoc({ bar = null, iframes = [], created } = {}) {
  return {
    querySelector(sel) {
      if (sel === SOCIAL_BAR_SELECTOR || sel === '.lol-social-version-bar') return bar;
      if (sel === 'button[data-drake-toggle]') return bar?.querySelector('[data-drake-toggle]') || null;
      if (sel === 'button[data-dd-action-name="button.social.report_bug"]') return null;
      if (sel === 'button.bug-report-button:not([data-drake-toggle])') return null;
      return null;
    },
    querySelectorAll(sel) {
      return sel === 'iframe' ? iframes : [];
    },
    createElement(tag) {
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
    expect(findSocialBar(doc)).toBe(bar);
  });

  it('finds the social bar inside a nested iframe', () => {
    const innerBar = barEl();
    const iframeDoc = {
      querySelector(sel) {
        return sel === '.lol-social-version-bar' || sel === SOCIAL_BAR_SELECTOR ? innerBar : null;
      },
    };
    const doc = topDoc({
      iframes: [{ contentDocument: iframeDoc }],
    });
    expect(findSocialBar(doc)).toBe(innerBar);
  });

  it('falls back to the bug-report button parent', () => {
    const bug = {
      className: 'bug-report-button',
      getAttribute: (k) => (k === 'data-dd-action-name' ? 'button.social.report_bug' : null),
    };
    const bar = barEl();
    bug.parentElement = bar;
    const doc = {
      querySelector(sel) {
        if (sel.includes('button.social.report_bug') || sel.includes('bug-report-button')) return bug;
        return null;
      },
      querySelectorAll: () => [],
    };
    expect(findSocialBar(doc)).toBe(bar);
  });

  it('injects drake icon styles once', () => {
    const head = { children: [] };
    head.appendChild = (n) => head.children.push(n);
    let styleEl = null;
    const doc = {
      getElementById: (id) => (id === 'drake-social-toggle-style' ? styleEl : null),
      head,
      createElement: () => {
        styleEl = { id: '', textContent: '' };
        return styleEl;
      },
    };
    injectSocialToggleStyles(doc);
    injectSocialToggleStyles(doc);
    expect(head.children).toHaveLength(1);
    expect(head.children[0].textContent).toContain('data-drake-toggle');
  });

  it('mounts a visible duck-icon button into the social bar', () => {
    const created = makeButton();
    const bar = barEl();
    const onToggle = vi.fn();
    const doc = topDoc({ bar, created });

    expect(mountSocialToggle(doc, { onToggle, isOpen: () => false })).toBe(true);
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
      createElement(tag) {
        return tag === 'button' ? created : { id: '', textContent: '' };
      },
      getElementById: () => null,
      head: { appendChild() {} },
      querySelector: () => null,
    };
    const innerBar = barEl({ ownerDocument: owner });
    const iframeDoc = {
      querySelector(sel) {
        return sel === '.lol-social-version-bar' ? innerBar : null;
      },
    };
    const top = topDoc({
      iframes: [{ contentDocument: iframeDoc }],
    });
    top.createElement = () => {
      throw new Error('must create the button in the iframe document');
    };

    expect(mountSocialToggle(top, { onToggle: () => {}, isOpen: () => false })).toBe(true);
    expect(innerBar.children).toContain(created);
    expect(created.innerHTML).toBe('');
  });

  it('syncSocialToggle updates aria state', () => {
    const btn = {
      attrs: {},
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
    };
    const doc = { querySelector: () => btn };

    syncSocialToggle(doc, true);
    expect(btn.attrs['aria-pressed']).toBe('true');
    expect(btn.attrs['aria-label']).toBe('Close Drake');

    syncSocialToggle(doc, false);
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
