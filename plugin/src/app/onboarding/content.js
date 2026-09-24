export function versionKey(version) {
  return `v${String(version || '').replace(/\./g, '_')}`;
}

function fallback(t, key, source) {
  const value = t(key);
  return value === key ? source : value;
}

export function whatsNewText(t, version, index, item, field) {
  return fallback(t, `whatsNew.${versionKey(version)}.${index}.${field}`, item?.[field] || '');
}

export function tourText(t, index, step, field) {
  return fallback(t, `onboarding.tour.steps.${index}.${field}`, step?.[field] || '');
}
