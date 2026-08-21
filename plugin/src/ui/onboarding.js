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
