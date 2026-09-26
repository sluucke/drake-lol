import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';
import { CreditsModal } from '../../src/app/shell/CreditsModal.jsx';
import { CREDITS } from '../../src/app/shell/shellData.js';

function setup(locale) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() };
  const utils = renderWithProviders(<CreditsModal />, { store, actions });
  return { ...utils, store, actions };
}

describe('CreditsModal', () => {
  it('opens from the store and lists every credit', () => {
    const { store, portalTarget } = setup();
    expect(within(portalTarget).queryByRole('dialog')).toBeNull();
    act(() => store.getState().setCreditsOpen(true));
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Credits' });
    for (const entry of [CREDITS.createdBy, CREDITS.specialThanks, ...CREDITS.inspiredBy, CREDITS.assets]) {
      expect(within(dialog).getByRole('button', { name: entry.label })).toBeTruthy();
    }
  });

  it('opens links through the legacy actions', () => {
    const { store, portalTarget, actions } = setup();
    act(() => store.getState().setCreditsOpen(true));
    const dialog = within(portalTarget).getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: CREDITS.createdBy.label }));
    expect(actions.openUrl).toHaveBeenCalledWith(CREDITS.createdBy.href);
    fireEvent.click(within(dialog).getByRole('button', { name: 'GitHub' }));
    expect(actions.openUrl).toHaveBeenCalledWith(CREDITS.repoUrl);
  });

  it('closes into the store', async () => {
    const { store, portalTarget } = setup();
    act(() => store.getState().setCreditsOpen(true));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().ui.creditsOpen).toBe(false);
    await waitFor(() => expect(within(portalTarget).queryByRole('dialog')).toBeNull());
  });

  it('is translated', () => {
    const { store, portalTarget } = setup('pt_BR');
    act(() => store.getState().setCreditsOpen(true));
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Créditos' });
    expect(within(dialog).getByText('Criado por')).toBeTruthy();
  });
});
