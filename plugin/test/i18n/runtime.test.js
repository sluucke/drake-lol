import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_LOCALE, createTranslator, resolveLocale, toLanguageTag, pickLocale } from '../../src/app/i18n/runtime.js';

const DICTS = {
  en_US: {
    common: { close: 'Close', hello: 'Hello {name}' },
    time: { seconds: { one: '{count} second', other: '{count} seconds' } },
    only: { en: 'English only' },
  },
  pt_BR: {
    common: { close: 'Fechar', hello: 'Olá {name}' },
    time: { seconds: { one: '{count} segundo', other: '{count} segundos' } },
  },
};

const AVAILABLE = ['en_US', 'pt_BR'];

describe('toLanguageTag', () => {
  it('converts riot locales to BCP 47 tags', () => {
    expect(toLanguageTag('pt_BR')).toBe('pt-BR');
    expect(toLanguageTag('en_US')).toBe('en-US');
  });
});

describe('resolveLocale', () => {
  it('keeps exact matches', () => {
    expect(resolveLocale('pt_BR', AVAILABLE)).toBe('pt_BR');
  });

  it('accepts dashed tags', () => {
    expect(resolveLocale('pt-BR', AVAILABLE)).toBe('pt_BR');
  });

  it('falls back to the same language', () => {
    expect(resolveLocale('pt_PT', AVAILABLE)).toBe('pt_BR');
    expect(resolveLocale('en_GB', AVAILABLE)).toBe('en_US');
  });

  it('falls back to the default locale', () => {
    expect(resolveLocale('ko_KR', AVAILABLE)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('', AVAILABLE)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined, AVAILABLE)).toBe(DEFAULT_LOCALE);
  });
});

describe('createTranslator', () => {
  it('translates and interpolates', () => {
    const t = createTranslator('pt_BR', DICTS, { warn: vi.fn() });
    expect(t('common.close')).toBe('Fechar');
    expect(t('common.hello', { name: 'Ahri' })).toBe('Olá Ahri');
  });

  it('keeps unknown placeholders literal', () => {
    const t = createTranslator('en_US', DICTS, { warn: vi.fn() });
    expect(t('common.hello')).toBe('Hello {name}');
  });

  it('selects plural forms by count', () => {
    const en = createTranslator('en_US', DICTS, { warn: vi.fn() });
    const pt = createTranslator('pt_BR', DICTS, { warn: vi.fn() });
    expect(en('time.seconds', { count: 1 })).toBe('1 second');
    expect(en('time.seconds', { count: 5 })).toBe('5 seconds');
    expect(pt('time.seconds', { count: 1 })).toBe('1 segundo');
    expect(pt('time.seconds', { count: 5 })).toBe('5 segundos');
  });

  it('falls back to en_US and warns once per key', () => {
    const warn = vi.fn();
    const t = createTranslator('pt_BR', DICTS, { warn });
    expect(t('only.en')).toBe('English only');
    expect(t('only.en')).toBe('English only');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns the key when missing everywhere and warns once', () => {
    const warn = vi.fn();
    const t = createTranslator('en_US', DICTS, { warn });
    expect(t('nope.missing')).toBe('nope.missing');
    t('nope.missing');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('uses en_US for locales without a dictionary', () => {
    const t = createTranslator('ko_KR', DICTS, { warn: vi.fn() });
    expect(t('common.close')).toBe('Close');
  });
});

describe('pickLocale', () => {
  const available = ['en_US', 'pt_BR'];

  it('follows the client locale when the preference is auto or missing', () => {
    expect(pickLocale('auto', 'pt_BR', available)).toBe('pt_BR');
    expect(pickLocale(undefined, 'pt_BR', available)).toBe('pt_BR');
  });

  it('lets a supported preference override the client locale', () => {
    expect(pickLocale('en_US', 'pt_BR', available)).toBe('en_US');
    expect(pickLocale('pt_BR', 'en_US', available)).toBe('pt_BR');
  });

  it('ignores a preference that is not shipped', () => {
    expect(pickLocale('ko_KR', 'pt_BR', available)).toBe('pt_BR');
  });
});
