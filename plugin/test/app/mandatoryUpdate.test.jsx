import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { startApp } from '../../src/app/main.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

function setup({ installRequiredUpdate = vi.fn(async () => {}), locale } = {}) {
  const shadow = makeShadow();
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn(), installRequiredUpdate };
  const app = startApp(shadow, { store, actions });
  const require = (patch = {}) =>
    act(() => store.getState().setSession({ updateRequired: { version: 'v0.4.4', phase: 'required', ...patch } }));
  return { shadow, store, actions, app, require, view: within(shadow) };
}

describe('mandatory update', () => {
  it('replaces Drake with a popup that cannot be closed', () => {
    const { shadow, view, app, require } = setup();
    expect(shadow.querySelector('.drk-panel')).not.toBeNull();
    require();
    expect(shadow.querySelector('.drk-panel')).toBeNull();
    const dialog = view.getByRole('dialog', { name: 'Update required' });
    expect(dialog.textContent).toContain('v0.4.4');
    expect(dialog.querySelector('.drk-modal__close')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(view.getByRole('dialog')).toBeTruthy();
    act(() => app.unmount());
  });

  it('hands the install to the runtime and walks through each step', () => {
    const { actions, view, app, require } = setup();
    require();
    fireEvent.click(view.getByRole('button', { name: 'Update now' }));
    expect(actions.installRequiredUpdate).toHaveBeenCalledTimes(1);
    for (const [phase, text] of [
      ['installing', 'Downloading and installing…'],
      ['restarting', 'Drake is restarting with the new version…'],
      ['reloading', 'Reloading the client…'],
    ]) {
      require({ phase });
      expect(view.getByRole('status').textContent).toBe(text);
      expect(view.getByRole('button', { name: 'Update now' }).disabled).toBe(true);
      expect(view.getByRole('button', { name: 'Continue without Drake' }).disabled).toBe(true);
    }
    act(() => app.unmount());
  });

  it('explains why the update did not finish and offers to try again', () => {
    const { actions, view, app, require } = setup();
    require({ phase: 'error', reason: 'same-version' });
    expect(view.getByRole('alert').textContent).toContain('choose Yes and try again');
    require({ phase: 'error', reason: 'timeout' });
    expect(view.getByRole('alert').textContent).toContain('Start menu');
    require({ phase: 'error', reason: 'failed', message: 'could not install the update (502)' });
    expect(view.getByRole('alert').textContent).toContain('could not install the update (502)');
    fireEvent.click(view.getByRole('button', { name: 'Try again' }));
    expect(actions.installRequiredUpdate).toHaveBeenCalledTimes(1);
    act(() => app.unmount());
  });

  it('lets the player continue without Drake, which stays off', async () => {
    const { shadow, store, view, app, require } = setup();
    require();
    fireEvent.click(view.getByRole('button', { name: 'Continue without Drake' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    expect(shadow.querySelector('.drk-panel')).toBeNull();
    expect(store.getState().session.updateRequired.phase).toBe('dismissed');
    act(() => app.unmount());
  });

  it('speaks the client language', () => {
    const { view, app, require } = setup({ locale: 'pt_BR' });
    require({ phase: 'restarting' });
    expect(view.getByRole('dialog', { name: 'Atualização obrigatória' })).toBeTruthy();
    expect(view.getByRole('status').textContent).toBe('O Drake está reiniciando com a nova versão…');
    act(() => app.unmount());
  });
});
