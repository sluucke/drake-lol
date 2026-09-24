import { describe, it, expect } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';
import { LegacyScreen } from '../../src/app/shell/LegacyScreen.jsx';
import { NOOP_ACTIONS } from '../../src/app/shell/LegacyActions.jsx';
import { isReactScreen } from '../../src/app/screens/registry.jsx';

function QueueProbe() {
  return <p>react queue</p>;
}

describe('screen host', () => {
  it('renders registered screens and hides the legacy container', () => {
    const store = createDrakeStore();
    const { container } = renderWithProviders(<LegacyScreen screens={{ queue: QueueProbe }} />, { store });
    const legacy = container.querySelector('#content');
    expect(legacy.hidden).toBe(false);
    expect(screen.queryByText('react queue')).toBeNull();
    act(() => store.getState().syncLegacy({ screen: 'queue' }));
    expect(legacy.hidden).toBe(true);
    expect(screen.getByText('react queue')).toBeTruthy();
    expect(container.querySelector('#content')).toBe(legacy);
    act(() => store.getState().syncLegacy({ screen: 'whats-new' }));
    expect(legacy.hidden).toBe(false);
    expect(screen.queryByText('react queue')).toBeNull();
  });

  it('only reports registered ids', () => {
    expect(isReactScreen('definitely-not-a-screen')).toBe(false);
  });

  it('exposes no-op legacy actions', async () => {
    for (const name of ['setSettings', 'saveStatus', 'revealLobby', 'dodge', 'checkUpdates', 'installUpdate', 'restartClient']) {
      expect(typeof NOOP_ACTIONS[name]).toBe('function');
      await NOOP_ACTIONS[name]();
    }
  });
});
