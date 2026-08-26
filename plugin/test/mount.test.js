import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountUI, HOST_ID } from '../src/ui/mount.js';

function fakeDom({ withBody = true } = {}) {
  const listeners = {};
  const makeEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      style: { cssText: '' },
      children: [],
      parentNode: null,
      shadow: null,
      attachShadow() {
        this.shadow = { innerHTML: '', host: this, getElementById: () => null };
        return this.shadow;
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        doc._notify();
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
        child.parentNode = null;
        doc._notify();
        return child;
      },
    };
    return el;
  };

  const doc = {
    body: withBody ? makeEl('body') : null,
    documentElement: makeEl('html'),
    createElement: (tag) => makeEl(tag),
    addEventListener: (type, fn) => {
      (listeners[type] ||= []).push(fn);
    },
    _observers: [],
    _notify() {
      for (const cb of this._observers) cb();
    },
    fire(type) {
      for (const fn of listeners[type] || []) fn();
    },
  };
  return doc;
}

function fakeWindow() {
  const listeners = {};
  return {
    addEventListener: (type, fn, opts) => {
      (listeners[type] ||= []).push({ fn, opts });
    },
    dispatch(type, event) {
      for (const { fn } of listeners[type] || []) fn(event);
    },
    listenerCount: (type) => (listeners[type] || []).length,
  };
}

function installObserver(doc) {
  return class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      doc._observers.push(() => this.cb());
    }
    disconnect() {}
  };
}

let doc, win;
beforeEach(() => {
  doc = fakeDom();
  win = fakeWindow();
  globalThis.MutationObserver = installObserver(doc);
});

describe('mountUI', () => {
  it('attaches the host to documentElement, not body', () => {


    mountUI({ doc, win, render: () => '<div></div>' });

    expect(doc.documentElement.children.map((c) => c.id)).toContain(HOST_ID);
    expect(doc.body.children).toHaveLength(0);
  });

  it('mounts only once when the plugin is evaluated twice', () => {


    mountUI({ doc, win, render: () => '<div></div>' });
    mountUI({ doc, win, render: () => '<div></div>' });

    const hosts = doc.documentElement.children.filter((c) => c.id === HOST_ID);
    expect(hosts).toHaveLength(1);
    expect(win.listenerCount('keydown')).toBe(1);
  });

  it('re-attaches the host when the client removes it', () => {

    mountUI({ doc, win, render: () => '<div></div>' });
    const host = doc.documentElement.children.find((c) => c.id === HOST_ID);

    doc.documentElement.removeChild(host);

    const after = doc.documentElement.children.filter((c) => c.id === HOST_ID);
    expect(after).toHaveLength(1);
  });

  it('waits for load when body does not exist yet', () => {


    const early = fakeDom({ withBody: false });
    globalThis.MutationObserver = installObserver(early);

    mountUI({ doc: early, win, render: () => '<div></div>' });
    expect(early.documentElement.children.filter((c) => c.id === HOST_ID)).toHaveLength(0);

    early.fire('load');
    expect(early.documentElement.children.filter((c) => c.id === HOST_ID)).toHaveLength(1);
  });

  it('reports open state through the toggle callback', () => {
    const onOpenChange = vi.fn();
    const ui = mountUI({ doc, win, render: () => '<div></div>', onOpenChange });

    ui.toggle();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    ui.toggle();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('opens on Ctrl+D and closes on Escape', () => {
    const ui = mountUI({ doc, win, render: () => '<div></div>' });

    win.dispatch('keydown', { ctrlKey: true, key: 'd', preventDefault() {} });
    expect(ui.isOpen()).toBe(true);

    win.dispatch('keydown', { key: 'Escape', preventDefault() {} });
    expect(ui.isOpen()).toBe(false);
  });

  it('lets onEscape consume Escape without closing the panel', () => {
    const onEscape = vi.fn(() => true);
    const ui = mountUI({ doc, win, render: () => '<div></div>', onEscape });

    win.dispatch('keydown', { ctrlKey: true, key: 'd', preventDefault() {} });
    expect(ui.isOpen()).toBe(true);

    win.dispatch('keydown', { key: 'Escape', preventDefault() {} });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(ui.isOpen()).toBe(true);
  });

  it('calls team reveal cards toggle on Ctrl+Shift+D only', () => {
    const onTeamRevealCardsToggle = vi.fn();
    const ui = mountUI({ doc, win, render: () => '<div></div>', onTeamRevealCardsToggle });

    win.dispatch('keydown', {
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
      code: 'KeyD',
      target: { tagName: 'BODY', isContentEditable: false },
      preventDefault() {},
    });

    expect(onTeamRevealCardsToggle).toHaveBeenCalledTimes(1);
    expect(ui.isOpen()).toBe(false);
  });

  it('does not toggle team reveal cards on Ctrl+D', () => {
    const onTeamRevealCardsToggle = vi.fn();
    const ui = mountUI({ doc, win, render: () => '<div></div>', onTeamRevealCardsToggle });

    win.dispatch('keydown', {
      ctrlKey: true,
      shiftKey: false,
      key: 'd',
      code: 'KeyD',
      target: { tagName: 'BODY', isContentEditable: false },
      preventDefault() {},
    });

    expect(onTeamRevealCardsToggle).not.toHaveBeenCalled();
    expect(ui.isOpen()).toBe(true);
  });

  it('toggles team reveal cards while typing in inputs', () => {
    const onTeamRevealCardsToggle = vi.fn();
    mountUI({ doc, win, render: () => '<div></div>', onTeamRevealCardsToggle });

    win.dispatch('keydown', {
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
      code: 'KeyD',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault() {},
    });

    expect(onTeamRevealCardsToggle).toHaveBeenCalledTimes(1);
  });

  it('does not preventDefault on keys it does not handle', () => {

    mountUI({ doc, win, render: () => '<div></div>' });
    const preventDefault = vi.fn();

    win.dispatch('keydown', { ctrlKey: true, key: 'k', preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('ignores hotkeys while idle in game', () => {
    const onTeamRevealCardsToggle = vi.fn();
    const ui = mountUI({
      doc,
      win,
      render: () => '<div></div>',
      onTeamRevealCardsToggle,
      isIdle: () => true,
    });

    win.dispatch('keydown', { ctrlKey: true, key: 'd', preventDefault() {} });
    win.dispatch('keydown', {
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
      code: 'KeyD',
      preventDefault() {},
    });

    expect(ui.isOpen()).toBe(false);
    expect(onTeamRevealCardsToggle).not.toHaveBeenCalled();
  });
});
