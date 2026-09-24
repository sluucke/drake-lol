import { DEFAULT_LOCALE, resolveLocale } from './runtime.js';
import { AVAILABLE_LOCALES } from './locales/index.js';

export async function loadLocale(lcu) {
  try {
    const body = await lcu.get('/riotclient/region-locale');
    return resolveLocale(body?.locale, AVAILABLE_LOCALES);
  } catch {
    return DEFAULT_LOCALE;
  }
}
