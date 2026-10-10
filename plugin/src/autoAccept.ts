import { GAMEFLOW_PHASE_ROUTE } from './features/dodge';
import { isReadyCheckPhase, readGameflowPhase } from './features/inGameIdle';

import type { Lcu } from './lcu';
import type { SubscribeFn, Unsubscribe } from './subscribe';

export interface ReadyCheckPayload {
  state?: string;
  playerResponse?: string;
  timer?: number;
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface AutoAcceptOptions {
  enabled: boolean;
  delayMs?: number;
  lcu: Pick<Lcu, 'post'>;
  subscribe: SubscribeFn;
  setTimeoutImpl?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeoutImpl?: (id: TimerHandle) => void;
  onState?: ((payload: ReadyCheckPayload | null) => void) | null;
}

export const ACCEPT_ROUTE = '/lol-matchmaking/v1/ready-check/accept';
export const DECLINE_ROUTE = '/lol-matchmaking/v1/ready-check/decline';
export const CANCEL_SEARCH_ROUTE = '/lol-lobby/v2/lobby/matchmaking/search';

export function shouldAccept(payload: ReadyCheckPayload | null | undefined): boolean {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}

export function canCancel(payload: ReadyCheckPayload | null | undefined): boolean {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'Accepted';
}

export async function cancelQueue(lcu: Pick<Lcu, 'post' | 'delete'>): Promise<void> {
  try {
    await lcu.post(DECLINE_ROUTE);
  } catch {}
  await lcu.delete(CANCEL_SEARCH_ROUTE);
}

export function startAutoAccept({
  enabled,
  delayMs = 0,
  lcu,
  subscribe,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onState,
}: AutoAcceptOptions): Unsubscribe {
  if (!enabled && !onState) return () => {};

  let pending: TimerHandle | null = null;
  let unsubscribeReadyCheck: Unsubscribe | null = null;

  const cancelPending = () => {
    if (pending !== null) {
      clearTimeoutImpl(pending);
      pending = null;
    }
  };

  const stopReadyCheck = () => {
    cancelPending();
    if (typeof unsubscribeReadyCheck === 'function') {
      unsubscribeReadyCheck();
      unsubscribeReadyCheck = null;
    }
  };

  const startReadyCheck = () => {
    if (unsubscribeReadyCheck) return;
    unsubscribeReadyCheck = subscribe<ReadyCheckPayload>('/lol-matchmaking/v1/ready-check', async (payload) => {
      if (onState) onState(payload);

      if (!shouldAccept(payload)) {
        cancelPending();
        return;
      }

      if (!enabled || pending !== null) return;

      if (delayMs > 0) {
        pending = setTimeoutImpl(() => {
          pending = null;
          lcu.post(ACCEPT_ROUTE);
        }, delayMs);
        return;
      }

      await lcu.post(ACCEPT_ROUTE);
    });
  };

  const unsubscribePhase = subscribe(GAMEFLOW_PHASE_ROUTE, (payload) => {
    const phase = readGameflowPhase(payload);
    if (isReadyCheckPhase(phase)) {
      startReadyCheck();
    } else {
      if (unsubscribeReadyCheck) {
        if (onState) onState(null);
        stopReadyCheck();
      }
    }
  });

  return () => {
    stopReadyCheck();
    if (typeof unsubscribePhase === 'function') unsubscribePhase();
  };
}
