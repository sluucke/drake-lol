import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { FriendsScreen } from '../../../src/app/screens/Friends.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';

const FRIENDS = [
  { id: 'a', riotId: 'Ahri#EUW', online: true, note: 'duo', statusMessage: '' },
  { id: 'b', riotId: 'Bard#BR1', online: true, note: '', statusMessage: 'in game' },
  { id: 'c', riotId: 'Cait#NA1', online: false, note: '', statusMessage: '' },
];

function setup({ friends = FRIENDS, locale, actions } = {}) {
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ friends });
  const acts = actions || { removeAllFriends: vi.fn(async () => ({ removed: 3, failed: 0 })) };
  const utils = renderWithProviders(<FriendsScreen />, { store, actions: acts });
  return { ...utils, store, actions: acts };
}

describe('FriendsScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('friends')).toBe(true);
  });

  it('lists friends with presence and notes', () => {
    setup();
    expect(screen.getByText('2 online of 3. Notes are the ones you set in the client.')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Ahri#EUW');
    expect(items[0].textContent).toContain('duo');
    expect(items[1].textContent).toContain('in game');
    expect(items[0].querySelector('.drk-friend__dot').className).toContain('is-online');
    expect(items[2].querySelector('.drk-friend__dot').className).not.toContain('is-online');
  });

  it('shows the empty state without the remove button', () => {
    setup({ friends: [] });
    expect(screen.getByText('Nobody on the list, or the client has not shared it yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove all' })).toBeNull();
  });

  it('confirms before removing everyone', async () => {
    const { actions, store, portalTarget } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(actions.removeAllFriends).not.toHaveBeenCalled();
    const dialog = within(portalTarget).getByRole('dialog', { name: 'Remove all friends?' });
    expect(within(dialog).getByText('This removes all 3 friends. It cannot be undone from Drake.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove all' }));
    expect(actions.removeAllFriends).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(store.getState().session.statusLine).toEqual({ text: 'Removed 3 friends', tone: 'good' }));
    await waitFor(() => expect(within(portalTarget).queryByRole('dialog')).toBeNull());
  });

  it('can be cancelled', async () => {
    const { actions, portalTarget } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    fireEvent.click(within(portalTarget).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(within(portalTarget).queryByRole('dialog')).toBeNull());
    expect(actions.removeAllFriends).not.toHaveBeenCalled();
  });

  it('reports partial failures', async () => {
    const actions = { removeAllFriends: vi.fn(async () => ({ removed: 2, failed: 1 })) };
    const { store, portalTarget } = setup({ actions });
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    fireEvent.click(within(within(portalTarget).getByRole('dialog')).getByRole('button', { name: 'Remove all' }));
    await waitFor(() => expect(store.getState().session.statusLine).toEqual({ text: 'Removed 2, 1 failed', tone: 'bad' }));
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Amigos' })).toBeTruthy();
    expect(screen.getByText('2 online de 3. As notas são as que você definiu no cliente.')).toBeTruthy();
  });
});
