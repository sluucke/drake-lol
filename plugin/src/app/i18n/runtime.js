export const DEFAULT_LOCALE = 'en_US';

const TAG = '[Drake]';

export function toLanguageTag(locale) {
  return String(locale || DEFAULT_LOCALE).replace('_', '-');
}

function languageOf(locale) {
  return String(locale).split('_')[0].toLowerCase();
}

export function resolveLocale(raw, available) {
  const wanted = String(raw || '').replace('-', '_');
  if (!wanted) return DEFAULT_LOCALE;
  if (available.includes(wanted)) return wanted;
  const lang = languageOf(wanted);
  return available.find((locale) => languageOf(locale) === lang) || DEFAULT_LOCALE;
}

function lookup(dict, key) {
  const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);
  return typeof value === 'string' ? value : undefined;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name])));
}

function pluralRules(locale) {
  try {
    return new Intl.PluralRules(toLanguageTag(locale));
  } catch {
    return new Intl.PluralRules('en-US');
  }
}

export function createTranslator(locale, dicts, { warn = console.warn } = {}) {
  const primary = dicts[locale] || {};
  const fallback = dicts[DEFAULT_LOCALE] || {};
  const rules = pluralRules(locale);
  const warned = new Set();

  function report(key) {
    if (warned.has(key)) return;
    warned.add(key);
    warn(TAG, `missing translation "${key}" for ${locale}`);
  }

  function find(key) {
    const own = lookup(primary, key);
    if (own !== undefined) return own;
    const base = lookup(fallback, key);
    if (base !== undefined && primary !== fallback) report(key);
    return base;
  }

  function pick(key, vars) {
    if (vars && typeof vars.count === 'number') {
      for (const candidate of [`${key}.${rules.select(vars.count)}`, `${key}.other`]) {
        const value = find(candidate);
        if (value !== undefined) return value;
      }
    }
    return find(key);
  }

  return function t(key, vars) {
    const value = pick(key, vars);
    if (value === undefined) {
      report(key);
      return key;
    }
    return interpolate(value, vars);
  };
}
