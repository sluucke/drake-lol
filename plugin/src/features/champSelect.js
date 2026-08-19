export const SESSION_ROUTE = '/lol-champ-select/v1/session';

export function actionRoute(actionId) {
  return `/lol-champ-select/v1/session/actions/${actionId}`;
}

export function actionCompleteRoute(actionId) {
  return `/lol-champ-select/v1/session/actions/${actionId}/complete`;
}

function eachAction(session) {
  const phases = (session && session.actions) || [];
  return phases.flat ? phases.flat() : [].concat(...phases);
}

export function findMyQueuedAction(session, type) {
  if (!session || session.localPlayerCellId === undefined) return null;
  for (const a of eachAction(session)) {
    if (a.type !== type) continue;
    if (a.actorCellId !== session.localPlayerCellId) continue;
    if (a.completed) continue;
    return a;
  }
  return null;
}

export function findMyAction(session, type) {
  const action = findMyQueuedAction(session, type);
  if (!action || !action.isInProgress) return null;
  return action;
}

/// Outside champ select the endpoint answers 404 with a JSON error body, so a
/// non-null payload is not on its own proof of a live champ select.
export function isChampSelectSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
  if (session.errorCode || session.httpStatus) return false;
  if (Array.isArray(session.actions) || Array.isArray(session.myTeam)) return true;
  return typeof session.localPlayerCellId === 'number';
}

export function isBanPhase(session) {
  return eachAction(session).some((a) => a.type === 'ban' && a.isInProgress && !a.completed);
}

export function isPlanningPhase(session) {
  return String(session?.timer?.phase || '') === 'PLANNING';
}

export function unavailableChampionIds(session) {
  const ids = new Set();
  if (!session) return ids;
  const bans = session.bans || {};
  for (const id of bans.myTeamBans || []) if (id) ids.add(id);
  for (const id of bans.theirTeamBans || []) if (id) ids.add(id);
  for (const a of eachAction(session)) {
    if (a.completed && a.championId) ids.add(a.championId);
  }
  return ids;
}

function accepted(res) {
  if (!res) return false;
  if (typeof res.ok === 'boolean') return res.ok;
  return res.ok !== false;
}

function statusOf(res) {
  return res && res.status !== undefined ? res.status : 0;
}

export function makeChampSelect({ lcu }) {
  return {
    async getSession() {
      const session = await lcu.get(SESSION_ROUTE);
      return isChampSelectSession(session) ? session : null;
    },

    async commit(actionId, championId, completed, type = 'pick') {
      try {
        const pick = await lcu.patch(actionRoute(actionId), { championId });
        const hoverStatus = statusOf(pick);
        if (!accepted(pick)) {
          return { ok: false, hoverStatus, reason: `the client refused it (${hoverStatus})` };
        }
        if (!completed) return { ok: true, hoverStatus };

        const done = await lcu.post(actionCompleteRoute(actionId));
        const completeStatus = statusOf(done);
        if (!accepted(done)) {
          const what = type === 'ban' ? 'ban' : 'lock';
          return {
            ok: false,
            retry: true,
            hoverStatus,
            completeStatus,
            reason: `the client would not ${what} it (${completeStatus})`,
          };
        }
        return { ok: true, hoverStatus, completeStatus };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
