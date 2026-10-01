import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { startApp } from '../../src/app/main.jsx';
import { createDrakeStore } from '../../src/app/store/createDrakeStore.js';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

function setup({ installUpdate = vi.fn(async () => ({ ok: true, installing: true })), locale } = {}) {
  const shadow = makeShadow();
  const store = createDrakeStore();
  if (locale) store.getState().setLocale(locale);
  const actions = { navigate: vi.fn(), close: vi.fn(), openUrl: vi.fn(), installUpdate };
  const app = startApp(shadow, { store, actions });
  return { shadow, store, actions, app, view: within(shadow) };
}

describe('mandatory update', () => {
  it('replaces Drake with a popup that cannot be closed', () => {
    const { shadow, store, view, app } = setup();
    expect(shadow.querySelector('.drk-panel')).not.toBeNull();
    act(() => store.getState().setSession({ updateRequired: { version: 'v0.4.2', phase: 'required' } }));
    expect(shadow.querySelector('.drk-panel')).toBeNull();
    const dialog = view.getByRole('dialog', { name: 'Update required' });
    expect(dialog.textContent).toContain('v0.4.2');
    expect(dialog.querySelector('.drk-modal__close')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(view.getByRole('dialog')).toBeTruthy();
    act(() => app.unmount());
  });

  it('installs from the popup and shows why it failed', async () => {
    const installUpdate = vi.fn(async () => ({ ok: false, reason: 'could not install the update (500)' }));
    const { store, view, app } = setup({ installUpdate });
    act(() => store.getState().setSession({ updateRequired: { version: 'v0.4.2', phase: 'required' } }));
    fireEvent.click(view.getByRole('button', { name: 'Update now' }));
    expect(installUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('could not install the update (500)'));
    expect(store.getState().session.updateRequired.phase).toBe('error');
    act(() => app.unmount());
  });

  it('lets the player continue without Drake, which stays off', async () => {
    const { shadow, store, view, app } = setup();
    act(() => store.getState().setSession({ updateRequired: { version: 'v0.4.2', phase: 'required' } }));
    fireEvent.click(view.getByRole('button', { name: 'Continue without Drake' }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    expect(shadow.querySelector('.drk-panel')).toBeNull();
    expect(store.getState().session.updateRequired.phase).toBe('dismissed');
    act(() => app.unmount());
  });

  it('speaks the client language', () => {
    const { store, view, app } = setup({ locale: 'pt_BR' });
    act(() => store.getState().setSession({ updateRequired: { version: 'v0.4.2', phase: 'required' } }));
    expect(view.getByRole('dialog', { name: 'Atualização obrigatória' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Atualizar agora' })).toBeTruthy();
    act(() => app.unmount());
  });
});
