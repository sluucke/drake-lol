import { describe, it, expect } from 'vitest';
import { WHATS_NEW } from '../../src/ui/whatsNew.js';
import { TOUR_STEPS } from '../../src/ui/onboarding.js';
import { DICTS } from '../../src/app/i18n/locales/index.js';
import { createTranslator } from '../../src/app/i18n/runtime.js';
import { tourText, versionKey, whatsNewText } from '../../src/app/onboarding/content.js';

function translators() {
  const warnings = [];
  const warn = (...args) => warnings.push(args.join(' '));
  return {
    en: createTranslator('en_US', DICTS, { warn }),
    pt: createTranslator('pt_BR', DICTS, { warn }),
    warnings,
  };
}

describe('versionKey', () => {
  it('turns versions into key segments', () => {
    expect(versionKey('0.3.25')).toBe('v0_3_25');
  });
});

describe("What's New content", () => {
  it('keeps en_US identical to the source notes', () => {
    const { en, warnings } = translators();
    for (const entry of WHATS_NEW) {
      entry.items.forEach((item, index) => {
        expect(whatsNewText(en, entry.version, index, item, 'title')).toBe(item.title);
        expect(whatsNewText(en, entry.version, index, item, 'body')).toBe(item.body);
      });
    }
    expect(warnings).toEqual([]);
  });

  it('translates every note to pt_BR', () => {
    const { pt, warnings } = translators();
    for (const entry of WHATS_NEW) {
      entry.items.forEach((item, index) => {
        expect(whatsNewText(pt, entry.version, index, item, 'title').length).toBeGreaterThan(0);
        expect(whatsNewText(pt, entry.version, index, item, 'body').length).toBeGreaterThan(0);
      });
    }
    expect(warnings).toEqual([]);
  });

  it('falls back to the source for unknown versions', () => {
    const { en } = translators();
    const item = { title: 'Brand new', body: 'Not translated yet' };
    expect(whatsNewText(en, '9.9.9', 0, item, 'title')).toBe('Brand new');
  });
});

describe('tour content', () => {
  it('keeps en_US identical to the source steps and translates pt_BR', () => {
    const { en, pt, warnings } = translators();
    TOUR_STEPS.forEach((step, index) => {
      expect(tourText(en, index, step, 'title')).toBe(step.title);
      expect(tourText(en, index, step, 'body')).toBe(step.body);
      expect(tourText(pt, index, step, 'title').length).toBeGreaterThan(0);
      expect(tourText(pt, index, step, 'body')).not.toBe(step.body);
    });
    expect(warnings).toEqual([]);
  });
});
