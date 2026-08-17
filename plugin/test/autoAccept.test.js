import { describe, it, expect, vi } from 'vitest';
import { shouldAccept, startAutoAccept } from '../src/autoAccept.js';

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
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    startAutoAccept({ enabled: true, lcu, subscribe });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  // NOTE: the brief's version of this test assigned `handler` only inside
  // `subscribe`, then awaited it unconditionally. Since `enabled: false`
  // must short-circuit before `subscribe` is ever called (the strongest
  // form of "does nothing at all" — no listener is even registered), that
  // left `handler` undefined and the test threw regardless of a correct
  // implementation. Rewritten to assert the actual constraint: neither
  // `subscribe` nor `lcu.post` is ever invoked when disabled.
  it('does nothing at all when disabled', () => {
    const lcu = { post: vi.fn() };
    const subscribe = vi.fn();
    startAutoAccept({ enabled: false, lcu, subscribe });
    expect(subscribe).not.toHaveBeenCalled();
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('waits the configured delay before accepting', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    await handler({ state: 'InProgress', playerResponse: 'None' });

    expect(lcu.post).not.toHaveBeenCalled();
    expect(timers[0].ms).toBe(3000);
    timers[0].fn();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });

  it('does not stack timers when the same check reports repeatedly', async () => {
    // The ready-check route emits on every poll tick, so a naive delay would
    // queue one accept per tick and fire a burst of them.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    const timers = [];
    const setTimeoutImpl = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };

    startAutoAccept({ enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    await handler({ state: 'InProgress', playerResponse: 'None' });

    expect(timers).toHaveLength(1);
  });

  it('cancels a pending accept when the check goes away', async () => {
    // The user declined by hand, or the check expired, during our delay.
    // Firing anyway would accept a check the user deliberately dropped.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    const cleared = [];
    const setTimeoutImpl = () => 42;
    const clearTimeoutImpl = (id) => cleared.push(id);

    startAutoAccept({
      enabled: true, delayMs: 3000, lcu, subscribe, setTimeoutImpl, clearTimeoutImpl,
    });
    await handler({ state: 'InProgress', playerResponse: 'None' });
    await handler({ state: 'Invalid', playerResponse: 'None' });

    expect(cleared).toContain(42);
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('accepts immediately when the delay is zero', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };
    let handler;
    const subscribe = (_route, fn) => { handler = fn; return () => {}; };
    const setTimeoutImpl = vi.fn();

    startAutoAccept({ enabled: true, delayMs: 0, lcu, subscribe, setTimeoutImpl });
    await handler({ state: 'InProgress', playerResponse: 'None' });

    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(lcu.post).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check/accept');
  });
});
