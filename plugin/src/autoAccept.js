export const ACCEPT_ROUTE = '/lol-matchmaking/v1/ready-check/accept';
export const DECLINE_ROUTE = '/lol-matchmaking/v1/ready-check/decline';

export function shouldAccept(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}

/// True while a ready check is on screen and the player has already accepted.
/// That is the only moment a "cancel" is useful: before accepting, the
/// client's own Decline button is right there.
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
  // With auto-accept off we still need the subscription if somebody is
  // listening for ready-check state -- the cancel button depends on it.
  if (!enabled && !onState) return () => {};

  // The route emits on every poll tick while a check is up, so without a
  // guard a delayed accept would queue one timer per tick and fire a burst.
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
      // The check ended, or the player answered it themselves. A timer still
      // in flight would accept something the user deliberately let go.
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
