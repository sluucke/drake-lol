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
    expect(state.ui).toEqual({
      panelOpen: false,
      screen: 'auto-accept',
      overlay: '',
      tourIndex: -1,
      creditsOpen: false,
      escapeLayers: 0,
      autoPickRole: 'TOP',
      championQueries: { 'auto-pick': '', 'auto-ban': '' },
      skinQuery: '',
    });
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

describe('shell state', () => {
  it('tracks host label and status line', () => {
    const store = createDrakeStore();
    expect(store.getState().session.hostLabel).toBe('');
    expect(store.getState().session.statusLine).toBeNull();
    store.getState().setSession({ hostLabel: 'Drake 0.3.25' });
    store.getState().setStatusLine({ text: 'Saved', tone: 'good' });
    expect(store.getState().session.hostLabel).toBe('Drake 0.3.25');
    expect(store.getState().session.statusLine).toEqual({ text: 'Saved', tone: 'good' });
    store.getState().setStatusLine(null);
    expect(store.getState().session.statusLine).toBeNull();
  });

  it('opens and closes credits', () => {
    const store = createDrakeStore();
    store.getState().setCreditsOpen(true);
    expect(store.getState().ui.creditsOpen).toBe(true);
    store.getState().setCreditsOpen(false);
    expect(store.getState().ui.creditsOpen).toBe(false);
  });

  it('counts escape layers without going negative', () => {
    const store = createDrakeStore();
    store.getState().pushEscapeLayer();
    store.getState().pushEscapeLayer();
    expect(store.getState().ui.escapeLayers).toBe(2);
    store.getState().popEscapeLayer();
    store.getState().popEscapeLayer();
    store.getState().popEscapeLayer();
    expect(store.getState().ui.escapeLayers).toBe(0);
  });
});

describe('reveal timing', () => {
  it('defaults and syncs from the legacy module', () => {
    const store = createDrakeStore();
    expect(store.getState().session.revealTiming).toEqual({ lastMs: 0, lastConcurrency: 1 });
    store.getState().syncLegacy({ revealTiming: { lastMs: 9000, lastConcurrency: 2 } });
    expect(store.getState().session.revealTiming).toEqual({ lastMs: 9000, lastConcurrency: 2 });
  });
});

describe('champion state', () => {
  it('syncs the champion list from the legacy module', () => {
    const store = createDrakeStore();
    expect(store.getState().session.champions).toEqual([]);
    const list = [{ id: 103, name: 'Ahri', alias: 'Ahri' }];
    store.getState().syncLegacy({ champions: list });
    expect(store.getState().session.champions).toBe(list);
  });

  it('keeps the auto pick role and queries in ui', () => {
    const store = createDrakeStore();
    store.getState().setUi({ autoPickRole: 'MIDDLE', championQueries: { 'auto-pick': 'ah', 'auto-ban': '' } });
    expect(store.getState().ui.autoPickRole).toBe('MIDDLE');
    expect(store.getState().ui.championQueries['auto-pick']).toBe('ah');
  });
});

describe('profile state', () => {
  it('has profile and friends defaults', () => {
    const { session } = createDrakeStore().getState();
    expect(session.profileTab).toBe('rank');
    expect(session.profileRank).toEqual({ tier: '', division: 'I', queue: 'RANKED_SOLO_5x5', crystal: 'IRON' });
    expect(session.skins).toEqual([]);
    expect(session.backgroundId).toBe(0);
    expect(session.friends).toEqual([]);
  });

  it('syncs any other legacy field into the session', () => {
    const store = createDrakeStore();
    const friends = [{ id: 'a', riotId: 'A#1', online: true }];
    store.getState().syncLegacy({ profileTab: 'banner', friends, backgroundId: 7, screen: 'profile' });
    const state = store.getState();
    expect(state.session.profileTab).toBe('banner');
    expect(state.session.friends).toBe(friends);
    expect(state.session.backgroundId).toBe(7);
    expect(state.ui.screen).toBe('profile');
    expect(state.session.screen).toBeUndefined();
  });
});

describe('team reveal slice', () => {
  it('defaults and merges published views', () => {
    const store = createDrakeStore();
    expect(store.getState().teamReveal).toEqual({
      enabled: false,
      open: false,
      activeTab: 'scouting',
      statusPhase: 'hidden',
      statusSeq: 0,
      muteStatus: 'idle',
      side: null,
      rows: [],
      buildSig: '',
    });
    store.getState().setTeamReveal({ open: true, rows: [{ cellId: 1 }] });
    expect(store.getState().teamReveal.open).toBe(true);
    expect(store.getState().teamReveal.rows).toEqual([{ cellId: 1 }]);
    expect(store.getState().teamReveal.activeTab).toBe('scouting');
  });
});
