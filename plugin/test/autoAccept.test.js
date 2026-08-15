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
});
