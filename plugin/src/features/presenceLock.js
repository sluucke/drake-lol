import { CHAT_ME } from './presence.js';
import { GAMEFLOW_PHASE_ROUTE } from './dodge.js';
import { readGameflowPhase } from './inGameIdle.js';

export function readAvailability(me) {
  return String(me?.availability || '').trim().toLowerCase();
}

export function readForcedAvailability(settings) {
  return String(settings?.presence_availability || '').trim().toLowerCase();
}

export function presenceNeedsRefresh(me, target) {
  if (!target) return false;
  return readAvailability(me) !== target;
}

export function applyPresenceLock(presence, availability) {
  return presence.setAvailability(availability);
}

export function startPresenceLock({ subscribe, getSettings, presence, lcu }) {
  let refreshing = false;

  async function refreshIfNeeded() {
    if (refreshing) return;
    const target = readForcedAvailability(getSettings());
    if (!target) return;
    let me;
    try {
      me = await lcu.get(CHAT_ME);
    } catch {
      return;
    }
    if (!presenceNeedsRefresh(me, target)) return;
    refreshing = true;
    try {
      await applyPresenceLock(presence, target);
    } finally {
      refreshing = false;
    }
  }

  void refreshIfNeeded();

  const stopChat = subscribe(CHAT_ME, () => {
    void refreshIfNeeded();
  });
  const stopPhase = subscribe(GAMEFLOW_PHASE_ROUTE, (payload) => {
    if (!readGameflowPhase(payload)) return;
    void refreshIfNeeded();
  });

  return () => {
    stopChat();
    stopPhase();
  };
}
