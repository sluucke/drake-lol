import { describe, it, expect } from 'vitest';
import { SCREENS } from '../../src/ui/panel.js';
import { DICTS } from '../../src/app/i18n/locales/index.js';
import { createTranslator } from '../../src/app/i18n/runtime.js';

const REQUIRED = [
  'shell.title',
  'shell.hotkeyHint',
  'shell.close',
  'shell.creditsButton',
  'shell.footer.trayUp',
  'shell.footer.trayDown',
  'shell.credits.title',
  'shell.credits.disclaimer',
  'shell.credits.createdBy',
  'shell.credits.specialThanks',
  'shell.credits.inspiredBy',
  'shell.credits.assets',
  'shell.credits.github',
  ...SCREENS.map((s) => `shell.nav.${s.id}`),
];

describe('shell keys', () => {
  for (const locale of ['en_US', 'pt_BR']) {
    it(`${locale} translates every shell key`, () => {
      const missing = [];
      const t = createTranslator(locale, DICTS, { warn: () => missing.push(locale) });
      for (const key of REQUIRED) expect(t(key), key).not.toBe(key);
      expect(missing).toEqual([]);
    });
  }

  it('keeps the legacy english labels for navigation', () => {
    const t = createTranslator('en_US', DICTS);
    for (const s of SCREENS) expect(t(`shell.nav.${s.id}`)).toBe(s.label);
  });
});
