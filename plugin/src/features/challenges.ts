import type { Lcu } from '../lcu';
import { CHAT_ME, readLol } from './presence';
import type { ActionResult, ChatMeResponse } from './presence';

export interface ChallengePayload {
  lol?: ChallengePayload | string | null;
  challengeTokensSelected?: string;
  preferences?: { challengeIds?: unknown } | null;
  playerPreferences?: { challengeIds?: unknown } | null;
  challengeIds?: unknown;
}

export interface Challenges {
  removeBadges(): Promise<ActionResult>;
  cloneFirstBadge(): Promise<ActionResult>;
}

export const CHALLENGE_PREFS_ROUTE = '/lol-challenges/v1/update-player-preferences';
export const CHALLENGE_CLIENT_STATE_ROUTE = '/lol-challenges/v1/client-state';
export const CHALLENGE_SUMMARY_ROUTE = '/lol-challenges/v1/summary-player-data/local-player';

const READ_ROUTES = [CHALLENGE_CLIENT_STATE_ROUTE, CHAT_ME, CHALLENGE_SUMMARY_ROUTE];

export function readChallengeIdSlots(payload: ChallengePayload | null | undefined): number[] {
  if (!payload) return [];

  const lol = payload?.lol ?? (payload?.challengeTokensSelected !== undefined ? payload : null);
  const tokenStr =
    (typeof lol === 'object' && lol ? lol.challengeTokensSelected : undefined) ??
    payload?.challengeTokensSelected;
  if (typeof tokenStr === 'string' && tokenStr.trim()) {
    return tokenStr.split(',').map((part) => Number(part.trim()) || 0);
  }

  const ids =
    payload?.preferences?.challengeIds ??
    payload?.playerPreferences?.challengeIds ??
    payload?.challengeIds ??
    [];
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => {
    const num = Number(id);
    return Number.isFinite(num) ? num : 0;
  });
}

export function readFirstSlotChallengeId(payload: ChallengePayload | null | undefined): number {
  const first = readChallengeIdSlots(payload)[0];
  return first > 0 ? first : 0;
}

export function readEquippedChallengeIds(payload: ChallengePayload | null | undefined): number[] {
  return readChallengeIdSlots(payload).filter((id) => id > 0);
}

function accepted(res: Response | null | undefined): boolean {
  return !res || res.ok !== false;
}

export function makeChallenges({ lcu }: { lcu: Pick<Lcu, 'get' | 'post'> }): Challenges {
  async function writeIds(ids: number[]): Promise<ActionResult> {
    try {
      const res = await lcu.post(CHALLENGE_PREFS_ROUTE, { challengeIds: ids });
      if (!accepted(res)) {
        return { ok: false, reason: `the client refused it (${res.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
    }
  }

  async function readFirstBadgeId(): Promise<number> {
    for (const route of READ_ROUTES) {
      try {
        const raw = await lcu.get<unknown>(route);
        const payload: ChallengePayload | null =
          route === CHAT_ME ? readLol(raw as ChatMeResponse | null) : (raw as ChallengePayload | null);
        const first = readFirstSlotChallengeId(payload);
        if (first) return first;
      } catch {
      }
    }
    return 0;
  }

  return {
    removeBadges() {
      return writeIds([]);
    },

    async cloneFirstBadge() {
      try {
        const first = await readFirstBadgeId();
        if (!first) return { ok: false, reason: 'no badge equipped in the first slot' };
        return writeIds([first, first, first]);
      } catch (e) {
        return { ok: false, reason: `could not read your badges (${(e as Error).message})` };
      }
    },
  };
}
