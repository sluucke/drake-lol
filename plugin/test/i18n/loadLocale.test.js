import { describe, it, expect, vi } from 'vitest';
import { loadLocale } from '../../src/app/i18n/loadLocale.js';

function lcuReturning(value) {
  return { get: vi.fn(() => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value))) };
}

describe('loadLocale', () => {
  it('reads the client locale', async () => {
    const lcu = lcuReturning({ locale: 'pt_BR', region: 'BR' });
    await expect(loadLocale(lcu)).resolves.toBe('pt_BR');
    expect(lcu.get).toHaveBeenCalledWith('/riotclient/region-locale');
  });

  it('maps unsupported locales to a supported one', async () => {
    await expect(loadLocale(lcuReturning({ locale: 'pt_PT' }))).resolves.toBe('pt_BR');
    await expect(loadLocale(lcuReturning({ locale: 'ja_JP' }))).resolves.toBe('en_US');
  });

  it('defaults to en_US when the request fails or is empty', async () => {
    await expect(loadLocale(lcuReturning(new Error('down')))).resolves.toBe('en_US');
    await expect(loadLocale(lcuReturning(null))).resolves.toBe('en_US');
  });
});
