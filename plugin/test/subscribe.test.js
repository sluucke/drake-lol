import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribe } from '../src/subscribe.js';

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
    const observe = vi.fn();
    const unobserve = vi.fn();
    globalThis.socket = { observe, unobserve };
    const fetchImpl = vi.fn();
    const handler = vi.fn();

    const unsubscribe = subscribe('/route', handler, { fetchImpl });

    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0][0]).toBe('/route');



    const observer = observe.mock.calls[0][1];
    observer({ data: { foo: 'bar' } });
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

    unsubscribe();
    expect(unobserve).toHaveBeenCalledWith('/route', observer);
  });

  it('tells the handler the resource is gone on a delete event', () => {
    const observe = vi.fn();
    globalThis.socket = { observe, unobserve: vi.fn() };
    const handler = vi.fn();

    subscribe('/lol-champ-select/v1/session', handler, { fetchImpl: vi.fn() });
    const observer = observe.mock.calls[0][1];
    observer({ eventType: 'Delete', data: { myTeam: [{ cellId: 0 }] } });
    expect(handler).toHaveBeenCalledWith(null);
  });
});
