import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';
import { OnboardLayer } from '../../src/app/shell/OnboardLayer.jsx';

function setup({ overlay = '', tourIndex = -1, locale } = {}) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ overlay, tourIndex });
  const actions = { onboard: vi.fn(async () => {}), dismissWhatsNew: vi.fn(async () => {}) };
  const utils = renderWithProviders(<OnboardLayer />, { store, actions });
  return { ...utils, store, actions };
}

describe('OnboardLayer', () => {
  it('renders nothing without an overlay', () => {
    const { container } = setup();
    expect(container.querySelector('.drk-onboard')).toBeNull();
  });

  it('welcomes and starts or skips the tour', async () => {
    const { actions } = setup({ overlay: 'welcome' });
    expect(screen.getByText('Tools that sit beside the client. A short tour covers the screens you will use most.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(actions.onboard).toHaveBeenCalledWith('tour');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skip' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(actions.onboard).toHaveBeenLastCalledWith('skip');
  });

  it('shows the current tour step and advances', () => {
    const { actions } = setup({ overlay: 'tour', tourIndex: 1 });
    expect(screen.getByRole('dialog', { name: 'Queue' })).toBeTruthy();
    expect(screen.getByText('2 / 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(actions.onboard).toHaveBeenCalledWith('tour-next');
  });

  it('says Done on the last step', () => {
    setup({ overlay: 'tour', tourIndex: 4 });
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('follows the store as the tour moves', () => {
    const { store } = setup({ overlay: 'tour', tourIndex: 0 });
    act(() => store.getState().syncLegacy({ tourIndex: 3 }));
    expect(screen.getByRole('dialog', { name: 'Status' })).toBeTruthy();
    act(() => store.getState().syncLegacy({ overlay: '', tourIndex: -1 }));
    return waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is translated', () => {
    setup({ overlay: 'tour', tourIndex: 0, locale: 'pt_BR' });
    expect(screen.getByRole('dialog', { name: 'Aceite automático' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeTruthy();
  });
});
