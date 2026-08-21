import { describe, it, expect } from 'vitest';
import {
  decideOpenMode,
  markOnboardingPatch,
  markWhatsNewSeenPatch,
  TOUR_STEPS,
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
