import { describe, it, expect } from 'vitest';
import { AVAILABLE_LOCALES, DICTS } from '../../src/app/i18n/locales/index.js';

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

describe('locale dictionaries', () => {
  it('ships en_US and pt_BR', () => {
    expect(AVAILABLE_LOCALES).toEqual(['en_US', 'pt_BR']);
    expect(Object.keys(DICTS).sort()).toEqual(['en_US', 'pt_BR']);
  });

  for (const locale of ['en_US', 'pt_BR']) {
    const flat = flatten(DICTS[locale]);

    it(`${locale} has exactly the en_US keys`, () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort());
    });

    it(`${locale} has only non-empty strings`, () => {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value, key).toBe('string');
        expect(value.trim().length, key).toBeGreaterThan(0);
      }
    });

    it(`${locale} keeps the en_US placeholders`, () => {
      for (const [key, value] of Object.entries(flat)) {
        expect(placeholders(value), key).toEqual(placeholders(base[key]));
      }
    });
  }
});
