import { describe, it, expect } from 'vitest';
import {
  deobfuscateChampSelectPuuid,
  obfuscateChampSelectPuuid,
  resolveChampSelectPuuid,
} from '../src/features/champSelectPuuid.js';

const SAMPLE = '01234567-89ab-cdef-0123-456789abcdef';

describe('champSelectPuuid', () => {
  it('round-trips a uuid through obfuscation', () => {
    const obfuscated = obfuscateChampSelectPuuid(SAMPLE);
    expect(deobfuscateChampSelectPuuid(obfuscated)).toBe(SAMPLE);
  });

  it('returns empty for garbage input', () => {
    expect(deobfuscateChampSelectPuuid('not-a-uuid')).toBe('');
    expect(resolveChampSelectPuuid(null)).toBe('');
  });

  it('uses the real puuid when the client exposes it', () => {
    expect(resolveChampSelectPuuid({ puuid: SAMPLE, obfuscatedPuuid: 'other' })).toBe(SAMPLE);
  });

  it('deobfuscates streamer-mode players', () => {
    const obfuscated = obfuscateChampSelectPuuid(SAMPLE);
    expect(
      resolveChampSelectPuuid({
        nameVisibilityType: 'HIDDEN',
        obfuscatedPuuid: obfuscated,
      }),
    ).toBe(SAMPLE);
  });

  it('does not deobfuscate public players without a real puuid', () => {
    const obfuscated = obfuscateChampSelectPuuid(SAMPLE);
    expect(
      resolveChampSelectPuuid({
        nameVisibilityType: 'PUBLIC',
        obfuscatedPuuid: obfuscated,
      }),
    ).toBe('');
  });
});
