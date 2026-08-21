export const TOUR_STEPS = [
  {
    screen: 'auto-accept',
    title: 'Auto Accept',
    body: 'Accept ready checks automatically, with an optional delay so you can still decline by hand.',
  },
  {
    screen: 'queue',
    title: 'Queue',
    body: 'Champ-select tools: dodge helpers and optional in-client team reveal.',
  },
  {
    screen: 'auto-pick',
    title: 'Auto Pick & Ban',
    body: 'Hover or instalock your picks, and ban a champion when the phase opens.',
  },
  {
    screen: 'status',
    title: 'Status',
    body: 'Set a long status message and lock Online, Offline, Mobile, or Busy.',
  },
  {
    screen: 'settings',
    title: 'Settings',
    body: 'Startup, updates, and client reload live here.',
  },
];

export function decideOpenMode({ onboardingDone, seenVersion, currentVersion }) {
  if (!onboardingDone) return 'welcome';
  if (String(seenVersion || '') !== String(currentVersion || '')) return 'whats-new';
  return 'default';
}

export function markOnboardingPatch(currentVersion) {
  return {
    onboarding_done: true,
    whats_new_seen_version: String(currentVersion || ''),
  };
}

export function markWhatsNewSeenPatch(currentVersion) {
  return { whats_new_seen_version: String(currentVersion || '') };
}

export function initialScreenForMode(mode) {
  if (mode === 'whats-new') return 'whats-new';
  return 'auto-accept';
}

export function applyOpenMode(mode) {
  return {
    screen: initialScreenForMode(mode),
    overlay: mode === 'welcome' ? 'welcome' : '',
  };
}

export function resolveWhatsNewTarget(screenId, screens) {
  if (!screenId) return 'auto-accept';
  const ids = (screens || []).map((s) => s.id);
  if (ids.includes(screenId)) return screenId;
  return null;
}

export function nextTourIndex(index, total) {
  const next = Number(index) + 1;
  return next < Number(total) ? next : -1;
}

export async function withOnboardLock(lock, fn) {
  if (lock.busy) return false;
  lock.busy = true;
  try {
    await fn();
    return true;
  } finally {
    lock.busy = false;
  }
}

export async function runWhatsNewDismiss(target, screens, { mark, go }) {
  await mark();
  const next = resolveWhatsNewTarget(target, screens);
  if (next) await go(next);
}
