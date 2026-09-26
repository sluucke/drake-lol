import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { SocialToggle } from '../../../src/app/overlays/docks/SocialToggle.jsx';
import {
  ensureToggleHost,
  SOCIAL_BAR_SELECTOR,
  STYLE_ID,
  TOGGLE_HOST_ATTR,
} from '../../../src/ui/socialToggle.js';

function makeBar() {
  const bar = document.createElement('div');
  bar.className = SOCIAL_BAR_SELECTOR.slice(1);
  bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 40 });
  const bug = document.createElement('button');
  bug.className = 'bug-report-button';
  bar.appendChild(bug);
  document.body.appendChild(bar);
  return bar;
}

afterEach(() => {
  document.querySelectorAll(SOCIAL_BAR_SELECTOR).forEach((node) => node.remove());
  document.getElementById(STYLE_ID)?.remove();
});

function setup() {
  const bar = makeBar();
  const store = createDrakeStore();
  const actions = { togglePanel: vi.fn() };
  const utils = renderWithProviders(<SocialToggle />, { store, actions });
  return { ...utils, bar, store, actions };
}

describe('SocialToggle', () => {
  it('renders the Drake button inside the client social bar', () => {
    const { bar } = setup();
    const btn = bar.querySelector('button[data-drake-toggle]');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Open Drake');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
  });

  it('toggles the panel and reflects the open state', () => {
    const { bar, store, actions } = setup();
    fireEvent.click(bar.querySelector('button[data-drake-toggle]'));
    expect(actions.togglePanel).toHaveBeenCalledTimes(1);
    act(() => store.getState().setPanelOpen(true));
    const btn = bar.querySelector('button[data-drake-toggle]');
    expect(btn.getAttribute('aria-label')).toBe('Close Drake');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('removes itself while the streaming overlay is active', () => {
    const { bar, store } = setup();
    act(() => store.getState().setSession({ streaming: { host: 'client', effective: 'overlay' } }));
    expect(bar.querySelector('button[data-drake-toggle]')).toBeNull();
  });

  it('removes itself while in game', () => {
    const { bar, store } = setup();
    act(() => store.getState().setSession({ idle: true }));
    expect(bar.querySelector('button[data-drake-toggle]')).toBeNull();
  });
});

describe('ensureToggleHost', () => {
  it('creates one host right after the bug report button and reuses it', () => {
    const bar = document.createElement('div');
    const bug = document.createElement('button');
    bug.className = 'bug-report-button';
    const other = document.createElement('span');
    bar.append(bug, other);
    const host = ensureToggleHost(bar);
    expect(host.hasAttribute(TOGGLE_HOST_ATTR)).toBe(true);
    expect(bug.nextSibling).toBe(host);
    expect(ensureToggleHost(bar)).toBe(host);
    expect(bar.querySelectorAll(`[${TOGGLE_HOST_ATTR}]`).length).toBe(1);
  });

  it('appends at the end when there is no bug report button', () => {
    const bar = document.createElement('div');
    bar.append(document.createElement('span'));
    const host = ensureToggleHost(bar);
    expect(bar.lastChild).toBe(host);
  });

  it('returns null without a bar', () => {
    expect(ensureToggleHost(null)).toBeNull();
  });
});
