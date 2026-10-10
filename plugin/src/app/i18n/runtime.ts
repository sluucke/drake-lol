export const DEFAULT_LOCALE = 'en_US';

const TAG = '[Drake]';

export type LocaleNode = string | readonly LocaleNode[] | LocaleDict;

export interface LocaleDict {
  [key: string]: LocaleNode;
}

export type LocaleDicts = Readonly<Record<string, LocaleDict>>;

export type TranslateVars = Readonly<Record<string, string | number | null | undefined>>;

export type Translate = (key: string, vars?: TranslateVars) => string;

export type WarnFn = (...args: unknown[]) => void;

export interface TranslatorOptions {
  warn?: WarnFn;
}

export function toLanguageTag(locale: string | null | undefined): string {
  return String(locale || DEFAULT_LOCALE).replace('_', '-');
}

function languageOf(locale: string): string {
  return String(locale).split('_')[0].toLowerCase();
}

export function resolveLocale(raw: string | null | undefined, available: readonly string[]): string {
  const wanted = String(raw || '').replace('-', '_');
  if (!wanted) return DEFAULT_LOCALE;
  if (available.includes(wanted)) return wanted;
  const lang = languageOf(wanted);
  return available.find((locale) => languageOf(locale) === lang) || DEFAULT_LOCALE;
}

export function pickLocale(
  preference: string | null | undefined,
  clientLocale: string | null | undefined,
  available: readonly string[],
): string {
  if (preference && preference !== 'auto' && available.includes(preference)) return preference;
  return clientLocale || DEFAULT_LOCALE;
}

function lookup(dict: LocaleDict, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
  return typeof value === 'string' ? value : undefined;
}

function interpolate(text: string, vars: TranslateVars | undefined): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (vars[name] == null ? match : String(vars[name])));
}

function pluralRules(locale: string): Intl.PluralRules {
  try {
    return new Intl.PluralRules(toLanguageTag(locale));
  } catch {
    return new Intl.PluralRules('en-US');
  }
}

export function createTranslator(locale: string, dicts: LocaleDicts, { warn = console.warn }: TranslatorOptions = {}): Translate {
  const primary: LocaleDict = dicts[locale] || {};
  const fallback: LocaleDict = dicts[DEFAULT_LOCALE] || {};
  const rules = pluralRules(locale);
  const warned = new Set<string>();

  function report(key: string) {
    if (warned.has(key)) return;
    warned.add(key);
    warn(TAG, `missing translation "${key}" for ${locale}`);
  }

  function find(key: string): string | undefined {
    const own = lookup(primary, key);
    if (own !== undefined) return own;
    const base = lookup(fallback, key);
    if (base !== undefined && primary !== fallback) report(key);
    return base;
  }

  function pick(key: string, vars: TranslateVars | undefined): string | undefined {
    if (vars && typeof vars.count === 'number') {
      for (const candidate of [`${key}.${rules.select(vars.count)}`, `${key}.other`]) {
        const value = find(candidate);
        if (value !== undefined) return value;
      }
    }
    return find(key);
  }

  return function t(key: string, vars?: TranslateVars): string {
    const value = pick(key, vars);
    if (value === undefined) {
      report(key);
      return key;
    }
    return interpolate(value, vars);
  };
}
