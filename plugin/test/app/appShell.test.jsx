import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { startApp } from '../../src/app/main.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('app shell mount', () => {
  it('exposes the legacy containers synchronously', () => {
    const shadow = makeShadow();
    const store = createDrakeStore();
    const app = startApp(shadow, { store, actions: { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() } });
    expect(shadow.getElementById('content')).not.toBeNull();
    expect(shadow.querySelector('.drk-panel')).not.toBeNull();
    act(() => app.unmount());
  });

  it('routes shell interactions to the legacy actions', () => {
    const shadow = makeShadow();
    const store = createDrakeStore();
    const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn() };
    const app = startApp(shadow, { store, actions });
    fireEvent.click(shadow.querySelector('[data-screen="queue"]'));
    expect(actions.navigate).toHaveBeenCalledWith('queue');
    fireEvent.mouseDown(shadow.querySelector('.drk-panel'));
    expect(actions.close).toHaveBeenCalledTimes(1);
    act(() => app.unmount());
  });
});
