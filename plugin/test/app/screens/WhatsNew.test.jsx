import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { WhatsNewScreen } from '../../../src/app/screens/WhatsNew.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';
import { WHATS_NEW } from '../../../src/ui/whatsNew.js';

function setup({ version = WHATS_NEW[0].version, locale, seen } = {}) {
  const store = createDrakeStore({ appVersion: version, settings: seen ? { whats_new_seen_version: seen } : {} });
  if (locale) store.getState().setLocale(locale);
  const actions = { dismissWhatsNew: vi.fn(async () => {}) };
  const utils = renderWithProviders(<WhatsNewScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('WhatsNewScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('whats-new')).toBe(true);
  });

  it("shows the running version's notes", () => {
    setup();
    const latest = WHATS_NEW[0];
    expect(screen.getByText(`Changes in v${latest.version}`)).toBeTruthy();
    const notes = document.querySelector('.drk-whats-new');
    expect(within(notes).getAllByRole('listitem')).toHaveLength(latest.items.length);
    expect(screen.getByText(latest.items[0].body)).toBeTruthy();
  });

  it('jumps to the screen of a note and marks it seen', () => {
    const { actions } = setup();
    const item = WHATS_NEW[0].items.find((i) => i.screen);
    fireEvent.click(screen.getByRole('button', { name: item.title }));
    expect(actions.dismissWhatsNew).toHaveBeenCalledWith(item.screen);
  });

  it('continues without a target', () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(actions.dismissWhatsNew).toHaveBeenCalledWith(undefined);
  });

  it('renders notes without a screen as plain titles', () => {
    const entry = WHATS_NEW.find((e) => e.items.some((i) => !i.screen));
    setup({ version: entry.version });
    const item = entry.items.find((i) => !i.screen);
    expect(screen.getByText(item.title).tagName).toBe('SPAN');
  });

  it('explains when there are no notes', () => {
    setup({ version: '0.0.1' });
    expect(screen.getByText('No notes for this version.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Novidades' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  });

  it('catches up on the versions the player skipped, with the important ones spelled out', () => {
    setup({ version: '0.4.3', seen: '0.4.1' });
    expect(screen.getByText('Also new since your last update')).toBeTruthy();
    expect(screen.getByText('1 version you skipped')).toBeTruthy();
    const skipped = screen.getByRole('region', { name: 'v0.4.2' });
    expect(within(skipped).getByText('Drake works inside SkLoL')).toBeTruthy();
    expect(within(skipped).getByText(/loads inside SkLoL/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'v0.4.1' })).toBeNull();
  });

  it('shows the last few releases when nothing was skipped', () => {
    setup({ version: '0.4.3', seen: '0.4.3' });
    expect(screen.getByText('Earlier updates')).toBeTruthy();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['v0.4.2', 'v0.4.1', 'v0.4.0']);
  });

  it('opens a screen from an earlier note', () => {
    const { actions } = setup({ version: '0.4.3', seen: '0.4.1' });
    fireEvent.click(within(screen.getByRole('region', { name: 'v0.4.2' })).getByRole('button', { name: 'Required updates' }));
    expect(actions.dismissWhatsNew).toHaveBeenCalledWith('settings');
  });

  it('translates the catch-up section', () => {
    setup({ version: '0.4.3', seen: '0.4.0', locale: 'pt_BR' });
    expect(screen.getByText('Você também perdeu')).toBeTruthy();
    expect(screen.getByText('2 versões puladas')).toBeTruthy();
    expect(screen.getByText('O Drake funciona dentro do SkLoL')).toBeTruthy();
  });
});
