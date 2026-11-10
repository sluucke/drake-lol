import { describe, it, expect } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders';
import { createDrakeStore } from '../../src/app/store/createDrakeStore';
import { ScreenHost } from '../../src/app/shell/ScreenHost';
import { NOOP_ACTIONS } from '../../src/app/shell/LegacyActions';
import { isReactScreen } from '../../src/app/screens/registry';

function QueueProbe() {
  return <p>react queue</p>;
}

describe('screen host', () => {
  it('renders the registered screen for the current id', () => {
    const store = createDrakeStore();
    const { container } = renderWithProviders(<ScreenHost screens={{ queue: QueueProbe }} />, { store });
    expect(container.querySelector('#content')).toBeNull();
    expect(screen.queryByText('react queue')).toBeNull();
    act(() => store.getState().syncLegacy({ screen: 'queue' }));
    expect(screen.getByText('react queue').closest('.content.drk-screen')).not.toBeNull();
    act(() => store.getState().syncLegacy({ screen: 'not-a-screen' }));
    expect(screen.queryByText('react queue')).toBeNull();
  });

  it('only reports registered ids', () => {
    expect(isReactScreen('definitely-not-a-screen')).toBe(false);
  });

  it('exposes no-op legacy actions', async () => {
    const names = ['setSettings', 'saveStatus', 'revealLobby', 'dodge', 'checkUpdates', 'installUpdate', 'restartClient'] as const;
    for (const name of names) {
      expect(typeof NOOP_ACTIONS[name]).toBe('function');
      await (NOOP_ACTIONS[name] as (...args: unknown[]) => Promise<unknown>)();
    }
  });
});
