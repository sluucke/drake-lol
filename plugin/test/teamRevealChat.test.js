import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildChatNameEntries,
  collectRevealChatPairs,
  formatChatMapMessage,
  makeTeamRevealChat,
} from '../src/ui/teamRevealChat.js';

describe('buildChatNameEntries', () => {
  it('keeps masked name to riot id pairs and drops identical full ids', () => {
    expect(
      buildChatNameEntries([
        { from: 'arongejo', to: 'xyz#br1' },
        { from: 'xyz#br1', to: 'xyz#br1' },
        { from: '', to: 'abc#br1' },
        { from: 'keep', to: '' },
        { from: '  Foo  ', to: 'Foo#BR1' },
      ]),
    ).toEqual([
      { from: 'arongejo', to: 'xyz#br1' },
      { from: 'Foo', to: 'Foo#BR1' },
    ]);
  });
});

describe('formatChatMapMessage', () => {
  it('formats one line per mapping', () => {
    expect(
      formatChatMapMessage([
        { from: 'arongejo', to: 'xyz#br1' },
        { from: 'bob', to: 'bob#na1' },
      ]),
    ).toBe('arongejo → xyz#br1\nbob → bob#na1');
  });
});

describe('collectRevealChatPairs', () => {
  it('pairs stored original label names with snapshot riot ids by cell', () => {
    const bound = new Map([
      [0, { dataset: { drakeTeamRevealOriginal: 'arongejo' } }],
      [1, { dataset: { drakeTeamRevealOriginal: 'bob' } }],
      [2, { dataset: {} }],
    ]);
    const rows = [
      { cellId: 0, riotId: 'xyz#br1' },
      { cellId: 1, riotId: 'bob#na1' },
      { cellId: 2, riotId: 'solo#euw' },
    ];
    expect(collectRevealChatPairs(bound, rows)).toEqual([
      { from: 'arongejo', to: 'xyz#br1' },
      { from: 'bob', to: 'bob#na1' },
    ]);
  });
});

function makeDoc(authors = []) {
  const children = [];
  const listeners = [];

  function createElement(tag) {
    const node = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      textContent: '',
      innerHTML: '',
      dataset: {},
      style: {},
      parentNode: null,
      children: [],
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
      removeAttribute(name) {
        if (name.startsWith('data-')) {
          const key = name
            .slice(5)
            .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          delete this.dataset[key];
        }
      },
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
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (n) => {
          if (matches(n, sel)) out.push(n);
          for (const c of n.children || []) walk(c);
        };
        for (const c of this.children || []) walk(c);
        return out;
      },
    };
    return node;
  }

  function matches(node, sel) {
    if (sel.startsWith('.')) return node.className === sel.slice(1);
    const attr = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const raw = attr[1];
      const want = attr[2];
      if (raw.startsWith('data-')) {
        const key = raw
          .slice(5)
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const got = node.dataset?.[key];
        if (want === undefined) return got != null;
        return got === want;
      }
      if (raw === 'class' || raw.includes('class*')) {
        return String(node.className || '').includes(want || '');
      }
    }
    if (sel.includes('[class*="')) {
      const m = sel.match(/\[class\*="([^"]+)"\]/);
      if (m) return String(node.className || '').includes(m[1]);
    }
    return false;
  }

  const chatRoot = createElement('div');
  chatRoot.className = 'chat-window';
  for (const name of authors) {
    const msg = createElement('div');
    msg.className = 'chat-message';
    const author = createElement('div');
    author.className = 'name';
    author.textContent = name;
    msg.appendChild(author);
    const body = createElement('div');
    body.className = 'body';
    body.textContent = `hi from ${name}`;
    msg.appendChild(body);
    chatRoot.appendChild(msg);
  }

  const body = createElement('div');
  body.appendChild(chatRoot);
  children.push(body);

  const doc = {
    body,
    createElement,
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        if (matches(n, sel)) out.push(n);
        for (const c of n.children || []) walk(c);
      };
      walk(body);
      return out;
    },
  };

  return { doc, chatRoot, body, listeners, createElement };
}

describe('makeTeamRevealChat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects a local-only map message and rewrites matching author names', () => {
    const { doc, chatRoot } = makeDoc(['arongejo', 'bob']);
    const chat = makeTeamRevealChat({ doc, MutationObserverImpl: null });

    chat.setEntries([
      { from: 'arongejo', to: 'xyz#br1' },
      { from: 'bob', to: 'bob#na1' },
    ]);

    const mapNode = doc.querySelector('[data-drake-chat-map]');
    expect(mapNode).toBeTruthy();
    expect(mapNode.parentNode).toBe(chatRoot);
    expect(mapNode.textContent).toBe('arongejo → xyz#br1\nbob → bob#na1');

    const authors = doc.querySelectorAll('.name');
    expect(authors[0].textContent).toBe('xyz#br1');
    expect(authors[1].textContent).toBe('bob#na1');
    expect(doc.querySelectorAll('.body')[0].textContent).toBe('hi from arongejo');
  });

  it('restores authors and removes the map message on clear', () => {
    const { doc } = makeDoc(['arongejo']);
    const chat = makeTeamRevealChat({ doc, MutationObserverImpl: null });
    chat.setEntries([{ from: 'arongejo', to: 'xyz#br1' }]);
    expect(doc.querySelector('.name').textContent).toBe('xyz#br1');

    chat.clear();

    expect(doc.querySelector('[data-drake-chat-map]')).toBeNull();
    expect(doc.querySelector('.name').textContent).toBe('arongejo');
  });

  it('updates the map message when entries change', () => {
    const { doc } = makeDoc(['arongejo']);
    const chat = makeTeamRevealChat({ doc, MutationObserverImpl: null });
    chat.setEntries([{ from: 'arongejo', to: 'xyz#br1' }]);
    chat.setEntries([{ from: 'arongejo', to: 'other#br1' }]);

    expect(doc.querySelector('[data-drake-chat-map]').textContent).toBe(
      'arongejo → other#br1',
    );
    expect(doc.querySelector('.name').textContent).toBe('other#br1');
  });

  it('retries until the champ select chat connects after setEntries', () => {
    vi.useFakeTimers();
    const { doc, body, createElement } = makeDoc([]);
    body.children = [];

    const chat = makeTeamRevealChat({
      doc,
      MutationObserverImpl: null,
      pollMs: 250,
    });
    chat.setEntries([{ from: 'arongejo', to: 'xyz#br1' }]);
    expect(doc.querySelector('[data-drake-chat-map]')).toBeNull();

    const chatRoot = createElement('div');
    chatRoot.className = 'chat-window';
    const author = createElement('div');
    author.className = 'name';
    author.textContent = 'arongejo';
    chatRoot.appendChild(author);
    body.appendChild(chatRoot);

    vi.advanceTimersByTime(249);
    expect(doc.querySelector('[data-drake-chat-map]')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(doc.querySelector('[data-drake-chat-map]')?.textContent).toBe(
      'arongejo → xyz#br1',
    );
    expect(author.textContent).toBe('xyz#br1');

    chat.clear();
    vi.useRealTimers();
  });
});
