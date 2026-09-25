import { describe, it, expect } from 'vitest';
import {
  normalizeStreamingMode,
  effectiveFrom,
  overlayChromePolicy,
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
