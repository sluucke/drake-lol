import { describe, it, expect, vi } from 'vitest';
import { CHAT_ME } from '../src/features/presence.js';
import { GAMEFLOW_PHASE_ROUTE } from '../src/features/dodge.js';
import {
  readAvailability,
  readForcedAvailability,
  presenceNeedsRefresh,
  applyPresenceLock,
  startPresenceLock,
} from '../src/features/presenceLock.js';

describe('readAvailability', () => {
  it('reads the top-level availability field', () => {
    expect(readAvailability({ availability: 'chat' })).toBe('chat');
    expect(readAvailability({ availability: 'offline' })).toBe('offline');
  });

  it('treats a missing field as empty', () => {
    expect(readAvailability({})).toBe('');
  });
});

describe('readForcedAvailability', () => {
  it('reads the saved presence from settings', () => {
    expect(readForcedAvailability({ presence_availability: 'dnd' })).toBe('dnd');
  });

  it('treats a blank setting as disabled', () => {
    expect(readForcedAvailability({ presence_availability: '' })).toBe('');
    expect(readForcedAvailability({})).toBe('');
  });
});

describe('presenceNeedsRefresh', () => {
  it('is true when the client drifted away from the chosen status', () => {
    expect(presenceNeedsRefresh({ availability: 'chat' }, 'offline')).toBe(true);
  });

  it('is false when the client already matches', () => {
    expect(presenceNeedsRefresh({ availability: 'dnd' }, 'dnd')).toBe(false);
  });

  it('is false when nothing is configured', () => {
    expect(presenceNeedsRefresh({ availability: 'chat' }, '')).toBe(false);
  });
});

describe('applyPresenceLock', () => {
  it('asks presence to set the chosen availability', async () => {
    const presence = { setAvailability: vi.fn().mockResolvedValue({ ok: true }) };
    await applyPresenceLock(presence, 'mobile');
    expect(presence.setAvailability).toHaveBeenCalledWith('mobile');
  });
});

describe('startPresenceLock', () => {
  it('does nothing while client default is selected', async () => {
    const presence = { setAvailability: vi.fn() };
    startPresenceLock({
      subscribe: () => () => {},
      getSettings: () => ({ presence_availability: '' }),
      presence,
      lcu: { get: vi.fn() },
    });
    await Promise.resolve();
    expect(presence.setAvailability).not.toHaveBeenCalled();
  });

  it('applies the chosen status on start', async () => {
    const presence = { setAvailability: vi.fn().mockResolvedValue({ ok: true }) };
    startPresenceLock({
      subscribe: () => () => {},
      getSettings: () => ({ presence_availability: 'offline' }),
      presence,
      lcu: { get: vi.fn().mockResolvedValue({ availability: 'chat' }) },
    });
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledWith('offline'));
  });

  it('re-applies the chosen status when chat availability changes', async () => {
    const handlers = new Map();
    const presence = { setAvailability: vi.fn().mockResolvedValue({ ok: true }) };
    startPresenceLock({
      subscribe: (route, fn) => {
        handlers.set(route, fn);
        return () => {};
      },
      getSettings: () => ({ presence_availability: 'dnd' }),
      presence,
      lcu: { get: vi.fn().mockResolvedValue({ availability: 'chat' }) },
    });
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledWith('dnd'));

    presence.setAvailability.mockClear();
    await handlers.get(CHAT_ME)({ availability: 'chat' });
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledWith('dnd'));
  });

  it('re-applies the chosen status when gameflow moves', async () => {
    const handlers = new Map();
    const presence = { setAvailability: vi.fn().mockResolvedValue({ ok: true }) };
    const lcu = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ availability: 'chat' })
        .mockResolvedValueOnce({ availability: 'chat' }),
    };
    startPresenceLock({
      subscribe: (route, fn) => {
        handlers.set(route, fn);
        return () => {};
      },
      getSettings: () => ({ presence_availability: 'mobile' }),
      presence,
      lcu,
    });
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledWith('mobile'));

    presence.setAvailability.mockClear();
    await handlers.get(GAMEFLOW_PHASE_ROUTE)('Lobby');
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledWith('mobile'));
  });

  it('stops re-applying once client default is selected again', async () => {
    const handlers = new Map();
    let settings = { presence_availability: 'offline' };
    const presence = { setAvailability: vi.fn().mockResolvedValue({ ok: true }) };
    startPresenceLock({
      subscribe: (route, fn) => {
        handlers.set(route, fn);
        return () => {};
      },
      getSettings: () => settings,
      presence,
      lcu: { get: vi.fn().mockResolvedValue({ availability: 'chat' }) },
    });
    await vi.waitFor(() => expect(presence.setAvailability).toHaveBeenCalledTimes(1));

    settings = { presence_availability: '' };
    presence.setAvailability.mockClear();
    await handlers.get(GAMEFLOW_PHASE_ROUTE)('Lobby');
    await Promise.resolve();
    expect(presence.setAvailability).not.toHaveBeenCalled();
  });
});
