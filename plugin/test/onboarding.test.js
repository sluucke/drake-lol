import { describe, it, expect } from 'vitest';
import {
  decideOpenMode,
  markOnboardingPatch,
  markWhatsNewSeenPatch,
  TOUR_STEPS,
  initialScreenForMode,
  applyOpenMode,
  resolveWhatsNewTarget,
  nextTourIndex,
  withOnboardLock,
  runWhatsNewDismiss,
} from '../src/ui/onboarding.js';

describe('decideOpenMode', () => {
  it('shows welcome when onboarding is not done', () => {
    expect(
      decideOpenMode({ onboardingDone: false, seenVersion: '', currentVersion: '0.3.16' }),
    ).toBe('welcome');
  });

  it("shows what's new when versions differ", () => {
    expect(
      decideOpenMode({
        onboardingDone: true,
        seenVersion: '0.3.15',
        currentVersion: '0.3.16',
      }),
    ).toBe('whats-new');
  });

  it('defaults when caught up', () => {
    expect(
      decideOpenMode({
        onboardingDone: true,
        seenVersion: '0.3.16',
        currentVersion: '0.3.16',
      }),
    ).toBe('default');
  });

  it("prefers welcome over what's new", () => {
    expect(
      decideOpenMode({
        onboardingDone: false,
        seenVersion: '0.3.15',
        currentVersion: '0.3.16',
      }),
    ).toBe('welcome');
  });
});

describe('mark patches', () => {
  it('marks onboarding complete and catches up the version', () => {
    expect(markOnboardingPatch('0.3.16')).toEqual({
      onboarding_done: true,
      whats_new_seen_version: '0.3.16',
    });
  });

  it("marks what's new seen", () => {
    expect(markWhatsNewSeenPatch('0.3.16')).toEqual({
      whats_new_seen_version: '0.3.16',
    });
  });
});

describe('TOUR_STEPS', () => {
  it('covers core nav screens', () => {
    const ids = TOUR_STEPS.map((s) => s.screen);
    expect(ids).toContain('auto-accept');
    expect(ids).toContain('queue');
    expect(ids).toContain('settings');
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('initialScreenForMode', () => {
  it("opens what's new screen for that mode", () => {
    expect(initialScreenForMode('whats-new')).toBe('whats-new');
  });
  it('uses auto-accept otherwise', () => {
    expect(initialScreenForMode('welcome')).toBe('auto-accept');
    expect(initialScreenForMode('default')).toBe('auto-accept');
  });
});

describe('applyOpenMode', () => {
  it('shows the welcome overlay only for welcome mode', () => {
    expect(applyOpenMode('welcome')).toEqual({ screen: 'auto-accept', overlay: 'welcome' });
  });
  it("opens what's new with no overlay", () => {
    expect(applyOpenMode('whats-new')).toEqual({ screen: 'whats-new', overlay: '' });
  });
  it('opens auto-accept with no overlay when caught up', () => {
    expect(applyOpenMode('default')).toEqual({ screen: 'auto-accept', overlay: '' });
  });
});

describe('resolveWhatsNewTarget', () => {
  const screens = [{ id: 'queue' }, { id: 'auto-accept' }];

  it('navigates when the screen is known', () => {
    expect(resolveWhatsNewTarget('queue', screens)).toBe('queue');
  });
  it('lands on auto-accept when dismissing without a screen', () => {
    expect(resolveWhatsNewTarget('', screens)).toBe('auto-accept');
    expect(resolveWhatsNewTarget(undefined, screens)).toBe('auto-accept');
  });
  it('stays put when the screen is unknown', () => {
    expect(resolveWhatsNewTarget('not-a-screen', screens)).toBeNull();
  });
});

describe('nextTourIndex', () => {
  it('advances within the tour', () => {
    expect(nextTourIndex(0, 5)).toBe(1);
  });
  it('ends after the last step', () => {
    expect(nextTourIndex(4, 5)).toBe(-1);
  });
});

describe('withOnboardLock', () => {
  it('skips a second action while the first is in flight', async () => {
    const lock = { busy: false };
    let started = 0;
    let finished = 0;
    let release;
    const first = withOnboardLock(lock, async () => {
      started += 1;
      await new Promise((resolve) => {
        release = resolve;
      });
      finished += 1;
    });
    const second = withOnboardLock(lock, async () => {
      started += 1;
      finished += 1;
    });
    expect(started).toBe(1);
    expect(await second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(started).toBe(1);
    expect(finished).toBe(1);
  });

  it('releases the lock after the action throws', async () => {
    const lock = { busy: false };
    await expect(
      withOnboardLock(lock, async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(lock.busy).toBe(false);
    expect(await withOnboardLock(lock, async () => {})).toBe(true);
  });
});

describe('runWhatsNewDismiss', () => {
  it('marks seen before navigating', async () => {
    const order = [];
    await runWhatsNewDismiss('queue', [{ id: 'queue' }], {
      mark: async () => {
        order.push('mark');
      },
      go: async (screen) => {
        order.push(screen);
      },
    });
    expect(order).toEqual(['mark', 'queue']);
  });

  it('marks seen even when the jump target is unknown', async () => {
    const order = [];
    await runWhatsNewDismiss('missing', [{ id: 'queue' }], {
      mark: async () => {
        order.push('mark');
      },
      go: async (screen) => {
        order.push(screen);
      },
    });
    expect(order).toEqual(['mark']);
  });
});
