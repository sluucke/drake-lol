import { describe, expect, it } from 'vitest';
import { countryOf, parsePing, utcDay } from '../src/validate';
import { lastDays } from '../src/stats';

const base = {
  install_id: '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b',
  session_id: 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d',
  app_version: '0.3.25',
  event: 'heartbeat',
  lol_region: 'BR',
  locale: 'pt_BR',
  mode: 'own',
  streaming: 'in-client',
  os_build: '26200',
};

describe('parsePing', () => {
  it('accepts what the Drake tray sends', () => {
    expect(parsePing(base)).toEqual(base);
  });

  it('rejects pings without a valid identity, version or event', () => {
    expect(parsePing({ ...base, install_id: 'nope' })).toBeNull();
    expect(parsePing({ ...base, session_id: undefined })).toBeNull();
    expect(parsePing({ ...base, app_version: 'x'.repeat(40) })).toBeNull();
    expect(parsePing({ ...base, event: 'purchase' })).toBeNull();
    expect(parsePing(null)).toBeNull();
    expect(parsePing('text')).toBeNull();
  });

  it('drops optional fields that do not look right instead of storing them', () => {
    const p = parsePing({ ...base, lol_region: '<script>', locale: 'Portuguese', mode: 'root', os_build: 'abc', streaming: 42 });
    expect(p).toMatchObject({ lol_region: null, locale: null, mode: null, os_build: null, streaming: null });
  });

  it('ignores fields it does not know', () => {
    const p = parsePing({ ...base, summoner_name: 'someone' }) as unknown as Record<string, unknown>;
    expect(p.summoner_name).toBeUndefined();
  });
});

describe('helpers', () => {
  it('keeps only real ISO country codes from Cloudflare', () => {
    expect(countryOf('BR')).toBe('BR');
    expect(countryOf('XX')).toBeNull();
    expect(countryOf('T1')).toBeNull();
    expect(countryOf(undefined)).toBeNull();
  });

  it('builds a 30 day window ending today in UTC', () => {
    const now = Date.UTC(2026, 8, 26, 23, 59) / 1000;
    const days = lastDays(now, 30);
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-09-26');
    expect(days[0]).toBe('2026-08-28');
    expect(utcDay(now)).toBe('2026-09-26');
  });
});
