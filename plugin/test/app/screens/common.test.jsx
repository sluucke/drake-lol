import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { ScreenHeader, SettingToggle } from '../../../src/app/screens/common.jsx';

function setup(ui, settings = {}) {
  const store = createDrakeStore({ settings });
  const actions = { setSettings: vi.fn(async () => ({ ok: true })) };
  const utils = renderWithProviders(ui, { store, actions });
  return { ...utils, store, actions };
}

describe('screen building blocks', () => {
  it('renders a header', () => {
    setup(<ScreenHeader title="Queue" subtitle="Tools" />);
    expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
  });

  it('binds a toggle to a setting', () => {
    const { actions } = setup(<SettingToggle id="auto_accept" label="Accept" />, { auto_accept: false });
    const sw = screen.getByRole('switch', { name: 'Accept' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(actions.setSettings).toHaveBeenCalledWith({ auto_accept: true });
  });

  it('supports settings that default on', () => {
    setup(<SettingToggle id="queue_show_map_side" label="Map side" defaultOn />);
    expect(screen.getByRole('switch', { name: 'Map side' }).getAttribute('aria-checked')).toBe('true');
  });

  it('disables toggles while the tray is down', () => {
    const { store } = setup(<SettingToggle id="auto_accept" label="Accept" />);
    act(() => store.getState().syncLegacy({ trayDown: true }));
    expect(screen.getByRole('switch', { name: 'Accept' }).disabled).toBe(true);
  });
});
