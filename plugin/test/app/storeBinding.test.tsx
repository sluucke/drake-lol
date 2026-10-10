// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AppProviders } from '../../src/app/AppProviders';
import { createDrakeStore } from '../../src/app/store/createDrakeStore';
import { useDrake } from '../../src/app/store/StoreContext';
import { useT } from '../../src/app/i18n/I18nProvider';

function Probe() {
  const t = useT();
  const open = useDrake((state) => state.ui.panelOpen);
  const screenId = useDrake((state) => state.ui.screen);
  return (
    <div>
      <span data-testid="label">{t('common.close')}</span>
      <span data-testid="open">{String(open)}</span>
      <span data-testid="screen">{screenId}</span>
    </div>
  );
}

describe('store binding', () => {
  it('re-renders components when the store changes', () => {
    const store = createDrakeStore();
    render(
      <AppProviders store={store}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('open').textContent).toBe('false');
    act(() => {
      store.getState().setPanelOpen(true);
      store.getState().syncLegacy({ screen: 'queue' });
    });
    expect(screen.getByTestId('open').textContent).toBe('true');
    expect(screen.getByTestId('screen').textContent).toBe('queue');
  });

  it('switches language when the session locale changes', () => {
    const store = createDrakeStore();
    render(
      <AppProviders store={store}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('label').textContent).toBe('Close');
    act(() => store.getState().setLocale('pt_BR'));
    expect(screen.getByTestId('label').textContent).toBe('Fechar');
  });

  it('works without an explicit store', () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId('label').textContent).toBe('Close');
  });
});
