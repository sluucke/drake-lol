import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';
import { PanelFrame } from '../../src/app/shell/PanelFrame.jsx';
import { SCREENS } from '../../src/app/shell/shellData.js';
import { TOUR_STEPS } from '../../src/ui/onboarding.js';
import { SFX } from '../../src/ui/sfx.js';

function setup({ locale, open = true } = {}) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  if (open) store.getState().setPanelOpen(true);
  const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() };
  const utils = renderWithProviders(<PanelFrame />, { store, actions });
  return { ...utils, store, actions };
}

describe('PanelFrame', () => {
  it('reflects the open state from the store', () => {
    const { store, container } = setup({ open: false });
    const panel = container.querySelector('.drk-panel');
    expect(panel.getAttribute('data-open')).toBe('false');
    act(() => store.getState().setPanelOpen(true));
    expect(panel.getAttribute('data-open')).toBe('true');
  });

  it('closes on backdrop mousedown only', () => {
    const { container, actions } = setup();
    fireEvent.mouseDown(container.querySelector('.drk-panel__window'));
    expect(actions.close).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.querySelector('.drk-panel'));
    expect(actions.close).toHaveBeenCalledTimes(1);
  });

  it('wires the titlebar buttons', () => {
    const { store, actions, sfx } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(actions.close).toHaveBeenCalledTimes(1);
    expect(sfx.play).toHaveBeenCalledWith(SFX.close);
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }));
    expect(store.getState().ui.creditsOpen).toBe(true);
  });
});

describe('Sidebar', () => {
  it('lists every screen translated and marks the active one', () => {
    const { store } = setup({ locale: 'pt_BR' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('data-screen'))).toEqual(SCREENS.map((s) => s.id));
    expect(screen.getByRole('tab', { name: 'Fila' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Aceite automático' }).getAttribute('aria-selected')).toBe('true');
    act(() => store.getState().syncLegacy({ screen: 'queue' }));
    expect(screen.getByRole('tab', { name: 'Fila' }).getAttribute('aria-selected')).toBe('true');
  });

  it('navigates through the legacy actions with the tab sound', () => {
    const { actions, sfx } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Queue' }));
    expect(actions.navigate).toHaveBeenCalledWith('queue');
    expect(sfx.play).toHaveBeenCalledWith(SFX.tab);
  });

  it('highlights the current tour step', () => {
    const { store, container } = setup();
    act(() => store.getState().syncLegacy({ overlay: 'tour', tourIndex: 1 }));
    const highlighted = container.querySelectorAll('[data-tour-active="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].getAttribute('data-screen')).toBe(TOUR_STEPS[1].screen);
    act(() => store.getState().syncLegacy({ overlay: '', tourIndex: -1 }));
    expect(container.querySelectorAll('[data-tour-active="true"]')).toHaveLength(0);
  });
});

describe('LegacyScreen', () => {
  it('hosts the legacy content container and keeps its content across renders', () => {
    const { store, container } = setup();
    const content = container.querySelector('#content');
    expect(content.className).toContain('content');
    expect(container.querySelector('#onboard-layer')).toBeNull();
    content.innerHTML = '<p id="legacy-probe">legacy</p>';
    act(() => store.getState().syncLegacy({ screen: 'status', statusText: 'x' }));
    expect(container.querySelector('#legacy-probe').textContent).toBe('legacy');
    expect(container.querySelector('#content')).toBe(content);
  });
});

describe('ShellFooter', () => {
  it('shows the host label and the tray state', () => {
    const { store } = setup();
    act(() => store.getState().setSession({ hostLabel: 'Drake 0.3.25' }));
    expect(screen.getByText('Drake 0.3.25')).toBeTruthy();
    expect(within(document.querySelector('.drk-footer')).getByRole('status').textContent).toContain('Connected to the tray');
  });

  it('prefers the legacy status line and falls back to the tray state', async () => {
    const { store } = setup();
    act(() => store.getState().setStatusLine({ text: 'Saved', tone: 'good' }));
    await waitFor(() => expect(within(document.querySelector('.drk-footer')).getByRole('status').textContent).toContain('Saved'));
    act(() => {
      store.getState().setStatusLine(null);
      store.getState().syncLegacy({ trayDown: true });
    });
    await waitFor(() => expect(within(document.querySelector('.drk-footer')).getByRole('status').textContent).toContain('Drake tray is not running'));
    expect(within(document.querySelector('.drk-footer')).getByRole('status').className).toContain('is-bad');
  });
});
