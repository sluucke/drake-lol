import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SESSION_ROUTE } from '../src/features/champSelect.js';
import {
  makeDodge,
  lcdsDodgeRoute,
  LCDS_DODGE_BODY,
  LCDS_DODGE_BODY_LEGACY,
  GAMEFLOW_DODGE_ROUTE,
  GAMEFLOW_PHASE_ROUTE,
  GAMEFLOW_SESSION_ROUTE,
  DODGE_ATTEMPTS,
  DODGE_VERIFY_DELAY_MS,
  withTimeout,
  hasChampSelectSession,
  waitForChampSelectExit,
  leftChampSelect,
  postAccepted,
  postLcdsDodge,
  buildGameflowDodgeBody,
  dodgeSteps,
} from '../src/features/dodge.js';

function response({ ok = true, status = 200, text = '', json = null } = {}) {
  return {
    ok,
    status,
    text: async () => text,
    json: async () => json,
  };
}

describe('buildGameflowDodgeBody', () => {
  it('maps gameflow session fields into the dodge payload', () => {
    expect(
      buildGameflowDodgeBody({
        phase: 'ChampSelect',
        gameDodge: { state: 'Invalid', dodgeIds: [1], phase: 'ChampSelect' },
      }),
    ).toEqual({
      dodgeData: { state: 'Invalid', dodgeIds: [1], phase: 'ChampSelect' },
      state: 'Invalid',
      dodgeIds: [1],
      phase: 'ChampSelect',
    });
  });

  it('returns null when gameDodge is missing', () => {
    expect(buildGameflowDodgeBody({ phase: 'ChampSelect' })).toBeNull();
  });
});

describe('postLcdsDodge', () => {
  it('posts the invoke route with the lcds body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response());
    await postLcdsDodge(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(lcdsDodgeRoute(), {
      method: 'POST',
      body: JSON.stringify(LCDS_DODGE_BODY),
    });
    expect(LCDS_DODGE_BODY[3]).toBe('{}');
  });
});

describe('leftChampSelect', () => {
  it('requires both session exit and a non-champ-select phase', async () => {
    const fetchImpl = vi.fn(async (route) => {
      if (route === SESSION_ROUTE) return response({ ok: false, status: 404 });
      if (route === GAMEFLOW_PHASE_ROUTE) return response({ json: 'Lobby' });
      return response();
    });
    await expect(leftChampSelect(fetchImpl)).resolves.toBe(true);
  });
});

describe('dodgeSteps', () => {
  it('tries lcds, gameflow, then legacy lcds', () => {
    expect(dodgeSteps(fetch).map((step) => step.name)).toEqual(['lcds', 'gameflow', 'lcds-legacy']);
  });
});

describe('makeDodge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function exitAfterDodge(fetchImpl) {
    let checks = 0;
    return vi.fn(async (route) => {
      if (route === SESSION_ROUTE) {
        checks += 1;
        return response({ ok: checks < 2, status: checks < 2 ? 200 : 404 });
      }
      if (route === GAMEFLOW_PHASE_ROUTE) {
        return response({ json: checks < 2 ? 'ChampSelect' : 'Lobby' });
      }
      if (route === GAMEFLOW_SESSION_ROUTE) {
        return response({
          json: { phase: 'ChampSelect', gameDodge: { state: 'Invalid', dodgeIds: [] } },
        });
      }
      return response();
    });
  }

  it('succeeds only after champ select ends', async () => {
    const fetchImpl = exitAfterDodge(vi.fn());

    const pending = makeDodge({
      fetchImpl,
      attempts: 1,
      delayMs: 0,
      onStatus: () => {},
    }).dodge();

    await vi.advanceTimersByTimeAsync(DODGE_VERIFY_DELAY_MS + 1200);
    await expect(pending).resolves.toEqual({
      ok: true,
      detail: 'left on attempt 1',
    });
  });

  it('falls back to legacy lcds and gameflow when needed', async () => {
    const fetchImpl = exitAfterDodge(vi.fn());

    const pending = makeDodge({
      fetchImpl,
      attempts: 1,
      delayMs: 0,
      onStatus: () => {},
    }).dodge();

    await vi.advanceTimersByTimeAsync(DODGE_VERIFY_DELAY_MS + 1200);
    await pending;

    expect(fetchImpl).toHaveBeenCalledWith(lcdsDodgeRoute(), expect.any(Object));
    expect(fetchImpl).toHaveBeenCalledWith(GAMEFLOW_DODGE_ROUTE, expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('dodgeData'),
    }));
    expect(fetchImpl).toHaveBeenCalledWith(lcdsDodgeRoute(LCDS_DODGE_BODY_LEGACY), expect.any(Object));
  });

  it('retries when practice-style exits are slow', async () => {
    let posts = 0;
    const fetchImpl = vi.fn(async (route) => {
      if (route.startsWith('/lol-login/v1/session/invoke')) {
        posts += 1;
        return response();
      }
      if (route === SESSION_ROUTE) {
        return response({ ok: posts < 3, status: posts < 3 ? 200 : 404 });
      }
      if (route === GAMEFLOW_PHASE_ROUTE) {
        return response({ json: posts < 3 ? 'ChampSelect' : 'Lobby' });
      }
      return response();
    });

    const pending = makeDodge({
      fetchImpl,
      steps: [{ name: 'lcds', run: () => postLcdsDodge(fetchImpl) }],
      attempts: 5,
      delayMs: 0,
      onStatus: () => {},
    }).dodge();

    await vi.advanceTimersByTimeAsync(15000);
    await expect(pending).resolves.toEqual({
      ok: true,
      detail: 'left on attempt 3',
    });
  }, 10000);
});

describe('withTimeout', () => {
  it('rejects when the promise takes too long', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 500, 'slow');
    const settled = pending.catch((e) => e.message);
    await vi.advanceTimersByTimeAsync(500);
    await expect(settled).resolves.toBe('slow');
    vi.useRealTimers();
  });
});

describe('postAccepted', () => {
  it('accepts a missing or successful response', () => {
    expect(postAccepted(undefined)).toBe(true);
    expect(postAccepted(response())).toBe(true);
    expect(postAccepted(response({ ok: false, status: 500 }))).toBe(false);
  });
});

describe('hasChampSelectSession', () => {
  it('returns true while the session route responds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response());
    expect(await hasChampSelectSession(fetchImpl)).toBe(true);
  });
});

describe('waitForChampSelectExit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for stable exit reads', async () => {
    let checks = 0;
    const fetchImpl = vi.fn(async (route) => {
      if (route === SESSION_ROUTE) {
        checks += 1;
        return response({ ok: checks < 3, status: checks < 3 ? 200 : 404 });
      }
      if (route === GAMEFLOW_PHASE_ROUTE) {
        return response({ json: checks < 3 ? 'ChampSelect' : 'Lobby' });
      }
      return response();
    });

    const pending = waitForChampSelectExit(fetchImpl, { attempts: 6, delayMs: 100, stableReads: 2 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(true);
  });
});
