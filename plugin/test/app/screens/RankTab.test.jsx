import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { RankTab } from '../../../src/app/screens/profile/RankTab.jsx';

function makeActions(overrides = {}) {
  return {
    selectProfileTab: vi.fn(async () => {}),
    applyProfileRank: vi.fn(async () => ({ ok: true })),
    resetProfileRank: vi.fn(async () => ({ ok: true })),
    removeBadges: vi.fn(async () => ({ ok: true })),
    cloneBadge: vi.fn(async () => ({ ok: true })),
    saveRiotId: vi.fn(async () => ({ ok: true })),
    setBackground: vi.fn(async () => ({ ok: true })),
    removeAllFriends: vi.fn(async () => ({ removed: 3, failed: 0 })),
    ...overrides,
  };
}

function setup({ rank, locale, actions = makeActions() } = {}) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  if (rank) store.getState().syncLegacy({ profileRank: rank });
  const utils = renderWithProviders(<RankTab />, { store, actions });
  return { ...utils, store, actions };
}

const GOLD = { tier: 'GOLD', division: 'II', queue: 'RANKED_FLEX_SR', crystal: 'DIAMOND' };

describe('RankTab', () => {
  it('shows the current rank', () => {
    setup({ rank: GOLD });
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['Gold']);
    expect(screen.getByRole('button', { name: 'Division' }).textContent).toContain('II');
    expect(screen.getByRole('button', { name: 'Queue' }).textContent).toContain('Flex');
    expect(screen.getByRole('button', { name: 'Crystal' }).textContent).toContain('Diamond');
  });

  it('applies the edited draft', async () => {
    const { actions, store, portalTarget } = setup({ rank: GOLD });
    fireEvent.click(screen.getByRole('button', { name: 'Challenger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Division' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'I' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(actions.applyProfileRank).toHaveBeenCalledWith({ ...GOLD, tier: 'CHALLENGER', division: 'I' });
    await waitFor(() => expect(store.getState().session.statusLine).toEqual({ text: 'Applied', tone: 'good' }));
  });

  it('reports failures with the given reason', async () => {
    const actions = makeActions({ resetProfileRank: vi.fn(async () => ({ ok: false, reason: 'the client refused it (500)' })) });
    const { store } = setup({ rank: GOLD, actions });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'the client refused it (500)', tone: 'bad' }),
    );
  });

  it('resets the draft when the synced rank changes', () => {
    const { store } = setup({ rank: GOLD });
    fireEvent.click(screen.getByRole('button', { name: 'Iron' }));
    act(() => store.getState().syncLegacy({ profileRank: { ...GOLD, tier: 'SILVER' } }));
    expect(screen.getByRole('button', { name: 'Silver' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('runs the badge actions', async () => {
    const { actions, store } = setup({ rank: GOLD });
    fireEvent.click(screen.getByRole('button', { name: 'Clone first to all 3' }));
    expect(actions.cloneBadge).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Cloned first badge to all 3', tone: 'good' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove badges' }));
    await waitFor(() => expect(store.getState().session.statusLine).toEqual({ text: 'Badges removed', tone: 'good' }));
  });

  it('is translated', () => {
    setup({ rank: GOLD, locale: 'pt_BR' });
    expect(screen.getByRole('button', { name: 'Ouro' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy();
  });
});
