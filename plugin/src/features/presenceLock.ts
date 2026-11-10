import type { Lcu } from '../lcu';
import type { SettingsValues } from '../settings';
import type { SubscribeFn, Unsubscribe } from '../subscribe';
import { CHAT_ME } from './presence';
import type { ActionResult, ChatMeResponse, Presence } from './presence';
import { GAMEFLOW_PHASE_ROUTE } from './dodge';
import { readGameflowPhase } from './inGameIdle';

export function readAvailability(me: ChatMeResponse | null | undefined): string {
  return String(me?.availability || '').trim().toLowerCase();
}

export function readForcedAvailability(settings: SettingsValues | null | undefined): string {
  return String(settings?.presence_availability || '').trim().toLowerCase();
}

export function presenceNeedsRefresh(me: ChatMeResponse | null | undefined, target: string): boolean {
  if (!target) return false;
  return readAvailability(me) !== target;
}

export function applyPresenceLock(
  presence: Pick<Presence, 'setAvailability'>,
  availability: string,
): Promise<ActionResult> {
  return presence.setAvailability(availability);
}

export function startPresenceLock({
  subscribe,
  getSettings,
  presence,
  lcu,
}: {
  subscribe: SubscribeFn;
  getSettings: () => SettingsValues | null | undefined;
  presence: Pick<Presence, 'setAvailability'>;
  lcu: Pick<Lcu, 'get'>;
}): Unsubscribe {
  let refreshing = false;

  async function refreshIfNeeded() {
    if (refreshing) return;
    const target = readForcedAvailability(getSettings());
    if (!target) return;
    let me: ChatMeResponse | null;
    try {
      me = await lcu.get<ChatMeResponse | null>(CHAT_ME);
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
