import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { startApp } from '../../src/app/main';
import { createDrakeStore } from '../../src/app/store/createDrakeStore';
import type { AppActions } from '../../src/app/AppProviders';

function asActions(actions: Partial<AppActions>): AppActions {
  return actions as AppActions;
}

function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('missing element');
  return value;
}

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('app shell mount', () => {
  it('mounts the panel synchronously without a legacy content container', () => {
    const shadow = makeShadow();
    const store = createDrakeStore();
    const app = startApp(shadow, { store, actions: asActions({ navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() }) });
    expect(shadow.getElementById('content')).toBeNull();
    expect(shadow.querySelector('.drk-panel')).not.toBeNull();
    act(() => app.unmount());
  });

  it('routes shell interactions to the legacy actions', () => {
    const shadow = makeShadow();
    const store = createDrakeStore();
    const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() };
    const app = startApp(shadow, { store, actions: asActions(actions) });
    fireEvent.click(must(shadow.querySelector('[data-screen="queue"]')));
    expect(actions.navigate).toHaveBeenCalledWith('queue');
    fireEvent.mouseDown(must(shadow.querySelector('.drk-panel')));
    expect(actions.close).toHaveBeenCalledTimes(1);
    act(() => app.unmount());
  });

  it('renders the client docks in the app layer', () => {
    const shadow = makeShadow();
    const store = createDrakeStore();
    store.getState().patchChampSelect({ cancelable: true });
    const app = startApp(shadow, { store, actions: asActions({ navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() }) });
    const button = [...shadow.querySelectorAll('.drk-dock button')].find((b) => b.textContent === 'Cancel Queue');
    expect(button).toBeTruthy();
    act(() => app.unmount());
  });
});
