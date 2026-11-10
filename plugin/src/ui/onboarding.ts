import type { SettingsPatch } from '../settings';

export interface TourStep {
  screen: string;
  title: string;
  body: string;
}

export type OpenMode = 'welcome' | 'whats-new' | 'default';

export interface OpenModeInput {
  onboardingDone: boolean;
  seenVersion?: string | null;
  currentVersion?: string | null;
}

export interface OpenModeState {
  screen: string;
  overlay: 'welcome' | '';
}

export interface OnboardLock {
  busy: boolean;
}

export interface ScreenRef {
  id: string;
}

export interface WhatsNewDismissSteps {
  mark: () => Promise<unknown>;
  go: (screen: string) => unknown;
}

export const TOUR_STEPS: TourStep[] = [
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
    body: 'Set up to two champions per role. Auto pick waits until your lane is assigned.',
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

export function decideOpenMode({ onboardingDone, seenVersion, currentVersion }: OpenModeInput): OpenMode {
  if (!onboardingDone) return 'welcome';
  if (String(seenVersion || '') !== String(currentVersion || '')) return 'whats-new';
  return 'default';
}

export function markOnboardingPatch(currentVersion: string | null | undefined): SettingsPatch {
  return {
    onboarding_done: true,
    whats_new_seen_version: String(currentVersion || ''),
  };
}

export function markWhatsNewSeenPatch(currentVersion: string | null | undefined): SettingsPatch {
  return { whats_new_seen_version: String(currentVersion || '') };
}

export function initialScreenForMode(mode: OpenMode): string {
  if (mode === 'whats-new') return 'whats-new';
  return 'auto-accept';
}

export function applyOpenMode(mode: OpenMode): OpenModeState {
  return {
    screen: initialScreenForMode(mode),
    overlay: mode === 'welcome' ? 'welcome' : '',
  };
}

export function resolveWhatsNewTarget(
  screenId: string | null | undefined,
  screens: readonly ScreenRef[] | null | undefined,
): string | null {
  if (!screenId) return 'auto-accept';
  const ids = (screens || []).map((s) => s.id);
  if (ids.includes(screenId)) return screenId;
  return null;
}

export function nextTourIndex(index: number, total: number): number {
  const next = Number(index) + 1;
  return next < Number(total) ? next : -1;
}

export async function withOnboardLock(lock: OnboardLock, fn: () => unknown): Promise<boolean> {
  if (lock.busy) return false;
  lock.busy = true;
  try {
    await fn();
    return true;
  } finally {
    lock.busy = false;
  }
}

export async function runWhatsNewDismiss(
  target: string | null | undefined,
  screens: readonly ScreenRef[] | null | undefined,
  { mark, go }: WhatsNewDismissSteps,
): Promise<void> {
  await mark();
  const next = resolveWhatsNewTarget(target, screens);
  if (next) await go(next);
}
