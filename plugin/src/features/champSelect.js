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
  if (!res) return true;
  if (typeof res.ok === 'boolean') return res.ok;
  return res.ok !== false;
}

export function makeChampSelect({ lcu }) {
  return {
    async getSession() {
      return lcu.get(SESSION_ROUTE);
    },

    async commit(actionId, championId, completed, type = 'pick') {
      try {
        const pick = await lcu.patch(actionRoute(actionId), { championId });
        if (!accepted(pick)) {
          return { ok: false, reason: `the client refused it (${pick.status})` };
        }
        if (!completed) return { ok: true };

        try {
          await lcu.post(actionCompleteRoute(actionId));
        } catch {
        }

        const locked = await lcu.patch(actionRoute(actionId), { championId, completed: true });
        if (!accepted(locked)) {
          return { ok: false, reason: `the client refused it (${locked.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
