import { describe, it, expect } from 'vitest';
import {
  normalizeStreamingMode,
  effectiveFrom,
  overlayChromePolicy,
  appliedEffective,
  createTrayHealth,
} from '../src/features/streaming.js';

describe('normalizeStreamingMode', () => {
  it('keeps on and auto', () => {
    expect(normalizeStreamingMode('ON')).toBe('on');
    expect(normalizeStreamingMode('auto')).toBe('auto');
  });

  it('falls back to off', () => {
    expect(normalizeStreamingMode('')).toBe('off');
    expect(normalizeStreamingMode('nope')).toBe('off');
  });
});

describe('effectiveFrom', () => {
  it('maps setting and process scan', () => {
    expect(effectiveFrom('off', true)).toBe('in-client');
    expect(effectiveFrom('on', false)).toBe('overlay');
    expect(effectiveFrom('auto', true)).toBe('overlay');
    expect(effectiveFrom('auto', false)).toBe('in-client');
  });
});

describe('overlayChromePolicy', () => {
  it('hides in-client chrome and forces reveal off in overlay', () => {
    expect(overlayChromePolicy('overlay')).toEqual({
      showInClientChrome: false,
      forceRevealOff: true,
    });
    expect(overlayChromePolicy('in-client')).toEqual({
      showInClientChrome: true,
      forceRevealOff: false,
    });
  });
});

describe('appliedEffective', () => {
  it('fails open to the client when the tray stops answering', () => {
    expect(appliedEffective('overlay', true)).toBe('overlay');
    expect(appliedEffective('overlay', false)).toBe('in-client');
    expect(appliedEffective('in-client', false)).toBe('in-client');
  });
});

describe('createTrayHealth', () => {
  it('turns unreachable after consecutive failures and recovers on success', () => {
    const health = createTrayHealth({ threshold: 3 });
    expect(health.reachable()).toBe(true);
    health.record(false);
    health.record(false);
    expect(health.reachable()).toBe(true);
    health.record(false);
    expect(health.reachable()).toBe(false);
    health.record(true);
    expect(health.reachable()).toBe(true);
  });
});
