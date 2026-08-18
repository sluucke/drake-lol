







export const SESSION_ROUTE = '/lol-champ-select/v1/session';

export function actionRoute(actionId) {
  return `/lol-champ-select/v1/session/actions/${actionId}`;
}

function eachAction(session) {
  const phases = (session && session.actions) || [];
  return phases.flat ? phases.flat() : [].concat(...phases);
}






export function findMyAction(session, type) {
  if (!session || session.localPlayerCellId === undefined) return null;
  for (const a of eachAction(session)) {
    if (a.type !== type) continue;
    if (a.actorCellId !== session.localPlayerCellId) continue;
    if (a.completed) continue;
    if (!a.isInProgress) continue;
    return a;
  }
  return null;
}

export function isBanPhase(session) {
  return eachAction(session).some((a) => a.type === 'ban' && a.isInProgress && !a.completed);
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

export function makeChampSelect({ lcu }) {
  return {
    
    
    async commit(actionId, championId, completed) {
      try {
        const res = await lcu.patch(actionRoute(actionId), { championId, completed });
        if (res && res.ok === false) {
          
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
