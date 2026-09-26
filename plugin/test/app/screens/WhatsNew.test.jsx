import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { WhatsNewScreen } from '../../../src/app/screens/WhatsNew.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';
import { WHATS_NEW } from '../../../src/ui/whatsNew.js';

function setup({ version = WHATS_NEW[0].version, locale } = {}) {
  const store = createDrakeStore({ appVersion: version });
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
    expect(screen.getAllByRole('listitem')).toHaveLength(latest.items.length);
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
});
