import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountUI as realMountUI, HOST_ID, type MountOptions } from '../src/ui/mount';

interface FakeShadow {
  innerHTML: string;
  host: FakeEl;
  getElementById: () => null;
}

interface FakeEl {
  tagName: string;
  id: string;
  style: { cssText: string };
  children: FakeEl[];
  parentNode: FakeEl | null;
  shadow: FakeShadow | null;
  attachShadow(): FakeShadow;
  appendChild(child: FakeEl): FakeEl;
  removeChild(child: FakeEl): FakeEl;
}

type FakeDoc = ReturnType<typeof fakeDom>;
type FakeWin = ReturnType<typeof fakeWindow>;
type Handler = (event?: unknown) => void;

type FakeMountOptions = Omit<MountOptions, 'doc' | 'win' | 'mountParent'> & {
  doc: FakeDoc;
  win: FakeWin;
  mountParent?: FakeEl;
};

const mountUI = (opts: FakeMountOptions) => realMountUI(opts as unknown as MountOptions);

function fakeDom({ withBody = true } = {}) {
  const listeners: Record<string, Handler[]> = {};
  const makeEl = (tag: string): FakeEl => {
    const el: FakeEl = {
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
      appendChild(child: FakeEl) {
        child.parentNode = this;
        this.children.push(child);
        doc._notify();
        return child;
      },
      removeChild(child: FakeEl) {
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
    createElement: (tag: string) => makeEl(tag),
    addEventListener: (type: string, fn: Handler) => {
      (listeners[type] ||= []).push(fn);
    },
    _observers: [] as Array<() => void>,
    _notify() {
      for (const cb of this._observers) cb();
    },
    fire(type: string) {
      for (const fn of listeners[type] || []) fn();
    },
  };
  return doc;
}

function fakeWindow() {
  const listeners: Record<string, Array<{ fn: Handler; opts: unknown }>> = {};
  return {
    addEventListener: (type: string, fn: Handler, opts?: unknown) => {
      (listeners[type] ||= []).push({ fn, opts });
    },
    dispatch(type: string, event: object) {
      for (const { fn } of listeners[type] || []) fn(event);
    },
    listenerCount: (type: string) => (listeners[type] || []).length,
  };
}

function installObserver(doc: FakeDoc) {
  return class {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      doc._observers.push(() => this.cb());
    }
    disconnect() {}
  };
}

let doc: FakeDoc, win: FakeWin;
beforeEach(() => {
  doc = fakeDom();
  win = fakeWindow();
  globalThis.MutationObserver = installObserver(doc) as unknown as typeof MutationObserver;
});

describe('mountUI', () => {
  it('mounts without a legacy render function', () => {
    const onMount = vi.fn();
    mountUI({ doc, win, onMount });
    const host = doc.documentElement.children.find((c) => c.id === HOST_ID);
    expect(host?.shadow).not.toBeNull();
    expect(onMount).toHaveBeenCalledWith(host?.shadow, expect.anything());
  });

  it('attaches the host to documentElement, not body', () => {


    mountUI({ doc, win, render: () => '<div></div>' });

    expect(doc.documentElement.children.map((c) => c.id)).toContain(HOST_ID);
    expect(doc.body?.children).toHaveLength(0);
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

    doc.documentElement.removeChild(host as FakeEl);

    const after = doc.documentElement.children.filter((c) => c.id === HOST_ID);
    expect(after).toHaveLength(1);
  });

  it('waits for load when body does not exist yet', () => {


    const early = fakeDom({ withBody: false });
    globalThis.MutationObserver = installObserver(early) as unknown as typeof MutationObserver;

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

  it('lets onToggleIntent veto the Ctrl+D toggle', () => {
    const onToggleIntent = vi.fn(() => false);
    const ui = mountUI({ doc, win, onToggleIntent });
    win.dispatch('keydown', { ctrlKey: true, key: 'd', preventDefault() {} });
    expect(onToggleIntent).toHaveBeenCalledTimes(1);
    expect(ui.isOpen()).toBe(false);
  });

  it('mounts under a custom parent with a custom host id', () => {
    const parent = doc.createElement('div');
    mountUI({ doc, win, mountParent: parent, hostId: 'drake-overlay-ui-host' });
    expect(parent.children.map((c) => c.id)).toEqual(['drake-overlay-ui-host']);
    expect(doc.documentElement.children).toHaveLength(0);
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

  it('lets onEscape handle Escape even when the main panel is closed', () => {
    const onEscape = vi.fn(() => true);
    const onOpenChange = vi.fn();
    const ui = mountUI({ doc, win, render: () => '<div></div>', onEscape, onOpenChange });

    expect(ui.isOpen()).toBe(false);

    const preventDefault = vi.fn();
    win.dispatch('keydown', { key: 'Escape', preventDefault });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    // The main panel was never open, so it must not report a close.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(ui.isOpen()).toBe(false);
  });

  it('still closes the main panel on Escape when onEscape does not consume it', () => {
    const onEscape = vi.fn(() => false);
    const ui = mountUI({ doc, win, render: () => '<div></div>', onEscape });

    win.dispatch('keydown', { ctrlKey: true, key: 'd', preventDefault() {} });
    expect(ui.isOpen()).toBe(true);

    win.dispatch('keydown', { key: 'Escape', preventDefault() {} });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(ui.isOpen()).toBe(false);
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
