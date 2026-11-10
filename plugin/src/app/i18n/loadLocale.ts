import type { Lcu } from '../../lcu';
import { DEFAULT_LOCALE, resolveLocale } from './runtime';
import { AVAILABLE_LOCALES } from './locales/index';

interface RegionLocale {
  locale?: string;
  region?: string;
}

export async function loadLocale(lcu: Pick<Lcu, 'get'>): Promise<string> {
  try {
    const body = await lcu.get<RegionLocale | null>('/riotclient/region-locale');
    return resolveLocale(body?.locale, AVAILABLE_LOCALES);
  } catch {
    return DEFAULT_LOCALE;
  }
}
