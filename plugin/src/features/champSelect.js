// Reading and acting on champ select.
//
// `session.actions` is an array of PHASES, each an array of actions -- bans in
// one phase, picks in another, with every player's action for that phase in
// the same inner array. So an action is only ours when `actorCellId` matches
// `localPlayerCellId`; matching on type alone would act on somebody else's
// turn.

export const SESSION_ROUTE = '/lol-champ-select/v1/session';

export function actionRoute(actionId) {
  return `/lol-champ-select/v1/session/actions/${actionId}`;
}

function eachAction(session) {
  const phases = (session && session.actions) || [];
  return phases.flat ? phases.flat() : [].concat(...phases);
}

/// Our pending action of `type`, or null.
///
/// "Pending" means in progress and not completed: the client rejects a write
/// to a phase that has not started, and re-completing a finished action is
/// both wrong and noisy.
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

/// Champions that cannot be picked right now: already banned, or already
/// locked by someone. A hover does not count — two players can hover the
/// same champion until one of them locks.
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
    /// `completed: false` hovers (visible to the team, still reversible);
    /// `true` locks it in.
    async commit(actionId, championId, completed) {
      try {
        const res = await lcu.patch(actionRoute(actionId), { championId, completed });
        if (res && res.ok === false) {
          // 409 is the usual one: the champion is already taken or banned.
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
