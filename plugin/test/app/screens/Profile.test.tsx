import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders';
import type { LegacyActions } from '../../../src/app/shell/LegacyActions';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore';
import { ProfileScreen } from '../../../src/app/screens/Profile';
import { isReactScreen } from '../../../src/app/screens/registry';

function makeActions(overrides: Partial<LegacyActions> = {}) {
  return {
    selectProfileTab: vi.fn<LegacyActions['selectProfileTab']>(async () => {}),
    applyProfileRank: vi.fn<LegacyActions['applyProfileRank']>(async () => ({ ok: true })),
    resetProfileRank: vi.fn<LegacyActions['resetProfileRank']>(async () => ({ ok: true })),
    removeBadges: vi.fn<LegacyActions['removeBadges']>(async () => ({ ok: true })),
    cloneBadge: vi.fn<LegacyActions['cloneBadge']>(async () => ({ ok: true })),
    saveRiotId: vi.fn<LegacyActions['saveRiotId']>(async () => ({ ok: true })),
    setBackground: vi.fn<LegacyActions['setBackground']>(async () => ({ ok: true })),
    removeAllFriends: vi.fn<LegacyActions['removeAllFriends']>(async () => ({ removed: 3, failed: 0 })),
    ...overrides,
  };
}

interface SetupOptions {
  tab?: string;
  locale?: string;
  actions?: ReturnType<typeof makeActions>;
}

function setup({ tab = 'rank', locale, actions = makeActions() }: SetupOptions = {}) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ profileTab: tab });
  const utils = renderWithProviders(<ProfileScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('ProfileScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('profile')).toBe(true);
  });

  it('shows the tab from the legacy module', () => {
    setup({ tab: 'riot-id' });
    expect(screen.getByRole('tab', { name: 'Riot ID' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Save ID' })).toBeTruthy();
  });

  it('asks the legacy module to switch tabs', async () => {
    const { actions, store } = setup();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Banner' }));
    expect(actions.selectProfileTab).toHaveBeenCalledWith('banner');
    act(() => store.getState().syncLegacy({ profileTab: 'banner' }));
    await waitFor(() => expect(screen.getByRole('searchbox')).toBeTruthy());
  });

  it('saves the riot id and clears the inputs', async () => {
    const { actions, store } = setup({ tab: 'riot-id' });
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    const tag = screen.getByRole<HTMLInputElement>('textbox', { name: 'TAG' });
    expect(tag.getAttribute('maxlength')).toBe('5');
    fireEvent.change(name, { target: { value: 'Faker' } });
    fireEvent.change(tag, { target: { value: 'KR1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save ID' }));
    expect(actions.saveRiotId).toHaveBeenCalledWith('Faker#KR1');
    await waitFor(() => expect(store.getState().session.statusLine).toEqual({ text: 'Applied', tone: 'good' }));
    expect(name.value).toBe('');
    expect(tag.value).toBe('');
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Elo' })).toBeTruthy();
  });
});
