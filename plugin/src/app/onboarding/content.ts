import type { Translate } from '../i18n/runtime';

export function versionKey(version: string | null | undefined): string {
  return `v${String(version || '').replace(/\./g, '_')}`;
}

function fallback(t: Translate, key: string, source: string): string {
  const value = t(key);
  return value === key ? source : value;
}

export type ContentFields<F extends string> = Partial<Record<F, string>>;

export function whatsNewText<F extends string>(
  t: Translate,
  version: string | null | undefined,
  index: number,
  item: ContentFields<F> | null | undefined,
  field: F,
): string {
  return fallback(t, `whatsNew.${versionKey(version)}.${index}.${field}`, item?.[field] || '');
}

export function tourText<F extends string>(t: Translate, index: number, step: ContentFields<F> | null | undefined, field: F): string {
  return fallback(t, `onboarding.tour.steps.${index}.${field}`, step?.[field] || '');
}
