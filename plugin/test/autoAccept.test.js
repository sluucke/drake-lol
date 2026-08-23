import { describe, it, expect, vi } from 'vitest';
import { shouldAccept, startAutoAccept, cancelQueue } from '../src/autoAccept.js';

const PHASE_ROUTE = '/lol-gameflow/v1/gameflow-phase';
const READY_CHECK_ROUTE = '/lol-matchmaking/v1/ready-check';

function makeSubscribe() {
  const handlers = {};
  const subscribe = vi.fn((route, fn) => {
    handlers[route] = fn;
    return () => { delete handlers[route]; };
  });
  const emit = (route, payload) => handlers[route]?.(payload);
  const emitQueue = () => emit(PHASE_ROUTE, '"Matchmaking"');
  const listening = () => Object.prototype.hasOwnProperty.call(handlers, READY_CHECK_ROUTE);
  return { subscribe, emit, emitQueue, listening };
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
    const { subscribe, emit, emitQueue } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe });
    emitQueue();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('is still listening once the queue pops the check', async () => {
    // The phase is Matchmaking while searching and ReadyCheck when the popup
    // appears. It is never Lobby, so gating on Lobby never accepts anything.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, listening } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe });
    emit(PHASE_ROUTE, '"Matchmaking"');
    expect(listening()).toBe(true);
    emit(PHASE_ROUTE, '"ReadyCheck"');
    expect(listening()).toBe(true);
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does not poll ready-check while the lobby is just sitting there', async () => {
    const lcu = { post: vi.fn() };
    const { subscribe, emit, listening } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe });
    emit(PHASE_ROUTE, '"Lobby"');
    expect(listening()).toBe(false);
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('stops polling ready-check once champ select starts', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const onState = vi.fn();
    const { subscribe, emit, emitQueue } = makeSubscribe();
    startAutoAccept({ enabled: true, lcu, subscribe, onState });
    emitQueue();
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
    const { subscribe, emit, emitQueue } = makeSubscribe();
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    emitQueue();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(lcu.post).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(3000);
    timers[0].fn();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does not stack timers when the same check reports repeatedly', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitQueue } = makeSubscribe();
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    emitQueue();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(timers).toHaveLength(1);
  });

  it('cancels a pending accept when the check goes away', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitQueue } = makeSubscribe();
    const cleared = [];
    const setTimeoutImpl = () => 42;
    const clearTimeoutImpl = (id) => cleared.push(id);

    startAutoAccept({
      enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl, clearTimeoutImpl,
    });
    emitQueue();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });
    await emit(READY_CHECK_ROUTE, { state: 'Invalid', playerResponse: 'None' });

    expect(cleared).toContain(42);
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('accepts immediately when the delay is zero', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    const { subscribe, emit, emitQueue } = makeSubscribe();
    const setTimeoutImpl = vi.fn();

    startAutoAccept({ enabled: true, delayMs: 0, lcu, subscribe, setTimeoutImpl });
    emitQueue();
    await emit(READY_CHECK_ROUTE, { state: 'InProgress', playerResponse: 'None' });

    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });
});

describe('cancelQueue', () => {
  it('declines the ready check and leaves matchmaking search', async () => {
    const lcu = {
      post: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    };

    await cancelQueue(lcu);

    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/decline');
    expect(lcu.delete).toHaveBeenCalledWith('/lol-lobby/v2/lobby/matchmaking/search');
  });

  it('still leaves the queue when decline fails', async () => {
    const lcu = {
      post: vi.fn().mockRejectedValue(new Error('already gone')),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    };

    await cancelQueue(lcu);

    expect(lcu.delete).toHaveBeenCalledWith('/lol-lobby/v2/lobby/matchmaking/search');
  });
});
