import { describe, it, expect } from 'vitest';
import { WHATS_NEW, pickWhatsNew, compareSemver } from '../src/ui/whatsNew.js';

describe('compareSemver', () => {
  it('orders dotted versions', () => {
    expect(compareSemver('0.3.14', '0.3.15')).toBeLessThan(0);
    expect(compareSemver('0.3.15', '0.3.15')).toBe(0);
    expect(compareSemver('0.4.0', '0.3.15')).toBeGreaterThan(0);
  });
});

describe('pickWhatsNew', () => {
  const entries = [
    { version: '0.3.16', items: [{ title: 'A', body: 'a', screen: 'queue' }] },
    { version: '0.3.15', items: [{ title: 'B', body: 'b' }] },
  ];

  it('returns the exact version entry when present', () => {
    expect(pickWhatsNew(entries, '0.3.15').version).toBe('0.3.15');
  });

  it('falls back to the newest entry with version <= current', () => {
    expect(pickWhatsNew(entries, '0.3.17').version).toBe('0.3.16');
  });

  it('returns null when every entry is newer than current', () => {
    expect(pickWhatsNew(entries, '0.1.0')).toBeNull();
  });

  it('ships a non-empty catalog', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    expect(WHATS_NEW[0].version).toBe('0.3.19');
    expect(WHATS_NEW[0].items.length).toBeGreaterThan(0);
  });
});
