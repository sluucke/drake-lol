import { describe, it, expect } from 'vitest';
import { AVAILABLE_LOCALES, DICTS } from '../../src/app/i18n/locales/index.js';
import { createTranslator } from '../../src/app/i18n/runtime.js';

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const base = flatten(DICTS.en_US);
const LOCALES = ['en_US', 'pt_BR', 'ru_RU', 'sv_SE', 'tr_TR'];
const PLURAL_CATEGORY = /\.(zero|one|two|few|many|other)$/;

function pluralSibling(key) {
  return PLURAL_CATEGORY.test(key) ? key.replace(PLURAL_CATEGORY, '.other') : null;
}

function isExtraPluralForm(key) {
  const other = pluralSibling(key);
  return other !== null && other in base && !(key in base);
}

describe('locale dictionaries', () => {
  it('ships every supported language', () => {
    expect(AVAILABLE_LOCALES).toEqual(LOCALES);
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALES].sort());
  });

  it('ru_RU uses the Russian plural forms', () => {
    const t = createTranslator('ru_RU', DICTS, { warn: () => {} });
    expect(t('time.seconds', { count: 1 })).toBe('1 секунда');
    expect(t('time.seconds', { count: 3 })).toBe('3 секунды');
    expect(t('time.seconds', { count: 5 })).toBe('5 секунд');
    expect(t('time.seconds', { count: 21 })).toBe('21 секунда');
    expect(t('time.seconds', { count: 1.5 })).toBe('1.5 секунды');
  });

  for (const locale of LOCALES) {
    const flat = flatten(DICTS[locale]);

    it(`${locale} has every en_US key and only adds plural forms of its own`, () => {
      const own = Object.keys(flat).filter((key) => !isExtraPluralForm(key));
      expect(own.sort()).toEqual(Object.keys(base).sort());
    });

    it(`${locale} has only non-empty strings`, () => {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value, key).toBe('string');
        expect(value.trim().length, key).toBeGreaterThan(0);
      }
    });

    it(`${locale} keeps the en_US placeholders`, () => {
      for (const [key, value] of Object.entries(flat)) {
        const source = key in base ? base[key] : base[pluralSibling(key)];
        expect(placeholders(value), key).toEqual(placeholders(source));
      }
    });
  }
});
