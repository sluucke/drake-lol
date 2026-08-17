import { describe, it, expect, vi } from 'vitest';
import { makeDodge, DODGE_ROUTE, DODGE_ATTEMPTS } from '../src/features/dodge.js';

describe('makeDodge', () => {
  it('quits champ select', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };

    const result = await makeDodge({ lcu }).dodge();

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledWith(DODGE_ROUTE);
  });

  it('retries, because the client rejects the call for a moment after a pick', async () => {
    // Carried over from the old app, which retried five times for this exact
    // reason: a single attempt lands on a transient rejection often enough to
    // leave the user stuck in a lobby they meant to leave.
    const lcu = {
      post: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true }),
    };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledTimes(3);
  });

  it('gives up after a bounded number of attempts', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 500 }) };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(result.ok).toBe(false);
    expect(lcu.post).toHaveBeenCalledTimes(DODGE_ATTEMPTS);
    expect(result.reason).toContain('500');
  });

  it('keeps retrying when the call throws outright', async () => {
    const lcu = {
      post: vi
        .fn()
        .mockRejectedValueOnce(new Error('socket hiccup'))
        .mockResolvedValueOnce({ ok: true }),
    };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(result.ok).toBe(true);
    expect(lcu.post).toHaveBeenCalledTimes(2);
  });

  it('reports the failure rather than throwing into the client', async () => {
    const lcu = { post: vi.fn().mockRejectedValue(new Error('client closed')) };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('does not retry a 404, and says what it actually means', async () => {
    // Observed live: pressing Dodge from the Practice Tool returned 404 five
    // times over. There is no champ select to quit there, so retrying is pure
    // delay and "the client refused (404)" tells the user nothing.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 404 }) };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(result.ok).toBe(false);
    expect(lcu.post).toHaveBeenCalledTimes(1);
    expect(result.reason).toMatch(/champ select/i);
  });

  it('does not retry a 400 either', async () => {
    const lcu = { post: vi.fn().mockResolvedValue({ ok: false, status: 400 }) };

    const result = await makeDodge({ lcu, delayMs: 0 }).dodge();

    expect(lcu.post).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it('uses the LCDS quit call the old app used, not the lobby route', async () => {
    // /lol-lobby/v2/lobby/matchmaking/quit-dodge was a guess and 404s.
    const lcu = { post: vi.fn().mockResolvedValue({ ok: true }) };

    await makeDodge({ lcu }).dodge();

    const route = lcu.post.mock.calls[0][0];
    expect(route).toContain('/lol-login/v1/session/invoke');
    expect(route).toContain('teambuilder-draft');
    expect(route).toContain('quitV2');
  });
});
