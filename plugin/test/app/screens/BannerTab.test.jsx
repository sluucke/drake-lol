import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { BannerTab } from '../../../src/app/screens/profile/BannerTab.jsx';

const SKINS = Array.from({ length: 200 }, (_, i) => ({
  id: 1000 + i,
  name: i === 150 ? 'Star Guardian Ahri' : `Skin ${String(i).padStart(3, '0')}`,
  tile: `/tile/${i}.jpg`,
}));

function setup({ skins = SKINS, backgroundId = 0, loading = false, actions } = {}) {
  const store = createDrakeStore();
  store.getState().syncLegacy({ skins, backgroundId });
  const acts = actions || { setBackground: vi.fn(async () => ({ ok: true })) };
  const utils = renderWithProviders(<BannerTab loading={loading} />, { store, actions: acts });
  return { ...utils, store, actions: acts };
}

describe('BannerTab', () => {
  it('renders only the visible window of skins', () => {
    setup();
    const cells = screen.getAllByRole('button', { pressed: false });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(60);
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe('Search 200 skins...');
  });

  it('moves the window when scrolling', async () => {
    const { container } = setup();
    const viewport = container.querySelector('.drk-skin-viewport');
    viewport.scrollTop = 92 * 30;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skin 140' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Skin 000' })).toBeNull();
  });

  it('filters by search and keeps the query', () => {
    const { store } = setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'star' } });
    expect(store.getState().ui.skinQuery).toBe('star');
    expect(screen.getByRole('button', { name: 'Star Guardian Ahri' })).toBeTruthy();
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe('Search 1 skins...');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No skins match.')).toBeTruthy();
  });

  it('sets the background and reports it', async () => {
    const { actions, store } = setup({ backgroundId: 1001 });
    expect(screen.getByRole('button', { name: 'Skin 001' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Skin 002' }));
    expect(actions.setBackground).toHaveBeenCalledWith(1002);
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Profile background set', tone: 'good' }),
    );
  });

  it('shows skeletons while loading', () => {
    const { container } = setup({ skins: [], loading: true });
    expect(container.querySelectorAll('.drk-skel').length).toBeGreaterThan(0);
  });
});
