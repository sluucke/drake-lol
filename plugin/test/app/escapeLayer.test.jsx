import { describe, it, expect } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { AppProviders } from '../../src/app/AppProviders.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';
import { Modal } from '../../src/app/ui/Modal.jsx';
import { Select } from '../../src/app/ui/Select.jsx';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('escape layers', () => {
  it('counts an open modal and releases it when closed', () => {
    const store = createDrakeStore();
    const { rerender } = renderWithProviders(<Modal open title="M" onClose={() => {}} />, { store });
    expect(store.getState().ui.escapeLayers).toBe(1);
    rerender(
      <AppProviders store={store}>
        <Modal open={false} title="M" onClose={() => {}} />
      </AppProviders>,
    );
    expect(store.getState().ui.escapeLayers).toBe(0);
  });

  it('counts an open select list', () => {
    const store = createDrakeStore();
    const { portalTarget } = renderWithProviders(<Select value="a" options={OPTIONS} onChange={() => {}} />, { store });
    expect(store.getState().ui.escapeLayers).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(within(portalTarget).getByRole('listbox')).toBeTruthy();
    expect(store.getState().ui.escapeLayers).toBe(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().ui.escapeLayers).toBe(0);
  });

  it('releases layers on unmount', () => {
    const store = createDrakeStore();
    const { unmount } = renderWithProviders(<Modal open title="M" onClose={() => {}} />, { store });
    unmount();
    expect(store.getState().ui.escapeLayers).toBe(0);
  });
});
