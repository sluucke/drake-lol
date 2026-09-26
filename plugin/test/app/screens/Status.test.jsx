import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../renderWithProviders.jsx';
import { createDrakeStore } from '../../../src/app/store/createDrakeStore.js';
import { StatusScreen, describeStatusText } from '../../../src/app/screens/Status.jsx';
import { isReactScreen } from '../../../src/app/screens/registry.jsx';
import { createTranslator } from '../../../src/app/i18n/runtime.js';
import { DICTS } from '../../../src/app/i18n/locales/index.js';

function makeActions(overrides = {}) {
  return {
    navigate: vi.fn(),
    close: vi.fn(),
    openUrl: vi.fn(),
    setSettings: vi.fn(async () => ({ ok: true })),
    saveStatus: vi.fn(async () => ({ ok: true })),
    revealLobby: vi.fn(async () => ({ ok: true, count: 3 })),
    dodge: vi.fn(async () => ({ ok: true })),
    checkUpdates: vi.fn(async () => {}),
    installUpdate: vi.fn(async () => ({ ok: true, installing: true })),
    restartClient: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function setup({ settings = {}, statusText = '', locale, actions = makeActions() } = {}) {
  const store = createDrakeStore({ settings });
  if (locale) store.getState().setLocale(locale);
  store.getState().syncLegacy({ statusText });
  const utils = renderWithProviders(<StatusScreen />, { store, actions });
  return { ...utils, store, actions };
}

describe('describeStatusText', () => {
  it('counts characters and lines', () => {
    const t = createTranslator('en_US', DICTS);
    expect(describeStatusText('', t)).toBe('0 chars · 0 lines');
    expect(describeStatusText('hi', t)).toBe('2 chars · 1 line');
    expect(describeStatusText('hello\nworld', t)).toBe('11 chars · 2 lines');
  });
});

describe('StatusScreen', () => {
  it('is registered', () => {
    expect(isReactScreen('status')).toBe(true);
  });

  it('edits the draft and shows the count', () => {
    setup({ statusText: 'hello\nworld' });
    const box = screen.getByRole('textbox', { name: 'Status Message' });
    expect(box.value).toBe('hello\nworld');
    expect(screen.getByText('11 chars · 2 lines')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'gg' } });
    expect(screen.getByText('2 chars · 1 line')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box.value).toBe('');
  });

  it('resets the draft when the client status is reloaded', () => {
    const { store } = setup({ statusText: 'old' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Status Message' }), { target: { value: 'draft' } });
    act(() => store.getState().syncLegacy({ statusText: 'fresh' }));
    expect(screen.getByRole('textbox', { name: 'Status Message' }).value).toBe('fresh');
  });

  it('saves and reports success', async () => {
    const { store, actions } = setup({ statusText: 'gg' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.saveStatus).toHaveBeenCalledWith('gg');
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({ text: 'Status saved · 2 chars · 1 line', tone: 'good' }),
    );
  });

  it('reports save failures', async () => {
    const actions = makeActions({ saveStatus: vi.fn(async () => ({ ok: false, reason: 'the client rejected it (500)' })) });
    const { store } = setup({ statusText: 'gg', actions });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(store.getState().session.statusLine).toEqual({
        text: 'Could not save: the client rejected it (500)',
        tone: 'bad',
      }),
    );
  });

  it('changes presence but ignores client default', () => {
    const { actions, portalTarget } = setup({ settings: { presence_availability: 'dnd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Presence' }));
    const list = within(portalTarget).getByRole('listbox');
    expect(within(list).getByRole('option', { name: 'Busy' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(list).getByRole('option', { name: 'Client default' }));
    expect(actions.setSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Presence' }));
    fireEvent.click(within(portalTarget).getByRole('option', { name: 'Online' }));
    expect(actions.setSettings).toHaveBeenCalledWith({ presence_availability: 'chat' });
  });

  it('is translated', () => {
    setup({ locale: 'pt_BR' });
    expect(screen.getByRole('heading', { name: 'Mensagem de status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy();
  });
});
