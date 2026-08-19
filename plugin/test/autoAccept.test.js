import { describe, it, expect, vi } from 'vitest';
import { shouldAccept, startAutoAccept } from '../src/autoAccept.js';

const PHASE_ROUTE = '/lol-gameflow/v1/gameflow-phase';
const READY_CHECK_ROUTE = '/lol-matchmaking/v1/ready-check';

function makeSubscribe() {
  const handlers = {};
  const subscribe = vi.fn((route, fn) => {
    handlers[route] = fn;
    return () => { delete handlers[route]; };
  });
  const emit = (route, payload) => handlers[route]?.(payload);
  const emitLobby = () => emit(PHASE_ROUTE, '"Lobby"');
  return { subscribe, emit, emitLobby };
}

describe('shouldAccept', () => {
  it('accepts while the ready check is still pending', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'None' })).toBe(true);
  });

  it('does not accept twice after the player already responded', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'Accepted' })).toBe(false);
  });

  it('does not accept when the player declined', () => {
    expect(shouldAccept({ state: 'InProgress', playerResponse: 'Declined' })).toBe(false);
  });

  it('ignores a finished ready check', () => {
    expect(shouldAccept({ state: 'Invalid', playerResponse: 'None' })).toBe(false);
  });

  it('is safe on a null payload', () => {
    expect(shouldAccept(null)).toBe(false);
  });
});

describe('startAutoAccept', () => {
  it('posts accept when enabled and the check is pending', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitLobby } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe });
    emitLobby();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does not poll ready-check when phase is not Lobby', async () => {
    const lcu = { post: vi.fn() };
    const { subscribe, emit } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe });
    emit(PHASE_ROUTE, '"ChampSelect"');
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('stops polling ready-check when phase leaves Lobby', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const onState = vi.fn();
    const { subscribe, emit, emitLobby } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe, onState });
    emitLobby();
    emit(PHASE_ROUTE, '"ChampSelect"');
    expect(onState).toHaveBeenCalledWith(null);
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('does nothing at all when disabled', () => {
    const lcu = { post: vi.fn() };
    const { subscribe } = makeSubscribe();
    startAutoAccept({ enabled: false, lcu, subscribe });
    expect(subscribe).not.toHaveBeenCalled();
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('waits the configured delay before accepting', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitLobby } = makeSubscribe();
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    emitLobby();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(lcu.post).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(3000);
    timers[0].fn();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does not stack timers when the same check reports repeatedly', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitLobby } = makeSubscribe();
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    emitLobby();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(timers).toHaveLength(1);
  });

  it('cancels a pending accept when the check goes away', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitLobby } = makeSubscribe();
    const cleared = [];
    const setTimeoutImpl = () => 42;
    const clearTimeoutImpl = (id) => cleared.push(id);

    startAutoAccept({
      enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl, clearTimeoutImpl,
    });
    emitLobby();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'Invalid', playerResponse: 'None' });

    expect(cleared).toContain(42);
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('accepts immediately when the delay is zero', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitLobby } = makeSubscribe();
    const setTimeoutImpl = vi.fn();

    startAutoAccept({ enabled: true, delayMs: 0, lcu, subscribe, setTimeoutImpl });
    emitLobby();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });
});
