import { GAMEFLOW_PHASE_ROUTE } from './features/dodge.js';
import { isReadyCheckPhase, readGameflowPhase } from './features/inGameIdle.js';

export const ACCEPT_ROUTE = '/lol-matchmaking/v1/ready-check/accept';
export const DECLINE_ROUTE = '/lol-matchmaking/v1/ready-check/decline';
export const CANCEL_SEARCH_ROUTE = '/lol-lobby/v2/lobby/matchmaking/search';

export function shouldAccept(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}

export function canCancel(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'Accepted';
}

export async function cancelQueue(lcu) {
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
}) {
  if (!enabled && !onState) return () => {};

  let pending = null;
  let unsubscribeReadyCheck = null;

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
    unsubscribeReadyCheck = subscribe('/lol-matchmaking/v1/ready-check', async (payload) => {
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
