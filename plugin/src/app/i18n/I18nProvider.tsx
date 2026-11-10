import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, createTranslator, toLanguageTag } from './runtime';
import type { Translate } from './runtime';
import { DICTS } from './locales/index';

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions): string;
  percent(ratio: number, digits?: number): string;
}

export interface I18nValue {
  locale: string;
  t: Translate;
  format: Formatters;
}

export interface I18nProviderProps {
  locale?: string;
  children?: ReactNode;
}

function makeValue(locale: string): I18nValue {
  const tag = toLanguageTag(locale);
  const t = createTranslator(locale, DICTS);
  const number = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, options).format(value);
  const percent = (ratio: number, digits = 0) =>
    new Intl.NumberFormat(tag, {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(ratio);
  return { locale, t, format: { number, percent } };
}

const DEFAULT_VALUE = makeValue(DEFAULT_LOCALE);

export const I18nContext = createContext<I18nValue>(DEFAULT_VALUE);

export function I18nProvider({ locale = DEFAULT_LOCALE, children }: I18nProviderProps) {
  const value = useMemo(() => (locale === DEFAULT_LOCALE ? DEFAULT_VALUE : makeValue(locale)), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useLocale(): string {
  return useContext(I18nContext).locale;
}

export function useFormat(): Formatters {
  return useContext(I18nContext).format;
}
