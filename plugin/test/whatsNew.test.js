import { describe, it, expect } from 'vitest';
import { WHATS_NEW, pickWhatsNew, compareSemver, whatsNewHistory, HISTORY_LIMIT } from '../src/ui/whatsNew.js';

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
    expect(WHATS_NEW[0].version).toBe('0.4.4');
    expect(WHATS_NEW[0].items.length).toBeGreaterThan(0);
  });
});

describe('whatsNewHistory', () => {
  const entries = ['0.5.0', '0.4.3', '0.4.2', '0.4.1', '0.4.0', '0.3.9'].map((version) => ({ version, items: [{ title: version }] }));

  it('lists every version skipped since the last one the player saw', () => {
    const history = whatsNewHistory(entries, '0.4.3', '0.4.0');
    expect(history.kind).toBe('missed');
    expect(history.entries.map((e) => e.version)).toEqual(['0.4.2', '0.4.1']);
  });

  it('falls back to the latest releases before the current one', () => {
    const history = whatsNewHistory(entries, '0.4.3', '0.4.3');
    expect(history.kind).toBe('recent');
    expect(history.entries.map((e) => e.version)).toEqual(['0.4.2', '0.4.1', '0.4.0'].slice(0, HISTORY_LIMIT));
    expect(whatsNewHistory(entries, '0.4.3', '').kind).toBe('recent');
  });

  it('never repeats the current notes or shows unreleased ones', () => {
    const versions = whatsNewHistory(entries, '0.4.3', '0.3.0').entries.map((e) => e.version);
    expect(versions).not.toContain('0.4.3');
    expect(versions).not.toContain('0.5.0');
  });

  it('marks the notes worth repeating', () => {
    const skLol = WHATS_NEW.find((e) => e.version === '0.4.2').items[0];
    expect(skLol.highlight).toBe(true);
  });
});
