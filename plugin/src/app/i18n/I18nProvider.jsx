import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, createTranslator, toLanguageTag } from './runtime.js';
import { DICTS } from './locales/index.js';

function makeValue(locale) {
  const tag = toLanguageTag(locale);
  const t = createTranslator(locale, DICTS);
  const number = (value, options) => new Intl.NumberFormat(tag, options).format(value);
  const percent = (ratio, digits = 0) =>
    new Intl.NumberFormat(tag, {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(ratio);
  return { locale, t, format: { number, percent } };
}

const DEFAULT_VALUE = makeValue(DEFAULT_LOCALE);

export const I18nContext = createContext(DEFAULT_VALUE);

export function I18nProvider({ locale = DEFAULT_LOCALE, children }) {
  const value = useMemo(() => (locale === DEFAULT_LOCALE ? DEFAULT_VALUE : makeValue(locale)), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext).t;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}

export function useFormat() {
  return useContext(I18nContext).format;
}
