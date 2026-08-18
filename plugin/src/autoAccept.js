export const ACCEPT_ROUTE = '/lol-matchmaking/v1/ready-check/accept';
export const DECLINE_ROUTE = '/lol-matchmaking/v1/ready-check/decline';

export function shouldAccept(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}




export function canCancel(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'Accepted';
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

  const cancelPending = () => {
    if (pending !== null) {
      clearTimeoutImpl(pending);
      pending = null;
    }
  };

  const unsubscribe = subscribe('/lol-matchmaking/v1/ready-check', async (payload) => {
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

  return () => {
    cancelPending();
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
