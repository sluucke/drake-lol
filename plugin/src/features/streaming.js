export function normalizeStreamingMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'on' || v === 'auto') return v;
  return 'off';
}

export function effectiveFrom(setting, toolRunning) {
  const mode = normalizeStreamingMode(setting);
  if (mode === 'on') return 'overlay';
  if (mode === 'auto' && toolRunning) return 'overlay';
  return 'in-client';
}

export function overlayChromePolicy(effective) {
  const overlay = effective === 'overlay';
  return {
    showInClientChrome: !overlay,
    forceRevealOff: overlay,
  };
}
