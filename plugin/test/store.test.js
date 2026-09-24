import { describe, it, expect, vi } from 'vitest';
import { createDrakeStore } from '../src/app/store/createDrakeStore.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createDrakeStore', () => {
  it('starts from the given settings and version', () => {
    const store = createDrakeStore({ settings: { auto_accept: true }, appVersion: '0.3.25' });
    const state = store.getState();
    expect(state.settings.values).toEqual({ auto_accept: true });
    expect(state.settings.trayDown).toBe(false);
    expect(state.session.appVersion).toBe('0.3.25');
    expect(state.session.locale).toBe('en_US');
    expect(state.ui).toEqual({ panelOpen: false, screen: 'auto-accept', overlay: '', tourIndex: -1 });
  });

  it('updates session and ui', () => {
    const store = createDrakeStore();
    store.getState().setLocale('pt_BR');
    store.getState().setPanelOpen(true);
    store.getState().setUi({ screen: 'queue' });
    store.getState().setSession({ idle: true });
    const state = store.getState();
    expect(state.session.locale).toBe('pt_BR');
    expect(state.session.idle).toBe(true);
    expect(state.ui.panelOpen).toBe(true);
    expect(state.ui.screen).toBe('queue');
  });

  it('saves settings optimistically through the client', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const store = createDrakeStore({ settings: { auto_accept: false }, settingsClient: { save } });
    const pending = store.getState().saveSettings({ auto_accept: true });
    expect(store.getState().settings.values.auto_accept).toBe(true);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({ auto_accept: true });
    expect(store.getState().settings.error).toBe('');
  });

  it('reverts patched keys and flags the tray when it is down', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'the Drake tray is not running' }));
    const store = createDrakeStore({ settings: { auto_accept: false }, settingsClient: { save } });
    const result = await store.getState().saveSettings({ auto_accept: true, new_key: 1 });
    expect(result.ok).toBe(false);
    const { settings } = store.getState();
    expect(settings.values).toEqual({ auto_accept: false });
    expect(settings.trayDown).toBe(true);
    expect(settings.error).toBe('the Drake tray is not running');
  });

  it('does not flag the tray for other failures', async () => {
    const save = vi.fn(async () => ({ ok: false, reason: 'the tray rejected the change (500)' }));
    const store = createDrakeStore({ settings: {}, settingsClient: { save } });
    await store.getState().saveSettings({ a: 1 });
    expect(store.getState().settings.trayDown).toBe(false);
  });

  it('keeps unrelated changes made while a save is pending', async () => {
    const gate = deferred();
    const save = vi.fn(() => gate.promise);
    const store = createDrakeStore({ settings: { a: 1, b: 1 }, settingsClient: { save } });
    const pending = store.getState().saveSettings({ a: 2 });
    store.getState().syncLegacy({ settings: { ...store.getState().settings.values, b: 5 } });
    gate.resolve({ ok: false, reason: 'the tray rejected the change (500)' });
    await pending;
    expect(store.getState().settings.values).toEqual({ a: 1, b: 5 });
  });

  it('saves locally without a client', async () => {
    const store = createDrakeStore({ settings: { a: 1 } });
    await expect(store.getState().saveSettings({ a: 2 })).resolves.toEqual({ ok: true });
    expect(store.getState().settings.values.a).toBe(2);
  });

  it('syncs only the defined legacy fields', () => {
    const store = createDrakeStore({ settings: { a: 1 }, appVersion: '1.0.0' });
    store.getState().setLocale('pt_BR');
    store.getState().syncLegacy({ screen: 'status', statusText: 'chat', trayDown: true });
    const state = store.getState();
    expect(state.ui.screen).toBe('status');
    expect(state.ui.overlay).toBe('');
    expect(state.session.statusText).toBe('chat');
    expect(state.session.appVersion).toBe('1.0.0');
    expect(state.session.locale).toBe('pt_BR');
    expect(state.settings.trayDown).toBe(true);
    expect(state.settings.values).toEqual({ a: 1 });
  });
});
