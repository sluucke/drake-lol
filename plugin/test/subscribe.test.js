import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { socketPushAvailable, subscribe } from '../src/subscribe.js';

describe('subscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.socket;
  });

  it('polls the route when no push global is present', async () => {
    const payload = { state: 'InProgress', playerResponse: 'None' };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const handler = vi.fn();

    subscribe('/lol-matchmaking/v1/ready-check', handler, { fetchImpl, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledWith('/lol-matchmaking/v1/ready-check');
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('unsubscribe stops the polling interval', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const handler = vi.fn();

    const unsubscribe = subscribe('/route', handler, { fetchImpl, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('tells the handler the resource is gone when a poll 404s between matches', async () => {


    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const handler = vi.fn();

    subscribe('/route', handler, { fetchImpl, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('does not throw when a poll rejects with a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unreachable'));
    const handler = vi.fn();

    subscribe('/route', handler, { fetchImpl, intervalMs: 1000 });

    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the push mechanism instead of polling when it is present', () => {
    // The loader hands back a subscription to disconnect; there is no
    // unobserve, so relying on one left every observer attached for good.
    const disconnect = vi.fn();
    const observe = vi.fn().mockReturnValue({ disconnect });
    globalThis.socket = { observe };
    const fetchImpl = vi.fn();
    const handler = vi.fn();

    const unsubscribe = subscribe('/route', handler, { fetchImpl });

    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0][0]).toBe('/route');

    const observer = observe.mock.calls[0][1];
    observer({ data: { foo: 'bar' } });
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

    unsubscribe();
    expect(disconnect).toHaveBeenCalled();
  });

  it('detaches by route and listener when no subscription is handed back', () => {
    const observe = vi.fn().mockReturnValue(undefined);
    const disconnect = vi.fn();
    globalThis.socket = { observe, disconnect };
    const handler = vi.fn();

    const unsubscribe = subscribe('/route', handler, { fetchImpl: vi.fn() });
    const observer = observe.mock.calls[0][1];

    unsubscribe();
    expect(disconnect).toHaveBeenCalledWith('/route', observer);
  });

  it('survives a loader that offers no way to detach', () => {
    const observe = vi.fn().mockReturnValue(undefined);
    globalThis.socket = { observe };

    const unsubscribe = subscribe('/route', vi.fn(), { fetchImpl: vi.fn() });
    expect(() => unsubscribe()).not.toThrow();
  });

  it('reports whether the loader gave us a push socket', () => {
    expect(socketPushAvailable()).toBe(false);
    globalThis.socket = { observe: vi.fn() };
    expect(socketPushAvailable()).toBe(true);
  });

  it('tells the handler the resource is gone on a delete event', () => {
    const observe = vi.fn();
    globalThis.socket = { observe };
    const handler = vi.fn();

    subscribe('/lol-champ-select/v1/session', handler, { fetchImpl: vi.fn() });
    const observer = observe.mock.calls[0][1];
    observer({ eventType: 'Delete', data: { myTeam: [{ cellId: 0 }] } });
    expect(handler).toHaveBeenCalledWith(null);
  });
});
